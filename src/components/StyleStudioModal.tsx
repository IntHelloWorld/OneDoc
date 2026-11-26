import { useEffect, useState } from "react";
import {
  FileUp,
  Layers,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  CHINESE_FONT_SIZES,
  COMMON_EN_FONTS,
  COMMON_ZH_FONTS,
  cloneStyleProfile,
} from "../presets/stylePresets";
import { buildFontFamily, formatHeadingNumber, specToCss } from "../lib/styleCssMapper";
import { useAppStore } from "../store/useAppStore";
import type { StyleProfile, TextStyleSpec, TypographySet } from "../types/style";

type StudioTab = "page" | "typography" | "numbering";
type TypographyRole = keyof TypographySet;

const ROLE_LABELS: { key: TypographyRole; label: string }[] = [
  { key: "title", label: "主标题 (Title)" },
  { key: "subtitle", label: "副标题 (Subtitle)" },
  { key: "h1", label: "一级标题 (H1)" },
  { key: "h2", label: "二级标题 (H2)" },
  { key: "h3", label: "三级标题 (H3)" },
  { key: "h4", label: "四级标题 (H4)" },
  { key: "body", label: "正文 (Body)" },
  { key: "quote", label: "引用/提示框 (Quote)" },
  { key: "caption", label: "图表题注 (Caption)" },
  { key: "tableHeader", label: "表格表头 (Table Header)" },
  { key: "tableCell", label: "表格正文 (Table Cell)" },
];

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  B5: { w: 176, h: 250 },
  Letter: { w: 215.9, h: 279.4 },
};

