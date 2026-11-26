pub mod docx_compiler;
pub mod docx_inspector;
pub mod llm_proxy;
pub mod models;
pub mod pi_sidecar;
pub mod workspace;

use llm_proxy::StreamRegistry;
use models::{
    DocDocument, ExtractedStyleResult, FileTreeNode, StyleProfile, WorkspaceFileContent,
};
use pi_sidecar::PiSidecarManager;
use tauri::Manager;

#[tauri::command]
fn scan_workspace(root_path: String) -> Result<Vec<FileTreeNode>, String> {
    workspace::scan_workspace(&root_path)
}

#[tauri::command]
fn read_workspace_file(path: String) -> Result<WorkspaceFileContent, String> {
    workspace::read_workspace_file(&path)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    workspace::read_text_file(&path)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    workspace::write_text_file(&path, &content)
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    workspace::read_file_base64(&path)
}

#[tauri::command]
fn delete_workspace_file(workspace_root: String, file_path: String) -> Result<(), String> {
    workspace::delete_workspace_file(&workspace_root, &file_path)
}

#[tauri::command]
fn load_workspace_styles(root_path: String) -> Result<Vec<StyleProfile>, String> {
    workspace::load_workspace_styles(&root_path)
}

#[tauri::command]
fn save_workspace_style(root_path: String, profile: StyleProfile) -> Result<(), String> {
    workspace::save_workspace_style(&root_path, &profile)
}

#[tauri::command]
fn create_sample_workspace(target_dir: String) -> Result<String, String> {
    workspace::create_sample_workspace(&target_dir)
}

#[tauri::command]
fn export_docx(
    doc: DocDocument,
    style: StyleProfile,
    output_path: String,
) -> Result<String, String> {
    docx_compiler::compile_docx_to_file(&doc, &style, &output_path)
}

#[tauri::command]
fn extract_docx_style_profile(
    path: String,
    base_profile: StyleProfile,
) -> Result<ExtractedStyleResult, String> {
    docx_inspector::extract_docx_style_profile(&path, base_profile)
}

#[tauri::command]
fn import_docx_to_ast(path: String, style_profile_id: String) -> Result<DocDocument, String> {
    docx_inspector::import_docx_to_ast(&path, &style_profile_id)
}

#[tauri::command]
fn extract_docx_text(path: String) -> Result<String, String> {
    docx_inspector::extract_docx_text(&path)
}

fn validate_external_url(url: &str) -> Result<&str, String> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Ok(trimmed)
    } else {
        Err("仅允许在系统浏览器中打开 http:// 或 https:// 链接".to_string())
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let clean = validate_external_url(&url)?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Start-Process -FilePath $env:ONEDOC_OPEN_URL",
            ])
            .env("ONEDOC_OPEN_URL", clean)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("无法拉起系统浏览器: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(clean)
            .spawn()
            .map_err(|e| format!("无法拉起系统浏览器: {e}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(clean)
            .spawn()
            .map_err(|e| format!("无法拉起系统浏览器: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_external_url() {
        assert!(validate_external_url("https://claude.ai/oauth/authorize?a=1&b=2").is_ok());
        assert!(validate_external_url("http://127.0.0.1:53692/callback").is_ok());
        assert!(validate_external_url("file:///C:/Windows/System32").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(StreamRegistry::default())
        .manage(PiSidecarManager::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_workspace,
            read_workspace_file,
            read_text_file,
            write_text_file,
            read_file_base64,
            delete_workspace_file,
            load_workspace_styles,
            save_workspace_style,
            create_sample_workspace,
            export_docx,
            extract_docx_style_profile,
            import_docx_to_ast,
            extract_docx_text,
            open_external_url,
            llm_proxy::llm_chat_stream,
            llm_proxy::llm_cancel_stream,
            llm_proxy::llm_test_connection,
            pi_sidecar::pi_sidecar_status,
            pi_sidecar::pi_start_sidecar,
            pi_sidecar::pi_send_command,
            pi_sidecar::pi_stop_sidecar,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let mgr = app_handle.state::<PiSidecarManager>();
            mgr.stop_sync();
        }
    });
}
