use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSidecarStatus {
    pub running: bool,
    pub entry_path: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Default)]
struct SidecarInner {
    child: Option<Child>,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    running: bool,
    entry_path: Option<String>,
    last_error: Option<String>,
}

#[derive(Clone, Default)]
pub struct PiSidecarManager {
    inner: Arc<Mutex<SidecarInner>>,
}

pub fn resolve_sidecar_entry_from_candidates(
    cwd: Option<&Path>,
    exe_dir: Option<&Path>,
    resource_dir: Option<&Path>,
) -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("ONEDOC_PI_SIDECAR_PATH") {
        let p = PathBuf::from(explicit);
        if p.exists() {
            return Some(p);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(c) = cwd {
        candidates.push(c.join("agent-sidecar").join("dist").join("server.js"));
        if let Some(parent) = c.parent() {
            candidates.push(parent.join("agent-sidecar").join("dist").join("server.js"));
        }
    }
    if let Some(exe) = exe_dir {
        candidates.push(exe.join("agent-sidecar").join("dist").join("server.js"));
    }
    if let Some(res) = resource_dir {
        candidates.push(res.join("agent-sidecar").join("dist").join("server.js"));
    }

    candidates.into_iter().find(|p| p.exists())
}

pub fn resolve_sidecar_entry(app: &AppHandle) -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().ok();
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let resource_dir = app.path().resource_dir().ok();

    resolve_sidecar_entry_from_candidates(
        cwd.as_deref(),
        exe_dir.as_deref(),
        resource_dir.as_deref(),
    )
    .ok_or_else(|| {
        "未找到 Pi Agent Sidecar 入口 (agent-sidecar/dist/server.js)，请先运行 npm run build:sidecar"
            .to_string()
    })
}

