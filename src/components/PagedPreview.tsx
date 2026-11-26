import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  buildFontFamily,
  formatHeadingNumber,
  getPageSheetStyle,
  specToCss,
} from "../lib/styleCssMapper";
import { useAppStore } from "../store/useAppStore";
import type { BlockDiffEntry, DocBlock, TextRun } from "../types/document";
import type { StyleProfile } from "../types/style";

interface PagedPreviewProps {
  onFocusPromptForBlock?: (blockId: string) => void;
}

function isEditableBlock(b: DocBlock): boolean {
  return (
    b.type === "title" ||
    b.type === "subtitle" ||
    b.type === "heading" ||
    b.type === "paragraph" ||
    b.type === "quote"
  );
}

function renderRuns(runs: TextRun[]) {
  return runs.map((r, idx) => {
    const cls = [
      r.code
        ? "bg-zinc-100/90 text-zinc-800 border border-zinc-200/70 px-1 py-[0.5px] rounded font-mono text-[0.88em]"
        : "",
      r.underline ? "underline" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span
        key={idx}
        className={cls}
        style={{
          fontWeight: r.bold ? 700 : undefined,
          fontStyle: r.italic ? "italic" : undefined,
          color: r.color || undefined,
        }}
      >
        {r.text}
      </span>
    );
  });
}

