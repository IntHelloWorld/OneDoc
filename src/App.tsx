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
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#F6F7F9] text-slate-900">
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
        <div className="fixed bottom-9 left-1/2 -translate-x-1/2 z-[60]">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg border text-xs font-medium ${
              toast.type === "success"
                ? "bg-emerald-900 text-white border-emerald-700"
                : toast.type === "error"
                ? "bg-red-900 text-white border-red-700"
                : "bg-slate-900 text-white border-slate-700"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-blue-300 shrink-0" />
            )}
            <span className="max-w-md truncate">{toast.text}</span>
            <button
              type="button"
              onClick={clearToast}
              className="ml-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