export function StyleStudioModal() {
  const open = useAppStore((s) => s.styleStudioOpen);
  const setOpen = useAppStore((s) => s.setStyleStudioOpen);
  const activeStyleId = useAppStore((s) => s.activeStyleId);
  const customStyles = useAppStore((s) => s.customStyles);
  const getAllStyles = useAppStore((s) => s.getAllStyles);
  const getActiveStyle = useAppStore((s) => s.getActiveStyle);
  const setActiveStyleId = useAppStore((s) => s.setActiveStyleId);
  const saveStyleProfile = useAppStore((s) => s.saveStyleProfile);
  const deleteCustomStyle = useAppStore((s) => s.deleteCustomStyle);
  const extractStyleFromDocxDialog = useAppStore(
    (s) => s.extractStyleFromDocxDialog
  );

  const [draft, setDraft] = useState<StyleProfile>(() =>
    cloneStyleProfile(getActiveStyle())
  );
  const [tab, setTab] = useState<StudioTab>("typography");
  const [role, setRole] = useState<TypographyRole>("body");
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(cloneStyleProfile(getActiveStyle()));
    }
  }, [open, activeStyleId, getActiveStyle]);

  if (!open) return null;

  const allStyles = getAllStyles();
  const isCustom = customStyles.some((s) => s.id === draft.id);
  const activeRoleSpec = draft.typography[role];

  const updateSpec = (patch: Partial<TextStyleSpec>) => {
    setDraft((prev) => ({
      ...prev,
      typography: {
        ...prev.typography,
        [role]: {
          ...prev.typography[role],
          ...patch,
        },
      },
    }));
  };

  const handleSelectProfile = (p: StyleProfile) => {
    setActiveStyleId(p.id);
    setDraft(cloneStyleProfile(p));
  };

  const handleCreateBlankCustom = () => {
    const base = cloneStyleProfile(draft);
    base.id = `custom-${Date.now().toString(36)}`;
    base.name = `${draft.name.replace(/\s*\(自定义\)$/, "")} 副本`;
    base.category = "custom";
    setDraft(base);
  };

  const handleExtractFromDocx = async () => {
    setExtracting(true);
    try {
      const extracted = await extractStyleFromDocxDialog();
      if (extracted) {
        setDraft(cloneStyleProfile(extracted));
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    await saveStyleProfile(draft);
  };

  const h1Preview =
    formatHeadingNumber(1, [1, 0, 0, 0], draft.numbering) + "项目背景与目标";
  const h2Preview =
    formatHeadingNumber(2, [1, 1, 0, 0], draft.numbering) + "核心技术路线";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[86vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                OneDoc 样式定义工作室 (Style Contract)
              </h2>
              <p className="text-xs text-slate-500">
                定义 Word (.docx) 版心、中西文字体、行距、多级编号与表格样式，或从范文一键反向提取
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main 3-column body */}
        <div className="flex-1 min-h-0 flex">
          {/* Left: Style Profile list */}
          <div className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/60 flex flex-col">
            <div className="p-3 space-y-2 border-b border-slate-200/80">
              <button
                type="button"
                onClick={() => void handleExtractFromDocx()}
                disabled={extracting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-60 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>{extracting ? "正在解析范文..." : "从 .docx 范文提取"}</span>
              </button>
              <button
                type="button"
                onClick={handleCreateBlankCustom}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>基于当前复制新建</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {allStyles.map((st) => {
                const selected = st.id === draft.id;
                const custom = customStyles.some((c) => c.id === st.id);
                return (
                  <div
                    key={st.id}
                    onClick={() => handleSelectProfile(st)}
                    className={`group flex items-start justify-between gap-1.5 p-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      selected
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "hover:bg-slate-200/60 text-slate-700 border border-transparent"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{st.name}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {st.typography.body.fontZh} · {st.typography.body.sizePt}pt
                      </div>
                    </div>
                    {custom && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomStyle(st.id);
                        }}
                        title="删除自定义样式"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center: Config inspector */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Name & tab bar */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-200 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    样式模板名称
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md outline-none focus:border-blue-500 select-text"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    模板说明
                  </label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none focus:border-blue-500 select-text"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                {(
                  [
                    { id: "typography", label: "字体与段落规范" },
                    { id: "page", label: "页面与页眉页脚" },
                    { id: "numbering", label: "多级编号与表格" },
                  ] as { id: StudioTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      tab === t.id
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab panels */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {tab === "page" && (
                <>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      纸张与页边距 (毫米 mm)
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          纸张规格
                        </label>
                        <select
                          value={draft.page.size}
                          onChange={(e) => {
                            const sz = e.target.value;
                            const dims = PAGE_SIZES[sz] ?? PAGE_SIZES.A4;
                            setDraft({
                              ...draft,
                              page: {
                                ...draft.page,
                                size: sz,
                                widthMm: dims.w,
                                heightMm: dims.h,
                              },
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white outline-none"
                        >
                          <option value="A4">A4 (210 × 297 mm)</option>
                          <option value="B5">B5 (176 × 250 mm)</option>
                          <option value="Letter">Letter (215.9 × 279.4 mm)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          上边距 (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={draft.page.marginTopMm}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              page: {
                                ...draft.page,
                                marginTopMm: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          下边距 (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={draft.page.marginBottomMm}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              page: {
                                ...draft.page,
                                marginBottomMm: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          左边距 (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={draft.page.marginLeftMm}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              page: {
                                ...draft.page,
                                marginLeftMm: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          右边距 (mm)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={draft.page.marginRightMm}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              page: {
                                ...draft.page,
                                marginRightMm: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      页眉与页脚设置
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.headerFooter.showHeader}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                showHeader: e.target.checked,
                              },
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span>显示页眉</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.headerFooter.headerBorderBottom}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                headerBorderBottom: e.target.checked,
                              },
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span>页眉下划线</span>
                      </label>
                    </div>

                    {draft.headerFooter.showHeader && (
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          页眉文本
                        </label>
                        <input
                          type="text"
                          value={draft.headerFooter.headerText}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                headerText: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none select-text"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.headerFooter.showFooter}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                showFooter: e.target.checked,
                              },
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span>启用页脚</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.headerFooter.showPageNumber}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                showPageNumber: e.target.checked,
                              },
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span>自动页码</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          页脚附注文本
                        </label>
                        <input
                          type="text"
                          value={draft.headerFooter.footerText}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                footerText: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none select-text"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          页码格式
                        </label>
                        <select
                          value={draft.headerFooter.pageNumberFormat}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                pageNumberFormat: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white outline-none"
                        >
                          <option value="plain">纯数字 (1)</option>
                          <option value="dash">公文一字线 (— 1 —)</option>
                          <option value="of_total">共几页 (1 / N)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          页码对齐
                        </label>
                        <select
                          value={draft.headerFooter.pageNumberAlign}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headerFooter: {
                                ...draft.headerFooter,
                                pageNumberAlign: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white outline-none"
                        >
                          <option value="left">居左</option>
                          <option value="center">居中</option>
                          <option value="right">居右</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {tab === "typography" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {ROLE_LABELS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setRole(r.key)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                          role === r.key
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Type className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        正在配置：
                        {ROLE_LABELS.find((x) => x.key === role)?.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          中文字体 (w:eastAsia)
                        </label>
                        <input
                          list="zh-fonts-list"
                          value={activeRoleSpec.fontZh}
                          onChange={(e) => updateSpec({ fontZh: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none select-text"
                        />
                        <datalist id="zh-fonts-list">
                          {COMMON_ZH_FONTS.map((f) => (
                            <option key={f} value={f} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          西文/数字字体 (w:ascii)
                        </label>
                        <input
                          list="en-fonts-list"
                          value={activeRoleSpec.fontEn}
                          onChange={(e) => updateSpec({ fontEn: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none select-text"
                        />
                        <datalist id="en-fonts-list">
                          {COMMON_EN_FONTS.map((f) => (
                            <option key={f} value={f} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          中文字号快捷选
                        </label>
                        <select
                          value={
                            CHINESE_FONT_SIZES.some(
                              (s) => s.pt === activeRoleSpec.sizePt
                            )
                              ? activeRoleSpec.sizePt
                              : ""
                          }
                          onChange={(e) => {
                            if (e.target.value) {
                              updateSpec({ sizePt: Number(e.target.value) });
                            }
                          }}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        >
                          <option value="">自定义磅值</option>
                          {CHINESE_FONT_SIZES.map((s) => (
                            <option key={s.label} value={s.pt}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          字号 (pt)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={activeRoleSpec.sizePt}
                          onChange={(e) =>
                            updateSpec({ sizePt: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          文字颜色
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activeRoleSpec.color}
                            onChange={(e) => updateSpec({ color: e.target.value })}
                            className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={activeRoleSpec.color}
                            onChange={(e) => updateSpec({ color: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          对齐方式
                        </label>
                        <select
                          value={activeRoleSpec.align}
                          onChange={(e) => updateSpec({ align: e.target.value })}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        >
                          <option value="left">左对齐</option>
                          <option value="center">居中</option>
                          <option value="right">右对齐</option>
                          <option value="justify">两端对齐</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          行距模式
                        </label>
                        <select
                          value={activeRoleSpec.lineSpacingRule}
                          onChange={(e) =>
                            updateSpec({
                              lineSpacingRule: e.target.value,
                              lineSpacingValue:
                                e.target.value === "exact" ? 28 : 1.5,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        >
                          <option value="multiple">多倍行距</option>
                          <option value="exact">固定磅值 (pt)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          行距值 ({activeRoleSpec.lineSpacingRule === "exact" ? "pt" : "倍"})
                        </label>
                        <input
                          type="number"
                          step={activeRoleSpec.lineSpacingRule === "exact" ? 1 : 0.05}
                          value={activeRoleSpec.lineSpacingValue}
                          onChange={(e) =>
                            updateSpec({
                              lineSpacingValue: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          首行缩进 (字符)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={activeRoleSpec.firstLineIndentChars}
                          onChange={(e) =>
                            updateSpec({
                              firstLineIndentChars: Number(e.target.value),
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div className="flex items-end gap-3 pb-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeRoleSpec.bold}
                            onChange={(e) => updateSpec({ bold: e.target.checked })}
                            className="accent-blue-600"
                          />
                          <span>加粗</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeRoleSpec.italic}
                            onChange={(e) =>
                              updateSpec({ italic: e.target.checked })
                            }
                            className="accent-blue-600"
                          />
                          <span>斜体</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          段前间距 (pt)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={activeRoleSpec.spaceBeforePt}
                          onChange={(e) =>
                            updateSpec({ spaceBeforePt: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          段后间距 (pt)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={activeRoleSpec.spaceAfterPt}
                          onChange={(e) =>
                            updateSpec({ spaceAfterPt: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        />
                      </div>
                      <div className="flex items-end pb-1.5">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(activeRoleSpec.borderBottom)}
                            onChange={(e) =>
                              updateSpec({ borderBottom: e.target.checked })
                            }
                            className="accent-blue-600"
                          />
                          <span>段落底部分隔线</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "numbering" && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-800">
                        多级标题自动编号规则
                      </h3>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={draft.numbering.enabled}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              numbering: {
                                ...draft.numbering,
                                enabled: e.target.checked,
                              },
                            })
                          }
                          className="accent-blue-600"
                        />
                        <span>启用确定性自动编号</span>
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      支持占位符：<code className="bg-slate-100 px-1 rounded">{"{zh1}"}</code> 中文数字（一、二），<code className="bg-slate-100 px-1 rounded">{"{n1}"}</code> 阿拉伯数字（1, 2）。
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          { key: "h1Pattern", label: "一级标题格式 (H1)" },
                          { key: "h2Pattern", label: "二级标题格式 (H2)" },
                          { key: "h3Pattern", label: "三级标题格式 (H3)" },
                          { key: "h4Pattern", label: "四级标题格式 (H4)" },
                        ] as const
                      ).map((item) => (
                        <div key={item.key}>
                          <label className="block text-[11px] text-slate-500 mb-1">
                            {item.label}
                          </label>
                          <input
                            type="text"
                            value={draft.numbering[item.key]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                numbering: {
                                  ...draft.numbering,
                                  [item.key]: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md outline-none select-text"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      表格排版样式
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          表格边框风格
                        </label>
                        <select
                          value={draft.table.style}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              table: { ...draft.table, style: e.target.value },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                        >
                          <option value="three_line">标准学术三线表</option>
                          <option value="zebra">现代商务斑马纹</option>
                          <option value="grid">全边框标准网格</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          表头底色 (斑马纹/网格)
                        </label>
                        <input
                          type="text"
                          value={draft.table.headerBg}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              table: {
                                ...draft.table,
                                headerBg: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md font-mono outline-none"
                        />
                      </div>
                      <div className="flex items-end pb-1.5">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.table.repeatHeader}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                table: {
                                  ...draft.table,
                                  repeatHeader: e.target.checked,
                                },
                              })
                            }
                            className="accent-blue-600"
                          />
                          <span>跨页自动重复表头</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live miniature specimen preview */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>实时样式样张预览（所见即导出）</span>
                </div>
                <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
                  <div style={specToCss(draft.typography.title)}>
                    文档主标题效果示例 Title
                  </div>
                  <div style={specToCss(draft.typography.h1)}>{h1Preview}</div>
                  <div style={specToCss(draft.typography.h2)}>{h2Preview}</div>
                  <p style={specToCss(draft.typography.body)}>
                    本段正文实时呈现当前设置的中文字体（{draft.typography.body.fontZh}）、西文字体（{draft.typography.body.fontEn}）、字号（{draft.typography.body.sizePt}pt）、行距及首行缩进 {draft.typography.body.firstLineIndentChars} 字符的效果。
                  </p>
                  <div className="pt-2">
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        borderTop:
                          draft.table.style === "three_line"
                            ? `1.5pt solid ${draft.table.borderColor}`
                            : `0.75pt solid ${draft.table.borderColor}`,
                        borderBottom:
                          draft.table.style === "three_line"
                            ? `1.5pt solid ${draft.table.borderColor}`
                            : `0.75pt solid ${draft.table.borderColor}`,
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor:
                              draft.table.style === "three_line" ||
                              draft.table.headerBg === "transparent"
                                ? "transparent"
                                : draft.table.headerBg,
                            borderBottom: `0.75pt solid ${draft.table.borderColor}`,
                          }}
                        >
                          <th
                            style={{
                              fontFamily: buildFontFamily(draft.typography.tableHeader),
                              fontSize: `${draft.typography.tableHeader.sizePt}pt`,
                              color:
                                draft.table.style === "three_line" ||
                                draft.table.headerBg === "transparent"
                                  ? draft.typography.tableHeader.color
                                  : draft.table.headerTextColor,
                              padding: "4pt 8pt",
                              textAlign: "left",
                            }}
                          >
                            指标项
                          </th>
                          <th
                            style={{
                              fontFamily: buildFontFamily(draft.typography.tableHeader),
                              fontSize: `${draft.typography.tableHeader.sizePt}pt`,
                              color:
                                draft.table.style === "three_line" ||
                                draft.table.headerBg === "transparent"
                                  ? draft.typography.tableHeader.color
                                  : draft.table.headerTextColor,
                              padding: "4pt 8pt",
                              textAlign: "left",
                            }}
                          >
                            规范说明
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            style={{
                              fontFamily: buildFontFamily(draft.typography.tableCell),
                              fontSize: `${draft.typography.tableCell.sizePt}pt`,
                              padding: "4pt 8pt",
                            }}
                          >
                            版心参数
                          </td>
                          <td
                            style={{
                              fontFamily: buildFontFamily(draft.typography.tableCell),
                              fontSize: `${draft.typography.tableCell.sizePt}pt`,
                              padding: "4pt 8pt",
                            }}
                          >
                            {draft.page.size} · 上{draft.page.marginTopMm} / 左{draft.page.marginLeftMm}mm
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            {isCustom
              ? "正在编辑自定义样式，保存后将同步写入工作区 .onedoc/styles/"
              : "内置预置样式：点击保存将自动另存为可自由定制的自定义样式"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>保存并应用样式</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