impl PiSidecarManager {
    pub async fn status(&self) -> PiSidecarStatus {
        let mut guard = self.inner.lock().await;
        if let Some(ref mut child) = guard.child {
            match child.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    guard.running = false;
                    guard.child = None;
                    guard.stdin = None;
                }
                Ok(None) => {
                    guard.running = true;
                }
            }
        }
        PiSidecarStatus {
            running: guard.running,
            entry_path: guard.entry_path.clone(),
            last_error: guard.last_error.clone(),
        }
    }

    pub async fn start(&self, app: &AppHandle) -> Result<PiSidecarStatus, String> {
        {
            let current = self.status().await;
            if current.running {
                return Ok(current);
            }
        }

        let entry = resolve_sidecar_entry(app)?;
        let node_bin = std::env::var("ONEDOC_NODE_PATH").unwrap_or_else(|_| "node".to_string());

        let mut cmd = Command::new(&node_bin);
        cmd.arg(&entry)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|e| {
            format!("启动 Pi Agent Sidecar 失败 (node={node_bin}): {e}")
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "无法获取 Sidecar stdin 管道".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "无法获取 Sidecar stdout 管道".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "无法获取 Sidecar stderr 管道".to_string())?;

        let entry_str = entry.to_string_lossy().to_string();
        let stdin_arc = Arc::new(Mutex::new(stdin));

        {
            let mut guard = self.inner.lock().await;
            guard.child = Some(child);
            guard.stdin = Some(stdin_arc);
            guard.running = true;
            guard.entry_path = Some(entry_str.clone());
            guard.last_error = None;
        }

        // Stdout JSON-Line reader
        let app_stdout = app.clone();
        let inner_stdout = self.inner.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(trimmed) {
                    Ok(val) => {
                        let ev_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if ev_type == "tool_call_request" {
                            let _ = app_stdout.emit("pi-tool-request", val);
                        } else {
                            let _ = app_stdout.emit("pi-agent-event", val);
                        }
                    }
                    Err(err) => {
                        let mut g = inner_stdout.lock().await;
                        g.last_error = Some(format!("解析 Sidecar 输出失败: {err}"));
                    }
                }
            }
            let mut g = inner_stdout.lock().await;
            g.running = false;
            g.stdin = None;
        });

        // Stderr diagnostics reader
        let inner_stderr = self.inner.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    let mut g = inner_stderr.lock().await;
                    g.last_error = Some(trimmed.to_string());
                }
            }
        });

        Ok(PiSidecarStatus {
            running: true,
            entry_path: Some(entry_str),
            last_error: None,
        })
    }

    pub async fn send_command(&self, app: &AppHandle, command_json: String) -> Result<(), String> {
        let stdin_arc = {
            let mut needs_start = false;
            let mut maybe_stdin = None;
            {
                let mut guard = self.inner.lock().await;
                if let Some(ref mut child) = guard.child {
                    if let Ok(None) = child.try_wait() {
                        maybe_stdin = guard.stdin.clone();
                    } else {
                        guard.running = false;
                        guard.child = None;
                        guard.stdin = None;
                        needs_start = true;
                    }
                } else {
                    needs_start = true;
                }
            }
            if needs_start || maybe_stdin.is_none() {
                self.start(app).await?;
                let guard = self.inner.lock().await;
                guard
                    .stdin
                    .clone()
                    .ok_or_else(|| "Sidecar stdin 不可用".to_string())?
            } else {
                maybe_stdin.unwrap()
            }
        };

        let mut writer = stdin_arc.lock().await;
        let clean = command_json.trim_end_matches(&['\r', '\n'][..]);
        writer
            .write_all(clean.as_bytes())
            .await
            .map_err(|e| format!("写入 Sidecar 指令失败: {e}"))?;
        writer
            .write_all(b"\n")
            .await
            .map_err(|e| format!("写入换行失败: {e}"))?;
        writer
            .flush()
            .await
            .map_err(|e| format!("刷新 Sidecar 管道失败: {e}"))?;
        Ok(())
    }

    pub async fn stop(&self) {
        let mut guard = self.inner.lock().await;
        guard.running = false;
        guard.stdin = None;
        if let Some(mut child) = guard.child.take() {
            let _ = child.start_kill();
            let _ = child.wait().await;
        }
    }

    pub fn stop_sync(&self) {
        if let Ok(mut guard) = self.inner.try_lock() {
            guard.running = false;
            guard.stdin = None;
            if let Some(mut child) = guard.child.take() {
                let _ = child.start_kill();
            }
        }
    }
}

#[tauri::command]
pub async fn pi_sidecar_status(
    manager: State<'_, PiSidecarManager>,
) -> Result<PiSidecarStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn pi_start_sidecar(
    app: AppHandle,
    manager: State<'_, PiSidecarManager>,
) -> Result<PiSidecarStatus, String> {
    manager.start(&app).await
}

#[tauri::command]
pub async fn pi_send_command(
    app: AppHandle,
    manager: State<'_, PiSidecarManager>,
    command_json: String,
) -> Result<(), String> {
    manager.send_command(&app, command_json).await
}

#[tauri::command]
pub async fn pi_stop_sidecar(manager: State<'_, PiSidecarManager>) -> Result<(), String> {
    manager.stop().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_sidecar_entry_from_repo_and_src_tauri() {
        let tmp = std::env::temp_dir().join("onedoc_sidecar_resolve_test");
        let _ = std::fs::remove_dir_all(&tmp);
        let entry = tmp.join("agent-sidecar").join("dist").join("server.js");
        std::fs::create_dir_all(entry.parent().unwrap()).unwrap();
        std::fs::write(&entry, "// test").unwrap();

        let src_tauri_dir = tmp.join("src-tauri");
        std::fs::create_dir_all(&src_tauri_dir).unwrap();

        let found_from_root =
            resolve_sidecar_entry_from_candidates(Some(&tmp), None, None);
        assert_eq!(found_from_root.as_deref(), Some(entry.as_path()));

        let found_from_tauri =
            resolve_sidecar_entry_from_candidates(Some(&src_tauri_dir), None, None);
        assert_eq!(found_from_tauri.as_deref(), Some(entry.as_path()));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
