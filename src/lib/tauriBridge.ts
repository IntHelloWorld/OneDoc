import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { PiSidecarStatus } from "../types/agent";
import type { DocDocument } from "../types/document";
import type { ExtractedStyleResult, StyleProfile } from "../types/style";
import type { FileTreeNode, WorkspaceFileContent } from "../types/workspace";

export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 OneDoc 文档工作区目录",
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickDocxFile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    multiple: false,
    title: "选择参考 .docx 范文文件",
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickSaveDocxPath(defaultName: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const cleanName = defaultName.replace(/[\\/:*?"<>|]/g, "_") || "document";
  const selected = await save({
    title: "导出 Word 文档 (.docx)",
    defaultPath: cleanName.endsWith(".docx") ? cleanName : `${cleanName}.docx`,
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function scanWorkspace(rootPath: string): Promise<FileTreeNode[]> {
  return invoke<FileTreeNode[]>("scan_workspace", { rootPath });
}

export async function readWorkspaceFile(path: string): Promise<WorkspaceFileContent> {
  return invoke<WorkspaceFileContent>("read_workspace_file", { path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke<void>("write_text_file", { path, content });
}

export async function readFileBase64(path: string): Promise<string> {
  return invoke<string>("read_file_base64", { path });
}

export async function deleteWorkspaceFile(
  workspaceRoot: string,
  filePath: string
): Promise<void> {
  return invoke<void>("delete_workspace_file", { workspaceRoot, filePath });
}

export async function loadWorkspaceStyles(rootPath: string): Promise<StyleProfile[]> {
  return invoke<StyleProfile[]>("load_workspace_styles", { rootPath });
}

export async function saveWorkspaceStyle(
  rootPath: string,
  profile: StyleProfile
): Promise<void> {
  return invoke<void>("save_workspace_style", { rootPath, profile });
}

export async function createSampleWorkspace(targetDir: string): Promise<string> {
  return invoke<string>("create_sample_workspace", { targetDir });
}

export async function exportDocx(
  doc: DocDocument,
  style: StyleProfile,
  outputPath: string
): Promise<string> {
  return invoke<string>("export_docx", { doc, style, outputPath });
}

export async function extractDocxStyleProfile(
  path: string,
  baseProfile: StyleProfile
): Promise<ExtractedStyleResult> {
  return invoke<ExtractedStyleResult>("extract_docx_style_profile", {
    path,
    baseProfile,
  });
}

export async function importDocxToAst(
  path: string,
  styleProfileId: string
): Promise<DocDocument> {
  return invoke<DocDocument>("import_docx_to_ast", { path, styleProfileId });
}

export async function extractDocxText(path: string): Promise<string> {
  return invoke<string>("extract_docx_text", { path });
}

export async function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}

export async function llmChatStream(params: {
  requestId: string;
  baseUrl: string;
  apiKey: string;
  payloadJson: string;
}): Promise<void> {
  return invoke<void>("llm_chat_stream", params);
}

export async function llmCancelStream(requestId: string): Promise<void> {
  return invoke<void>("llm_cancel_stream", { requestId });
}

export async function llmTestConnection(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  return invoke<string>("llm_test_connection", params);
}

export interface StreamListeners {
  onChunk: (data: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export async function subscribeLlmStream(
  requestId: string,
  handlers: StreamListeners
): Promise<() => void> {
  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen<{ requestId: string; data: string }>("llm-stream-chunk", (ev) => {
      if (ev.payload.requestId === requestId) {
        handlers.onChunk(ev.payload.data);
      }
    })
  );

  unlisteners.push(
    await listen<{ requestId: string }>("llm-stream-done", (ev) => {
      if (ev.payload.requestId === requestId) {
        handlers.onDone();
      }
    })
  );

  unlisteners.push(
    await listen<{ requestId: string; error: string }>("llm-stream-error", (ev) => {
      if (ev.payload.requestId === requestId) {
        handlers.onError(ev.payload.error);
      }
    })
  );

  return () => {
    unlisteners.forEach((u) => u());
  };
}

export async function piSidecarStatus(): Promise<PiSidecarStatus> {
  return invoke<PiSidecarStatus>("pi_sidecar_status");
}

export async function piStartSidecar(): Promise<PiSidecarStatus> {
  return invoke<PiSidecarStatus>("pi_start_sidecar");
}

export async function piSendCommand(command: Record<string, unknown>): Promise<void> {
  return invoke<void>("pi_send_command", {
    commandJson: JSON.stringify(command),
  });
}

export async function piStopSidecar(): Promise<void> {
  return invoke<void>("pi_stop_sidecar");
}

export async function subscribePiAgentEvent(
  handler: (event: Record<string, unknown>) => void
): Promise<UnlistenFn> {
  return listen<Record<string, unknown>>("pi-agent-event", (ev) => {
    handler(ev.payload);
  });
}

export async function subscribePiToolRequest(
  handler: (req: { callId: string; name: string; args: unknown }) => void
): Promise<UnlistenFn> {
  return listen<{ callId: string; name: string; args: unknown }>(
    "pi-tool-request",
    (ev) => {
      handler(ev.payload);
    }
  );
}
