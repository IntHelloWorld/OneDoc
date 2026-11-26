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
    <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#F2F3F5]">
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {(viewMode === "source" || viewMode === "split") && (
          <div
            className={`${
              viewMode === "split"
                ? "w-1/2 border-r border-zinc-200/75"
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
          <div
            className={
              viewMode === "split"
                ? "w-1/2 h-full min-w-0"
                : "w-full h-full min-w-0"
            }
          >
            <PagedPreview onFocusPromptForBlock={onFocusPromptForBlock} />
          </div>
        )}
      </div>

      {/* Bottom status bar — Quiet Precision */}
      <footer className="h-8 shrink-0 bg-white/95 backdrop-blur-xs border-t border-zinc-200/75 px-3.5 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden tabular-nums">
          <span className="truncate">
            版式{" "}
            <strong className="font-medium text-zinc-800">
              {activeStyle.page.size}
            </strong>{" "}
            <span className="text-zinc-400">
              ({activeStyle.page.widthMm}×{activeStyle.page.heightMm}mm)
            </span>
          </span>
          <span className="w-px h-3 bg-zinc-200/80 shrink-0" />
          <span className="truncate">
            正文{" "}
            <strong className="font-medium text-zinc-800">
              {activeStyle.typography.body.fontZh}
            </strong>{" "}
            <span className="text-zinc-600">
              {activeStyle.typography.body.sizePt}pt
            </span>
          </span>
          <span className="w-px h-3 bg-zinc-200/80 shrink-0 hidden sm:inline-block" />
          <span className="shrink-0 hidden sm:inline">
            区块 <strong className="font-medium text-zinc-800">{doc.blocks.length}</strong>
          </span>
          <span className="shrink-0">
            字数 <strong className="font-medium text-zinc-800">{charCount}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden lg:inline text-zinc-400">
            单击区块选中 · 双击直接微调文字
          </span>
          <div className="flex items-center gap-0.5 bg-zinc-100/80 border border-zinc-200/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setZoom(zoom - 0.1)}
              className="p-0.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-white/80 transition-colors cursor-pointer"
              title="缩小预览"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[40px] px-1 text-center font-medium text-zinc-700 hover:text-zinc-900 hover:bg-white/80 rounded-md tabular-nums transition-colors cursor-pointer"
              title="重置缩放为 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom(zoom + 0.1)}
              className="p-0.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-white/80 transition-colors cursor-pointer"
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
