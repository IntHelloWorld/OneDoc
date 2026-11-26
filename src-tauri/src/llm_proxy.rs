use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

#[derive(Default)]
pub struct StreamRegistry {
    cancels: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamChunkPayload {
    request_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamDonePayload {
    request_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamErrorPayload {
    request_id: String,
    error: String,
}

fn build_endpoint(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

#[tauri::command]
pub async fn llm_chat_stream(
    app: AppHandle,
    registry: State<'_, StreamRegistry>,
    request_id: String,
    base_url: String,
    api_key: String,
    payload_json: String,
) -> Result<(), String> {
    let endpoint = build_endpoint(&base_url);
    let body_value: serde_json::Value =
        serde_json::from_str(&payload_json).map_err(|e| format!("无效请求体 JSON: {e}"))?;

    let (tx, mut rx) = oneshot::channel::<()>();
    {
        let mut map = registry
            .cancels
            .lock()
            .map_err(|_| "StreamRegistry poisoned".to_string())?;
        map.insert(request_id.clone(), tx);
    }

    let cancels_ref = registry.cancels.clone();
    let req_id_clone = request_id.clone();

    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build();

        let client = match client {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "llm-stream-error",
                    StreamErrorPayload {
                        request_id: req_id_clone.clone(),
                        error: format!("创建 HTTP 客户端失败: {e}"),
                    },
                );
                if let Ok(mut m) = cancels_ref.lock() {
                    m.remove(&req_id_clone);
                }
                return;
            }
        };

        let mut req = client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .json(&body_value);

        if !api_key.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
        }

        let response = tokio::select! {
            _ = &mut rx => {
                let _ = app.emit("llm-stream-done", StreamDonePayload { request_id: req_id_clone.clone() });
                if let Ok(mut m) = cancels_ref.lock() {
                    m.remove(&req_id_clone);
                }
                return;
            }
            res = req.send() => res,
        };

        let resp = match response {
            Ok(r) => r,
            Err(e) => {
                let _ = app.emit(
                    "llm-stream-error",
                    StreamErrorPayload {
                        request_id: req_id_clone.clone(),
                        error: format!("请求模型接口失败: {e}"),
                    },
                );
                if let Ok(mut m) = cancels_ref.lock() {
                    m.remove(&req_id_clone);
                }
                return;
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            let _ = app.emit(
                "llm-stream-error",
                StreamErrorPayload {
                    request_id: req_id_clone.clone(),
                    error: format!("API 返回错误 ({status}): {err_text}"),
                },
            );
            if let Ok(mut m) = cancels_ref.lock() {
                m.remove(&req_id_clone);
            }
            return;
        }

        let mut stream = resp.bytes_stream();
        let mut line_buf = String::new();

        loop {
            let chunk_opt = tokio::select! {
                _ = &mut rx => {
                    break;
                }
                item = stream.next() => item,
            };

            let Some(chunk_res) = chunk_opt else {
                break;
            };

            match chunk_res {
                Ok(bytes) => {
                    let s = String::from_utf8_lossy(&bytes);
                    line_buf.push_str(&s);
                    while let Some(pos) = line_buf.find('\n') {
                        let line = line_buf[..pos].trim_end_matches('\r').to_string();
                        line_buf.drain(..=pos);
                        if let Some(data) = line.strip_prefix("data:") {
                            let trimmed = data.trim();
                            if trimmed == "[DONE]" {
                                let _ = app.emit(
                                    "llm-stream-done",
                                    StreamDonePayload {
                                        request_id: req_id_clone.clone(),
                                    },
                                );
                                if let Ok(mut m) = cancels_ref.lock() {
                                    m.remove(&req_id_clone);
                                }
                                return;
                            }
                            if !trimmed.is_empty() {
                                let _ = app.emit(
                                    "llm-stream-chunk",
                                    StreamChunkPayload {
                                        request_id: req_id_clone.clone(),
                                        data: trimmed.to_string(),
                                    },
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app.emit(
                        "llm-stream-error",
                        StreamErrorPayload {
                            request_id: req_id_clone.clone(),
                            error: format!("读取流式响应中断: {e}"),
                        },
                    );
                    break;
                }
            }
        }

        let _ = app.emit(
            "llm-stream-done",
            StreamDonePayload {
                request_id: req_id_clone.clone(),
            },
        );
        if let Ok(mut m) = cancels_ref.lock() {
            m.remove(&req_id_clone);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn llm_cancel_stream(
    registry: State<'_, StreamRegistry>,
    request_id: String,
) -> Result<(), String> {
    if let Ok(mut map) = registry.cancels.lock() {
        if let Some(tx) = map.remove(&request_id) {
            let _ = tx.send(());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn llm_test_connection(
    base_url: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    let endpoint = build_endpoint(&base_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("客户端初始化失败: {e}"))?;

    let payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Reply with OK"}],
        "max_tokens": 8,
        "stream": false
    });

    let mut req = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&payload);

    if !api_key.trim().is_empty() {
        req = req.header("Authorization", format!("Bearer {}", api_key.trim()));
    }

    let resp = req.send().await.map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("接口返回 ({status}): {text}"));
    }
    Ok("连接成功，模型接口响应正常".to_string())
}
