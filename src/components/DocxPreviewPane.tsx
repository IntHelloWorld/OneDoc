import { useCallback, useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import {
  FileOutput,
  FileText,
  Loader2,
  Maximize2,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  paginateDocxContainer,
  waitForDocxResources,
} from "../lib/docxPaginator";
import { isTauriRuntime, readFileBase64 } from "../lib/tauriBridge";
import { useAppStore } from "../store/useAppStore";
import "./docx-preview.css";

interface DocxPreviewPaneProps {
  filePath: string;
  fileName: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  const extractStyleFromDocxDialog = useAppStore(
    (s) => s.extractStyleFromDocxDialog
  );
  const importDocxAsActiveDocument = useAppStore(
    (s) => s.importDocxAsActiveDocument
  );

  const measureNaturalSize = useCallback(() => {
    const host = hostRef.current;
    if (!host) return { width: 0, height: 0 };
    const wrapper = host.querySelector<HTMLElement>(".docx-wrapper");
    const target = wrapper ?? host;
    const sections = target.querySelectorAll<HTMLElement>(":scope > section.docx");
    let maxSectionWidth = 0;
    sections.forEach((sec) => {
      if (sec.offsetWidth > maxSectionWidth) {
        maxSectionWidth = sec.offsetWidth;
      }
    });
    const width =
      maxSectionWidth > 0
        ? maxSectionWidth
        : Math.max(target.offsetWidth, target.scrollWidth);
    const height = Math.max(target.offsetHeight, target.scrollHeight);
    if (width > 0 && height > 0) {
      setNaturalSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height }
      );
    }
    return { width, height };
  }, []);

  const fitToWidth = useCallback(
    (explicitDocWidth?: number) => {
      const viewport = scrollRef.current;
      const docWidth = explicitDocWidth ?? naturalSize.width;
      if (!viewport || docWidth <= 0) return;
      // Leave horizontal breathing room (48px padding + 16px visual margin).
      const availableWidth = Math.max(240, viewport.clientWidth - 64);
      const fitted = clampZoom(Math.min(1, availableWidth / docWidth));
      setZoom(fitted);
    },
    [naturalSize.width]
  );

  // Render DOCX and run post-render pagination
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!hostRef.current) return;
      if (!isTauriRuntime()) {
        setError("当前不在 Tauri 桌面端运行时，无法读取本地 .docx 二进制流。");
        setLoading(false);
        setPageCount(0);
        setCurrentPage(1);
        return;
      }

      setLoading(true);
      setError(null);
      setPageCount(0);
      setCurrentPage(1);
      setNaturalSize({ width: 0, height: 0 });
      hostRef.current.innerHTML = "";
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }

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
        if (cancelled || !hostRef.current) return;

        // Wait for fonts & embedded images before measuring/paginating sections
        await waitForDocxResources(hostRef.current);
        if (cancelled || !hostRef.current) return;

        const result = paginateDocxContainer(hostRef.current);
        if (cancelled || !hostRef.current) return;

        setPageCount(result.pageCount);
        setCurrentPage(result.pageCount > 0 ? 1 : 0);

        const measured = measureNaturalSize();
        const docWidth = measured.width || result.pageWidthPx;

        // Auto-fit gracefully on narrow viewports while defaulting to a crisp 90% on wide desktops
        if (scrollRef.current && docWidth > 0) {
          const availableWidth = Math.max(240, scrollRef.current.clientWidth - 64);
          const fitRatio = availableWidth / docWidth;
          setZoom(fitRatio < 0.9 ? clampZoom(fitRatio) : 0.9);
        }
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
  }, [filePath, measureNaturalSize]);

  // Keep scaled container dimensions synchronized if fonts/images settle asynchronously
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureNaturalSize();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [measureNaturalSize]);

  // Track current visible page on scroll
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || pageCount <= 0) return;

    let rafId = 0;
    const updateVisiblePage = () => {
      rafId = 0;
      const host = hostRef.current;
      if (!host) return;
      const pages = host.querySelectorAll<HTMLElement>(
        ".docx-wrapper > section.docx"
      );
      if (pages.length === 0) return;

      const viewportRect = scrollEl.getBoundingClientRect();
      const focalY = viewportRect.top + viewportRect.height * 0.35;

      let activeIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;

      pages.forEach((pageEl, idx) => {
        const rect = pageEl.getBoundingClientRect();
        if (rect.top <= focalY && rect.bottom >= focalY) {
          activeIdx = idx;
          bestDist = 0;
          return;
        }
        const dist = Math.min(
          Math.abs(rect.top - focalY),
          Math.abs(rect.bottom - focalY)
        );
        if (dist < bestDist) {
          bestDist = dist;
          activeIdx = idx;
        }
      });

      setCurrentPage(activeIdx + 1);
    };

    const onScroll = () => {
      if (rafId === 0) {
        rafId = requestAnimationFrame(updateVisiblePage);
      }
    };

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    updateVisiblePage();

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [pageCount, zoom]);

  const scaledWidth =
    naturalSize.width > 0 ? Math.ceil(naturalSize.width * zoom) : undefined;
  const scaledHeight =
    naturalSize.height > 0 ? Math.ceil(naturalSize.height * zoom) : undefined;

  return (
    <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-[#F2F3F5]">
      {/* Top action toolbar — Quiet Precision (container-query responsive to middle pane width) */}
      <div className="@container w-full h-11 shrink-0 bg-white/95 backdrop-blur-xs border-b border-zinc-200/75 px-3.5 flex items-center justify-between gap-2.5 overflow-hidden">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50/80 text-indigo-700 border border-indigo-200/70 shrink-0">
            <FileText className="w-3 h-3" />
            <span>
              DOCX<span className="hidden @min-[740px]:inline"> 预览</span>
            </span>
          </span>
          <span
            className="text-xs font-medium text-zinc-900 truncate min-w-0"
            title={fileName}
          >
            {fileName}
          </span>
          {!loading && !error && pageCount > 0 && (
            <span
              className="text-[11px] font-medium text-zinc-500 tabular-nums bg-zinc-100/80 border border-zinc-200/60 rounded-md px-2 py-0.5 shrink-0"
              title={`第 ${currentPage} 页，共 ${pageCount} 页`}
            >
              <span className="hidden @min-[740px]:inline">第 </span>
              {currentPage} / {pageCount}
              <span className="hidden @min-[740px]:inline"> 页</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Zoom & fit controls */}
          <div className="flex items-center gap-0.5 bg-zinc-100/80 border border-zinc-200/60 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              disabled={zoom <= MIN_ZOOM}
              title="缩小预览"
              className="p-1 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-white/80 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="重置为 100%"
              className="text-[11px] font-medium text-zinc-700 hover:text-zinc-900 hover:bg-white/80 rounded-md px-1.5 py-0.5 min-w-[42px] text-center tabular-nums transition-colors cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              disabled={zoom >= MAX_ZOOM}
              title="放大预览"
              className="p-1 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-white/80 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-3.5 bg-zinc-200/80 mx-0.5" />
            <button
              type="button"
              onClick={() => fitToWidth()}
              disabled={naturalSize.width <= 0}
              title="适应页面宽度"
              className="p-1 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-white/80 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => void extractStyleFromDocxDialog(filePath)}
            title="提取样式为模板"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/70 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden @min-[740px]:inline">提取样式为模板</span>
            <span className="@min-[740px]:hidden">提样式</span>
          </button>

          <button
            type="button"
            onClick={() => void importDocxAsActiveDocument(filePath)}
            title="导入为可编辑文档"
            className="flex items-center gap-1.5 px-2.5 @min-[740px]:px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs transition-colors cursor-pointer"
          >
            <FileOutput className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden @min-[740px]:inline">导入为可编辑文档</span>
            <span className="@min-[740px]:hidden">导入编辑</span>
          </button>
        </div>
      </div>

      {/* Scrollable desk canvas with accurate scaled wrapper geometry */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#F2F3F5]/85 backdrop-blur-[1px] text-xs font-medium text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>正在解析并分页渲染 Word 文档...</span>
          </div>
        )}

        <div
          ref={scrollRef}
          className="h-full w-full overflow-auto py-8 px-6"
        >
          {error && (
            <div className="max-w-lg mx-auto mt-10 p-4 rounded-xl bg-rose-50/90 border border-rose-200/80 text-xs text-rose-700 leading-relaxed">
              {error}
            </div>
          )}

          <div
            style={{
              width: scaledWidth ? `${scaledWidth}px` : undefined,
              height: scaledHeight ? `${scaledHeight}px` : undefined,
              margin: "0 auto",
              position: "relative",
            }}
          >
            <div
              style={{
                width: naturalSize.width > 0 ? `${naturalSize.width}px` : undefined,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                opacity: loading ? 0 : 1,
              }}
              className="transition-opacity duration-150"
            >
              <div ref={hostRef} className="onedoc-docx-host select-text" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
