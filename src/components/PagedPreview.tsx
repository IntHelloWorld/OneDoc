import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
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

function renderRuns(runs: TextRun[]) {
  return runs.map((r, idx) => {
    const cls = [
      r.code ? "bg-slate-100 text-teal-800 px-1 py-0.5 rounded font-mono text-[0.9em]" : "",
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
          className="px-4 py-2.5 rounded-r-md my-2"
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
          className="my-2 px-3.5 py-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-800 text-[9.5pt] leading-relaxed overflow-x-auto"
          style={{ fontFamily: '"Consolas", "JetBrains Mono", monospace' }}
        >
          {block.language && (
            <div className="text-[8pt] uppercase text-slate-400 mb-1 select-none">
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
                    borderBottom:
                      mode === "three_line"
                        ? `0.75pt solid ${borderColor}`
                        : `0.75pt solid ${borderColor}`,
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
                          mode === "grid" ? `0.75pt solid ${borderColor}` : "none",
                        borderRight:
                          mode === "grid" ? `0.75pt solid ${borderColor}` : "none",
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
        <div className="my-5 flex items-center gap-2 select-none">
          <div className="flex-1 border-t border-dashed border-slate-300" />
          <span className="text-[10px] font-medium text-slate-400 px-2 py-0.5 bg-slate-100 rounded">
            分页符
          </span>
          <div className="flex-1 border-t border-dashed border-slate-300" />
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

  void activeStyleId;
  void customStyles;
  const style = getActiveStyle();

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
      if (item.type === "title" || item.type === "subtitle" || item.type === "heading") {
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
  const computePrefixes = (blocks: (DocBlock | undefined)[]): Map<string, string> => {
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
  const pageNumberSample =
    hf.pageNumberFormat === "dash"
      ? "— 1 —"
      : hf.pageNumberFormat === "of_total"
      ? "1 / 1"
      : "1";

  const renderInteractiveBlock = (b: DocBlock) => {
    const isSelected = selectedBlockIds.includes(b.id);
    const isEditing = editingId === b.id;

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
        className={`relative group rounded transition-all ${
          isSelected
            ? "ring-2 ring-blue-500/80 bg-blue-50/25 px-1.5 -mx-1.5"
            : "hover:ring-1 hover:ring-slate-300/70 px-1.5 -mx-1.5"
        }`}
      >
        {isSelected && !isEditing && !pendingDiff && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute -top-7 right-0 z-20 flex items-center gap-0.5 bg-slate-900 text-white px-1.5 py-0.5 rounded-md shadow-md text-[11px]"
          >
            <button
              type="button"
              onClick={() => onFocusPromptForBlock?.(b.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700 text-blue-300 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>AI 改写</span>
            </button>
            <button
              type="button"
              onClick={() => moveBlock(b.id, -1)}
              title="上移"
              className="p-1 rounded hover:bg-slate-700 cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => moveBlock(b.id, 1)}
              title="下移"
              className="p-1 rounded hover:bg-slate-700 cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => deleteBlock(b.id)}
              title="删除区块"
              className="p-1 rounded hover:bg-red-600/80 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {isEditing ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-1 p-2 rounded-md border border-blue-400 bg-blue-50/30 space-y-1.5"
          >
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={Math.min(8, Math.max(2, Math.ceil(editDraft.length / 45)))}
              autoFocus
              className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded p-2 outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => commitInlineEdit(b)}
                className="px-2.5 py-0.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
              >
                完成编辑
              </button>
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
        className={`relative my-2 rounded-md p-2 border-l-4 ${
          isAdd
            ? "bg-emerald-50/75 border-emerald-500"
            : isDel
            ? "bg-rose-50/75 border-rose-500"
            : "bg-amber-50/60 border-amber-500"
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 select-none">
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              isAdd
                ? "bg-emerald-100 text-emerald-800"
                : isDel
                ? "bg-rose-100 text-rose-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isAdd ? "AI 新增" : isDel ? "AI 建议删除" : "AI 修改对比"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => acceptDiffEntry(entry.key)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>接受</span>
            </button>
            <button
              type="button"
              onClick={() => rejectDiffEntry(entry.key)}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>拒绝</span>
            </button>
          </div>
        </div>

        {(isDel || isMod) && entry.oldBlock && (
          <div className="opacity-70 line-through decoration-rose-500 bg-rose-100/50 rounded px-2 py-1 mb-1">
            <BlockContent
              block={entry.oldBlock}
              style={style}
              headingPrefix={prefixMap.get(entry.oldBlock.id)}
            />
          </div>
        )}

        {(isAdd || isMod) && entry.newBlock && (
          <div className="bg-emerald-100/40 rounded px-2 py-1">
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
      className="h-full overflow-auto bg-[#EEF1F5] relative"
      onClick={() => useAppStore.getState().clearSelection()}
    >
      {/* Pending Diff floating sticky bar */}
      {pendingDiff && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="sticky top-3 z-30 mx-auto max-w-2xl px-4"
        >
          <div className="bg-slate-900/95 backdrop-blur text-white rounded-xl px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 border border-slate-700">
            <div className="min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>AI 提出了 {changedEntriesCount} 处文档变更</span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                {pendingDiff.summary}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={rejectAllDiffs}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-100 cursor-pointer"
              >
                全部拒绝
              </button>
              <button
                type="button"
                onClick={acceptAllDiffs}
                className="px-3 py-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                全部接受
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="py-8 px-6 flex justify-center">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
          }}
          className="transition-transform duration-150"
        >
          <div
            style={getPageSheetStyle(style)}
            className="shadow-[0_12px_40px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/5 relative flex flex-col justify-between select-text"
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
                  <div className="py-20 text-center text-slate-400 text-sm">
                    当前文档为空，请在右侧让 AI Agent 开始撰写或切换至源码视图输入。
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
        </div>
      </div>
    </div>
  );
}