function BlockContent({
  block,
  style,
  headingPrefix,
}: {
  block: DocBlock;
  style: StyleProfile;
  headingPrefix?: string;
}) {
  switch (block.type) {
    case "title":
      return (
        <div style={specToCss(style.typography.title)}>{block.text}</div>
      );

    case "subtitle":
      return (
        <div style={specToCss(style.typography.subtitle)}>{block.text}</div>
      );

    case "heading": {
      const spec =
        block.level === 1
          ? style.typography.h1
          : block.level === 2
          ? style.typography.h2
          : block.level === 3
          ? style.typography.h3
          : style.typography.h4;
      const prefix = headingPrefix ?? "";
      const displayText =
        prefix && !block.text.startsWith(prefix.trim())
          ? `${prefix}${block.text}`
          : block.text;
      return <div style={specToCss(spec)}>{displayText}</div>;
    }

    case "paragraph":
      return (
        <p style={specToCss(style.typography.body, block.indent, block.align)}>
          {renderRuns(block.runs)}
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={
            block.ordered
              ? "list-decimal pl-7 space-y-1 my-1.5"
              : "list-disc pl-7 space-y-1 my-1.5"
          }
          style={{
            ...specToCss(style.typography.body, false),
            textIndent: 0,
            marginBottom: "6pt",
          }}
        >
          {block.items.map((itemRuns, i) => (
            <li key={i}>{renderRuns(itemRuns)}</li>
          ))}
        </Tag>
      );
    }

    case "quote": {
      const bg =
        style.typography.quote.backgroundColor &&
        style.typography.quote.backgroundColor !== "transparent"
          ? style.typography.quote.backgroundColor
          : style.colors.calloutBg;
      return (
        <div
          className="px-4 py-2.5 rounded-r-lg my-2"
          style={{
            backgroundColor: bg,
            borderLeft: `4px solid ${style.colors.primary}`,
            ...specToCss(style.typography.quote, false),
            textIndent: 0,
          }}
        >
          {block.title && (
            <div
              className="font-bold mb-1"
              style={{ color: style.colors.primary }}
            >
              {block.title}
            </div>
          )}
          <div className="whitespace-pre-wrap">{block.text}</div>
        </div>
      );
    }

    case "code_block":
      return (
        <pre
          className="my-2 px-3.5 py-2.5 rounded-lg border border-zinc-200/80 bg-[#FAFAFB] text-zinc-800 text-[9.5pt] leading-relaxed overflow-x-auto"
          style={{
            fontFamily:
              '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
          }}
        >
          {block.language && (
            <div className="text-[8pt] uppercase tracking-wider text-zinc-400 mb-1.5 select-none">
              {block.language}
            </div>
          )}
          <code>{block.code}</code>
        </pre>
      );

    case "table": {
      const mode = style.table.style;
      const borderColor = style.table.borderColor || "#CBD5E1";
      const padV = `${Math.max(3, style.table.cellPaddingPt)}pt`;
      const padH = `${Math.max(6, style.table.cellPaddingPt * 1.4)}pt`;

      const tableStyle: React.CSSProperties = {
        width: "100%",
        borderCollapse: "collapse",
        marginTop: "6pt",
        marginBottom: "10pt",
        borderTop:
          mode === "three_line"
            ? `1.5pt solid ${borderColor}`
            : `0.75pt solid ${borderColor}`,
        borderBottom:
          mode === "three_line"
            ? `1.5pt solid ${borderColor}`
            : `0.75pt solid ${borderColor}`,
        borderLeft: mode === "grid" ? `0.75pt solid ${borderColor}` : "none",
        borderRight: mode === "grid" ? `0.75pt solid ${borderColor}` : "none",
      };

      const headerBg =
        mode === "three_line" ||
        !style.table.headerBg ||
        style.table.headerBg === "transparent"
          ? "transparent"
          : style.table.headerBg;

      const headerColor =
        mode === "three_line" || headerBg === "transparent"
          ? style.typography.tableHeader.color
          : style.table.headerTextColor || "#FFFFFF";

      return (
        <div className="my-2">
          {block.caption && (
            <div style={specToCss(style.typography.caption, false)}>
              {block.caption}
            </div>
          )}
          <table style={tableStyle}>
            {block.headers.length > 0 && (
              <thead>
                <tr
                  style={{
                    backgroundColor: headerBg,
                    borderBottom: `0.75pt solid ${borderColor}`,
                  }}
                >
                  {block.headers.map((h, ci) => (
                    <th
                      key={ci}
                      style={{
                        fontFamily: buildFontFamily(style.typography.tableHeader),
                        fontSize: `${style.typography.tableHeader.sizePt}pt`,
                        fontWeight: style.typography.tableHeader.bold ? 700 : 400,
                        color: headerColor,
                        textAlign: style.typography.tableHeader
                          .align as React.CSSProperties["textAlign"],
                        padding: `${padV} ${padH}`,
                        borderLeft:
                          mode === "grid"
                            ? `0.75pt solid ${borderColor}`
                            : "none",
                        borderRight:
                          mode === "grid"
                            ? `0.75pt solid ${borderColor}`
                            : "none",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, ri) => {
                const zebraBg =
                  mode === "zebra" &&
                  ri % 2 === 1 &&
                  style.table.zebraBg &&
                  style.table.zebraBg !== "transparent"
                    ? style.table.zebraBg
                    : "transparent";
                return (
                  <tr
                    key={ri}
                    style={{
                      backgroundColor: zebraBg,
                      borderBottom:
                        mode === "three_line"
                          ? "none"
                          : `0.5pt solid ${borderColor}`,
                    }}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          fontFamily: buildFontFamily(style.typography.tableCell),
                          fontSize: `${style.typography.tableCell.sizePt}pt`,
                          color: style.typography.tableCell.color,
                          textAlign: style.typography.tableCell
                            .align as React.CSSProperties["textAlign"],
                          padding: `${padV} ${padH}`,
                          borderLeft:
                            mode === "grid"
                              ? `0.75pt solid ${borderColor}`
                              : "none",
                          borderRight:
                            mode === "grid"
                              ? `0.75pt solid ${borderColor}`
                              : "none",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case "divider":
      if (block.style === "double_red") {
        return (
          <div className="my-3 space-y-[2px]">
            <div className="h-[2.5px] bg-[#CC0000] w-full" />
            <div className="h-[1px] bg-[#CC0000] w-full" />
          </div>
        );
      }
      return (
        <hr
          className="my-3 border-0 border-t"
          style={{ borderColor: style.colors.border }}
        />
      );

    case "page_break":
      return (
        <div className="my-6 flex items-center gap-3 select-none">
          <div className="flex-1 border-t border-dashed border-zinc-300/90" />
          <span className="text-[10px] font-medium tracking-wide text-zinc-400 px-2.5 py-0.5 bg-zinc-100/90 border border-zinc-200/80 rounded-full">
            分页符
          </span>
          <div className="flex-1 border-t border-dashed border-zinc-300/90" />
        </div>
      );
  }
}

export function PagedPreview({ onFocusPromptForBlock }: PagedPreviewProps) {
  const doc = useAppStore((s) => s.document);
  const activeStyleId = useAppStore((s) => s.activeStyleId);
  const customStyles = useAppStore((s) => s.customStyles);
  const getActiveStyle = useAppStore((s) => s.getActiveStyle);
  const zoom = useAppStore((s) => s.zoom);
  const selectedBlockIds = useAppStore((s) => s.selectedBlockIds);
  const pendingDiff = useAppStore((s) => s.pendingDiff);

  const toggleBlockSelection = useAppStore((s) => s.toggleBlockSelection);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const acceptDiffEntry = useAppStore((s) => s.acceptDiffEntry);
  const rejectDiffEntry = useAppStore((s) => s.rejectDiffEntry);
  const acceptAllDiffs = useAppStore((s) => s.acceptAllDiffs);
  const rejectAllDiffs = useAppStore((s) => s.rejectAllDiffs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  void activeStyleId;
  void customStyles;
  const style = getActiveStyle();

  const measureNaturalSize = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width > 0 && height > 0) {
      setNaturalSize((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height }
      );
    }
  }, []);

  useLayoutEffect(() => {
    measureNaturalSize();
  }, [
    measureNaturalSize,
    style.page.widthMm,
    style.page.heightMm,
    doc.blocks,
    pendingDiff,
    editingId,
  ]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measureNaturalSize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureNaturalSize]);

  const fallbackWidth = Math.ceil((style.page.widthMm * 96) / 25.4);
  const fallbackHeight = Math.ceil((style.page.heightMm * 96) / 25.4) + 36;
  const naturalWidth =
    naturalSize.width > 0 ? naturalSize.width : fallbackWidth;
  const naturalHeight =
    naturalSize.height > 0 ? naturalSize.height : fallbackHeight;
  const scaledWidth = Math.ceil(naturalWidth * zoom);
  const scaledHeight = Math.ceil(naturalHeight * zoom);

  const beginInlineEdit = (b: DocBlock) => {
    if (b.type === "title" || b.type === "subtitle" || b.type === "heading") {
      setEditingId(b.id);
      setEditDraft(b.text);
    } else if (b.type === "paragraph") {
      setEditingId(b.id);
      setEditDraft(b.runs.map((r) => r.text).join(""));
    } else if (b.type === "quote") {
      setEditingId(b.id);
      setEditDraft(b.text);
    }
  };

  const commitInlineEdit = (b: DocBlock) => {
    const nextBlocks = doc.blocks.map((item) => {
      if (item.id !== b.id) return item;
      if (
        item.type === "title" ||
        item.type === "subtitle" ||
        item.type === "heading"
      ) {
        return { ...item, text: editDraft };
      }
      if (item.type === "paragraph") {
        return { ...item, runs: [{ text: editDraft }] };
      }
      if (item.type === "quote") {
        return { ...item, text: editDraft };
      }
      return item;
    });
    updateDocument({ ...doc, blocks: nextBlocks }, true);
    setEditingId(null);
  };

  const moveBlock = (id: string, delta: -1 | 1) => {
    const idx = doc.blocks.findIndex((b) => b.id === id);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= doc.blocks.length) return;
    const copy = [...doc.blocks];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    updateDocument({ ...doc, blocks: copy }, true);
  };

  const deleteBlock = (id: string) => {
    updateDocument(
      { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) },
      true
    );
  };

  // Compute heading numbers sequentially
  const computePrefixes = (
    blocks: (DocBlock | undefined)[]
  ): Map<string, string> => {
    const map = new Map<string, string>();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    for (const b of blocks) {
      if (b && b.type === "heading") {
        const idx = b.level - 1;
        counters[idx] += 1;
        for (let j = idx + 1; j < 4; j++) counters[j] = 0;
        map.set(b.id, formatHeadingNumber(b.level, counters, style.numbering));
      }
    }
    return map;
  };

  const changedEntriesCount =
    pendingDiff?.entries.filter((e) => e.kind !== "unchanged").length ?? 0;

  const activeBlocksForPrefix = pendingDiff
    ? pendingDiff.entries.map((e) => e.newBlock ?? e.oldBlock)
    : doc.blocks;
  const prefixMap = computePrefixes(activeBlocksForPrefix);

  const hf = style.headerFooter;
  const pageBreakCount = doc.blocks.filter((b) => b.type === "page_break").length;
  const estimatedPages = pageBreakCount + 1;
  const pageNumberSample =
    hf.pageNumberFormat === "dash"
      ? "— 1 —"
      : hf.pageNumberFormat === "of_total"
      ? `1 / ${estimatedPages}`
      : "1";

  const renderInteractiveBlock = (b: DocBlock) => {
    const isSelected = selectedBlockIds.includes(b.id);
    const isEditing = editingId === b.id;
    const canInlineEdit = isEditableBlock(b);

    return (
      <div
        key={b.id}
        onClick={(e) => {
          e.stopPropagation();
          toggleBlockSelection(b.id, e.ctrlKey || e.metaKey);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!pendingDiff) beginInlineEdit(b);
        }}
        className={`relative group rounded-lg transition-all duration-150 px-2 -mx-2 ${
          isSelected
            ? "ring-1 ring-indigo-500/60 bg-indigo-50/[0.22] shadow-[0_0_0_3px_rgba(99,102,241,0.06)]"
            : "hover:ring-1 hover:ring-zinc-300/75 hover:bg-zinc-900/[0.015]"
        }`}
      >
        {/* Subtle hover AI cue when unselected */}
        {!isSelected && !isEditing && !pendingDiff && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleBlockSelection(b.id, false);
              onFocusPromptForBlock?.(b.id);
            }}
            title="让 Agent 改写此区块"
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2.5 right-1 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/95 backdrop-blur-xs border border-zinc-200/85 shadow-2xs text-[10px] font-medium text-indigo-600 hover:bg-indigo-50/90 hover:border-indigo-200/80 cursor-pointer select-none"
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>AI</span>
          </button>
        )}

        {/* Elevated AI-native floating pill toolbar when selected */}
        {isSelected && !isEditing && !pendingDiff && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-float-in absolute -top-9 right-0 z-20 flex items-center gap-0.5 bg-white/95 backdrop-blur-md text-zinc-700 p-1 rounded-xl border border-zinc-200/85 shadow-[0_6px_20px_-6px_rgba(15,23,42,0.14),0_1px_3px_rgba(15,23,42,0.06)] text-[11px] select-none"
          >
            <button
              type="button"
              onClick={() => onFocusPromptForBlock?.(b.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50/85 hover:bg-indigo-100/85 text-indigo-700 font-medium transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>AI 改写</span>
            </button>

            <div className="h-3.5 w-px bg-zinc-200/85 mx-0.5" />

            {canInlineEdit && (
              <button
                type="button"
                onClick={() => beginInlineEdit(b)}
                title="直接编辑文字（也可双击区块）"
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => moveBlock(b.id, -1)}
              title="上移区块"
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => moveBlock(b.id, 1)}
              title="下移区块"
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => deleteBlock(b.id)}
              title="删除区块"
              className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {isEditing ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-1.5 p-2.5 rounded-xl border border-indigo-300/80 bg-white shadow-[0_6px_20px_-6px_rgba(79,70,229,0.14)] ring-2 ring-indigo-500/10 space-y-2"
          >
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingId(null);
                } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  commitInlineEdit(b);
                }
              }}
              rows={Math.min(8, Math.max(2, Math.ceil(editDraft.length / 45)))}
              autoFocus
              className="w-full text-sm text-zinc-900 bg-[#FAFAFB] border border-zinc-200/85 rounded-lg p-2.5 outline-none focus:bg-white focus:border-indigo-400/80 leading-relaxed resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-400 select-none">
                Ctrl+Enter 保存 · Esc 取消
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => commitInlineEdit(b)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  完成编辑
                </button>
              </div>
            </div>
          </div>
        ) : (
          <BlockContent
            block={b}
            style={style}
            headingPrefix={prefixMap.get(b.id)}
          />
        )}
      </div>
    );
  };

  const renderDiffEntry = (entry: BlockDiffEntry) => {
    if (entry.kind === "unchanged" && entry.newBlock) {
      return renderInteractiveBlock(entry.newBlock);
    }

    const isAdd = entry.kind === "added";
    const isDel = entry.kind === "deleted";
    const isMod = entry.kind === "modified";

    return (
      <div
        key={entry.key}
        onClick={(e) => e.stopPropagation()}
        className={`relative my-2.5 rounded-xl p-2.5 border border-l-[3px] transition-colors ${
          isAdd
            ? "bg-emerald-50/45 border-emerald-200/70 border-l-emerald-500"
            : isDel
            ? "bg-rose-50/45 border-rose-200/70 border-l-rose-500"
            : "bg-indigo-50/25 border-indigo-200/70 border-l-indigo-500"
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2 select-none">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              isAdd
                ? "bg-emerald-100/80 text-emerald-700"
                : isDel
                ? "bg-rose-100/80 text-rose-700"
                : "bg-indigo-100/80 text-indigo-700"
            }`}
          >
            <Sparkles className="w-2.5 h-2.5" />
            {isAdd ? "AI 新增内容" : isDel ? "AI 建议删除" : "AI 改写对比"}
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => rejectDiffEntry(entry.key)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white border border-zinc-200/90 text-zinc-600 hover:text-rose-700 hover:bg-rose-50/70 hover:border-rose-200/80 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>拒绝</span>
            </button>
            <button
              type="button"
              onClick={() => acceptDiffEntry(entry.key)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>接受</span>
            </button>
          </div>
        </div>

        {(isDel || isMod) && entry.oldBlock && (
          <div className="opacity-75 line-through decoration-rose-400/80 bg-rose-50/75 border border-rose-200/45 rounded-lg px-2.5 py-1.5 mb-1.5">
            <BlockContent
              block={entry.oldBlock}
              style={style}
              headingPrefix={prefixMap.get(entry.oldBlock.id)}
            />
          </div>
        )}

        {(isAdd || isMod) && entry.newBlock && (
          <div className="bg-emerald-50/70 border border-emerald-200/50 rounded-lg px-2.5 py-1.5">
            <BlockContent
              block={entry.newBlock}
              style={style}
              headingPrefix={prefixMap.get(entry.newBlock.id)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="h-full w-full overflow-auto bg-[#F2F3F5] relative"
      onClick={() => useAppStore.getState().clearSelection()}
    >
      {/* Pending Diff floating sticky review pill */}
      {pendingDiff && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="sticky top-3.5 left-0 z-30 mx-auto max-w-2xl px-4"
        >
          <div className="animate-float-in bg-white/95 backdrop-blur-md text-zinc-900 rounded-xl px-3.5 py-2.5 shadow-[0_8px_28px_-6px_rgba(15,23,42,0.14),0_1px_3px_rgba(15,23,42,0.06)] border border-zinc-200/85 ring-1 ring-indigo-500/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-900 tabular-nums">
                  AI 提出了 {changedEntriesCount} 处文档变更
                </div>
                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                  {pendingDiff.summary}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={rejectAllDiffs}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-zinc-200/90 text-zinc-600 hover:text-rose-700 hover:bg-rose-50/70 hover:border-rose-200/80 transition-colors cursor-pointer"
              >
                全部拒绝
              </button>
              <button
                type="button"
                onClick={acceptAllDiffs}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>全部接受</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="py-10 px-6 min-w-full w-fit">
        <div
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
            margin: "0 auto",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${naturalWidth}px`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
            className="transition-transform duration-150"
          >
            <div ref={contentRef} className="w-fit flex flex-col items-center">
              <div
                style={getPageSheetStyle(style)}
                className="rounded-[2px] shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_32px_-8px_rgba(15,23,42,0.08)] ring-1 ring-zinc-900/[0.04] relative flex flex-col justify-between select-text"
              >
                {/* Header preview */}
                <div>
                  {hf.showHeader && hf.headerText && (
                    <div
                      className="mb-5 pb-1.5 text-[9pt] text-right"
                      style={{
                        color: style.colors.muted,
                        borderBottom: hf.headerBorderBottom
                          ? `0.75pt solid ${style.colors.border}`
                          : undefined,
                        fontFamily: buildFontFamily(style.typography.body),
                      }}
                    >
                      {hf.headerText}
                    </div>
                  )}

                  {/* Body blocks */}
                  <div className="space-y-0.5">
                    {pendingDiff ? (
                      pendingDiff.entries.map((entry) => renderDiffEntry(entry))
                    ) : doc.blocks.length === 0 ? (
                      <div className="py-24 text-center space-y-2 select-none">
                        <div className="w-9 h-9 rounded-xl bg-zinc-100/90 border border-zinc-200/70 flex items-center justify-center mx-auto text-zinc-400">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <p className="text-sm text-zinc-400">
                          当前文档为空，可在右侧让 AI Agent 撰写或切换至源码视图输入。
                        </p>
                      </div>
                    ) : (
                      doc.blocks.map((b) => renderInteractiveBlock(b))
                    )}
                  </div>
                </div>

                {/* Footer preview */}
                {hf.showFooter && (hf.showPageNumber || hf.footerText) && (
                  <div
                    className="mt-10 pt-3 text-[9pt] flex items-center gap-4"
                    style={{
                      color: style.colors.muted,
                      justifyContent:
                        hf.pageNumberAlign === "left"
                          ? "flex-start"
                          : hf.pageNumberAlign === "right"
                          ? "flex-end"
                          : "center",
                      fontFamily: buildFontFamily(style.typography.body),
                    }}
                  >
                    {hf.footerText && <span>{hf.footerText}</span>}
                    {hf.showPageNumber && <span>{pageNumberSample}</span>}
                  </div>
                )}
              </div>

              {/* Quiet paper metadata / page indicator under sheet */}
              <div className="mt-3.5 inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] text-zinc-400 tabular-nums select-none">
                <span>
                  {estimatedPages > 1
                    ? `共 ${estimatedPages} 节分页`
                    : "第 1 页"}
                </span>
                <span className="text-zinc-300">·</span>
                <span>
                  {style.page.size} ({style.page.widthMm} × {style.page.heightMm}{" "}
                  mm)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
