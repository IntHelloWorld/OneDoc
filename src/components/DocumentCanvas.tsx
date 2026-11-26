import { ZoomIn, ZoomOut } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { CodeEditor } from "./CodeEditor";
import { DocxPreviewPane } from "./DocxPreviewPane";
import { PagedPreview } from "./PagedPreview";

interface DocumentCanvasProps {
  onFocusPromptForBlock?: (blockId: string) => void;
}

export function DocumentCanvas({ onFocusPromptForBlock }: DocumentCanvasProps) {
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const activeFileKind = useAppStore((s) => s.activeFileKind);
  const viewMode = useAppStore((s) => s.viewMode);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const rawText = useAppStore((s) => s.rawText);
  const doc = useAppStore((s) => s.document);
  const updateRawText = useAppStore((s) => s.updateRawText);
  const saveActiveFile = useAppStore((s) => s.saveActiveFile);
  const getActiveStyle = useAppStore((s) => s.getActiveStyle);
  const activeStyleId = useAppStore((s) => s.activeStyleId);
  const customStyles = useAppStore((s) => s.customStyles);

  void activeStyleId;
  void customStyles;

  if (activeFileKind === "docx" && activeFilePath) {
    return <DocxPreviewPane filePath={activeFilePath} fileName={activeFileName} />;
  }

  const activeStyle = getActiveStyle();
  const charCount = doc.blocks.reduce((acc, b) => {
    if ("text" in b && typeof b.text === "string") return acc + b.text.length;
    if (b.type === "paragraph")
      return acc + b.runs.reduce((s, r) => s + r.text.length, 0);
    return acc;
  }, 0);

  return (
    <main className="flex-1 min-w-0 flex flex-col h-full bg-[#EEF1F5]">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {(viewMode === "source" || viewMode === "split") && (
          <div
            className={`${
              viewMode === "split"
                ? "w-1/2 border-r border-slate-200"
                : "w-full"
            } h-full min-w-0`}
          >
            <CodeEditor
              value={rawText}
              onChange={updateRawText}
              onSave={() => void saveActiveFile()}
              isMarkdown={activeFileKind !== "txt"}
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div className={viewMode === "split" ? "w-1/2 h-full" : "w-full h-full"}>
            <PagedPreview onFocusPromptForBlock={onFocusPromptForBlock} />
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <footer className="h-7 shrink-0 bg-white border-t border-slate-200 px-3 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span>
            版式: <strong className="font-medium text-slate-700">{activeStyle.page.size}</strong> ({activeStyle.page.widthMm}×{activeStyle.page.heightMm}mm)
          </span>
          <span>
            正文: <strong className="font-medium text-slate-700">{activeStyle.typography.body.fontZh}</strong> {activeStyle.typography.body.sizePt}pt
          </span>
          <span>区块: {doc.blocks.length}</span>
          <span>字数: {charCount}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-slate-400">
            单击区块选中 · 双击直接微调文字
          </span>
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={() => setZoom(zoom - 0.1)}
              className="p-0.5 hover:text-slate-800 cursor-pointer"
              title="缩小预览"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="w-9 text-center font-medium text-slate-700">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(zoom + 0.1)}
              className="p-0.5 hover:text-slate-800 cursor-pointer"
              title="放大预览"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
