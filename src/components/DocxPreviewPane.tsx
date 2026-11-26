import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { FileOutput, Loader2, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { isTauriRuntime, readFileBase64 } from "../lib/tauriBridge";
import { useAppStore } from "../store/useAppStore";

interface DocxPreviewPaneProps {
  filePath: string;
  fileName: string;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function DocxPreviewPane({ filePath, fileName }: DocxPreviewPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.9);

  const extractStyleFromDocxDialog = useAppStore(
    (s) => s.extractStyleFromDocxDialog
  );
  const importDocxAsActiveDocument = useAppStore(
    (s) => s.importDocxAsActiveDocument
  );

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!hostRef.current) return;
      if (!isTauriRuntime()) {
        setError("当前不在 Tauri 桌面端运行时，无法读取本地 .docx 二进制流。");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      hostRef.current.innerHTML = "";
      try {
        const b64 = await readFileBase64(filePath);
        if (cancelled || !hostRef.current) return;
        const bytes = base64ToUint8Array(b64);
        await renderAsync(bytes.buffer, hostRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
      } catch (e) {
        if (!cancelled) {
          setError(`渲染 .docx 失败: ${String(e)}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return (
    <div className="h-full flex flex-col bg-[#EEF1F5]">
      {/* Top action banner */}
      <div className="h-11 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70">
            DOCX 原生预览
          </span>
          <span className="text-xs font-medium text-slate-700 truncate">
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 rounded-md px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.55, z - 0.1))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-medium text-slate-600 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
              className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void extractStyleFromDocxDialog(filePath)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>提取样式为模板</span>
          </button>

          <button
            type="button"
            onClick={() => void importDocxAsActiveDocument(filePath)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            <FileOutput className="w-3.5 h-3.5" />
            <span>导入为可编辑文档</span>
          </button>
        </div>
      </div>

      {/* Render host */}
      <div className="flex-1 overflow-auto p-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            <span>正在解析并分页渲染 Word 文档...</span>
          </div>
        )}
        {error && (
          <div className="max-w-lg mx-auto mt-10 p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
          }}
          className="transition-transform duration-150"
        >
          <div ref={hostRef} className="select-text" />
        </div>
      </div>
    </div>
  );
}
