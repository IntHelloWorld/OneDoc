import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { AgentPanel } from "./components/AgentPanel";
import { DocumentCanvas } from "./components/DocumentCanvas";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { SettingsModal } from "./components/SettingsModal";
import { StyleStudioModal } from "./components/StyleStudioModal";
import { TitleBar } from "./components/TitleBar";
import { initPiSidecar } from "./lib/agentEngine";
import { isTauriRuntime } from "./lib/tauriBridge";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const [promptSignal, setPromptSignal] = useState<{
    nonce: number;
    blockId: string;
  } | null>(null);

  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const workspacePath = useAppStore((s) => s.workspacePath);
  const loadWorkspace = useAppStore((s) => s.loadWorkspace);
  const saveActiveFile = useAppStore((s) => s.saveActiveFile);
  const undo = useAppStore((s) => s.undo);

  useEffect(() => {
    if (isTauriRuntime()) {
      void initPiSidecar();
      if (workspacePath) {
        void loadWorkspace(workspacePath);
      }
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActiveFile();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !e.shiftKey
      ) {
        const tag = (e.target as HTMLElement)?.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          (e.target as HTMLElement)?.closest?.(".cm-editor");
        if (!isEditable) {
          e.preventDefault();
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveActiveFile, undo]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#FAFAFB] text-zinc-900 antialiased">
      <TitleBar />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <FileTreeSidebar />
        <DocumentCanvas
          onFocusPromptForBlock={(blockId) =>
            setPromptSignal({ nonce: Date.now(), blockId })
          }
        />
        <AgentPanel externalPromptSignal={promptSignal} />
      </div>

      <StyleStudioModal />
      <SettingsModal />

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] pointer-events-none px-4 max-w-[92vw]"
        >
          <div
            className={`pointer-events-auto animate-toast-in flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-xl bg-zinc-900/95 backdrop-blur-md text-zinc-50 border shadow-[0_12px_32px_-8px_rgba(15,23,42,0.35),0_1px_3px_rgba(15,23,42,0.2)] text-xs font-medium ${
              toast.type === "error"
                ? "border-rose-500/35"
                : toast.type === "success"
                ? "border-emerald-500/25"
                : "border-zinc-700/80"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                toast.type === "success"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : toast.type === "error"
                  ? "bg-rose-500/15 text-rose-400"
                  : "bg-indigo-500/20 text-indigo-300"
              }`}
            >
              {toast.type === "success" ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : toast.type === "error" ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <Info className="w-3.5 h-3.5" />
              )}
            </span>
            <span className="max-w-md truncate leading-snug text-zinc-100">
              {toast.text}
            </span>
            <button
              type="button"
              onClick={clearToast}
              aria-label="关闭通知"
              className="ml-0.5 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
