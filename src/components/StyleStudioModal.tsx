import { useEffect, useState } from "react";
import {
  CopyPlus,
  FileText,
  FileUp,
  Hash,
  Layers,
  LayoutGrid,
  RotateCcw,
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
import {
  buildFontFamily,
  formatHeadingNumber,
  specToCss,
} from "../lib/styleCssMapper";
import { useAppStore } from "../store/useAppStore";
import type {
  StyleProfile,
  TextStyleSpec,
  TypographySet,
} from "../types/style";

type StudioTab = "page" | "typography" | "numbering";
type TypographyRole = keyof TypographySet;

const ROLE_LABELS: {
  key: TypographyRole;
  label: string;
  short: string;
}[] = [
  { key: "title", label: "主标题", short: "Title" },
  { key: "subtitle", label: "副标题", short: "Subtitle" },
  { key: "h1", label: "一级标题", short: "H1" },
  { key: "h2", label: "二级标题", short: "H2" },
  { key: "h3", label: "三级标题", short: "H3" },
  { key: "h4", label: "四级标题", short: "H4" },
  { key: "body", label: "正文", short: "Body" },
  { key: "quote", label: "引用 / 提示框", short: "Quote" },
  { key: "caption", label: "图表题注", short: "Caption" },
  { key: "tableHeader", label: "表格表头", short: "Th" },
  { key: "tableCell", label: "表格正文", short: "Td" },
];

const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  B5: { w: 176, h: 250 },
  Letter: { w: 215.9, h: 279.4 },
};

const FIELD_INPUT =
  "w-full px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all select-text";

const FIELD_SELECT =
  "w-full px-2.5 py-1.5 text-xs text-zinc-900 bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer";

function UnitNumberInput({
  value,
  step = 1,
  unit,
  onChange,
}: {
  value: number;
  step?: number | string;
  unit: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center bg-white border border-zinc-200/90 rounded-lg focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all overflow-hidden">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 px-2.5 py-1.5 text-xs text-zinc-900 tabular-nums outline-none bg-transparent"
      />
      <span className="px-2 py-1.5 text-[10.5px] font-medium text-zinc-400 bg-zinc-50/90 border-l border-zinc-200/60 select-none shrink-0">
        {unit}
      </span>
    </div>
  );
}

function ColorSwatchInput({
  value,
  onChange,
  allowTransparent = false,
}: {
  value: string;
  onChange: (next: string) => void;
  allowTransparent?: boolean;
}) {
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(value);
  const pickerColor = isValidHex ? value : "#18181B";

  return (
    <div className="flex items-center gap-1.5 bg-white border border-zinc-200/90 rounded-lg px-1.5 py-1 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all">
      <label className="relative w-5 h-5 rounded-md border border-zinc-200/90 overflow-hidden shrink-0 cursor-pointer shadow-2xs">
        <span
          className="absolute inset-0"
          style={{
            background:
              value === "transparent"
                ? "repeating-conic-gradient(#e4e4e7 0% 25%, #ffffff 0% 50%) 50% / 8px 8px"
                : value,
          }}
        />
        <input
          type="color"
          value={pickerColor}
          onChange={(e) => onChange(e.target.value)}
          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={allowTransparent ? "#1E3A8A / transparent" : "#1E293B"}
        className="w-full min-w-0 text-xs font-mono text-zinc-800 bg-transparent outline-none tabular-nums select-text"
      />
    </div>
  );
}

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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const allStyles = getAllStyles();
  const builtinStyles = allStyles.filter(
    (st) => !customStyles.some((c) => c.id === st.id)
  );
  const isCustom = customStyles.some((s) => s.id === draft.id);
  const activeRoleSpec = draft.typography[role];
  const activeRoleMeta = ROLE_LABELS.find((x) => x.key === role);

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

  const handleResetDraft = () => {
    const source =
      allStyles.find((s) => s.id === draft.id) ?? getActiveStyle();
    setDraft(cloneStyleProfile(source));
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

  const renderStyleItem = (st: StyleProfile, custom: boolean) => {
    const selected = st.id === draft.id;
    return (
      <div
        key={st.id}
        onClick={() => handleSelectProfile(st)}
        className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all border ${
          selected
            ? "bg-white text-zinc-900 border-zinc-200/90 shadow-2xs"
            : "hover:bg-zinc-200/45 text-zinc-600 hover:text-zinc-900 border-transparent"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0 border border-black/10"
            style={{ backgroundColor: st.colors?.primary || "#18181B" }}
          />
          <div className="min-w-0">
            <div className="font-medium truncate text-[12px]">{st.name}</div>
            <div className="text-[10.5px] text-zinc-400 truncate mt-0.5 tabular-nums">
              {st.typography.body.fontZh} · {st.typography.body.sizePt}pt
            </div>
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
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-zinc-950/35 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[88vh] max-h-[840px] bg-white rounded-2xl border border-zinc-200/80 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.18)] flex flex-col overflow-hidden"
      >
        {/* Clean Header */}
        <div className="px-5 py-3.5 border-b border-zinc-200/75 flex items-center justify-between gap-4 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900">
                  样式契约工作室
                </h2>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-indigo-50/75 text-indigo-700 border border-indigo-200/60">
                  Style Contract
                </span>
                <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                  {isCustom ? "自定义样式" : "内置预置"}
                </span>
              </div>
              <p className="text-[11.5px] text-zinc-500 truncate mt-0.5">
                精确控制 Word (.docx) 版心、中西文字体、行距、多级编号与表格规范
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCreateBlankCustom}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-zinc-100/80 text-zinc-700 border border-zinc-200/90 transition-colors cursor-pointer"
            >
              <CopyPlus className="w-3.5 h-3.5 text-zinc-500" />
              <span>复制新建</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExtractFromDocx()}
              disabled={extracting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/70 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>{extracting ? "正在解析范文..." : "从 .docx 范文提取"}</span>
            </button>
            <div className="w-px h-5 bg-zinc-200/80 mx-0.5" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="关闭 (Esc)"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Left Rail: Templates + Category Nav */}
          <aside className="w-60 shrink-0 border-r border-zinc-200/75 bg-[#FAFAFB] flex flex-col overflow-hidden">
            {/* Inspector Category Switcher */}
            <div className="p-3 border-b border-zinc-200/70 space-y-1">
              <div className="px-2 pb-1 text-[10.5px] font-medium text-zinc-400">
                规范配置分类
              </div>
              {(
                [
                  { id: "typography", label: "字体与段落规范", icon: Type },
                  { id: "page", label: "页面与页眉页脚", icon: FileText },
                  { id: "numbering", label: "多级编号与表格", icon: Hash },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      active
                        ? "bg-white text-zinc-900 border-zinc-200/80 shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/45 border-transparent"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? "text-indigo-600" : "text-zinc-400"
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Style Profiles List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-1">
                <div className="px-2 text-[10.5px] font-medium text-zinc-400">
                  内置预置 ({builtinStyles.length})
                </div>
                {builtinStyles.map((st) => renderStyleItem(st, false))}
              </div>

              {customStyles.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2 text-[10.5px] font-medium text-zinc-400">
                    自定义样式 ({customStyles.length})
                  </div>
                  {customStyles.map((st) => renderStyleItem(st, true))}
                </div>
              )}
            </div>
          </aside>

          {/* Right Property Inspector */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
            {/* Compact Profile Metadata Strip */}
            <div className="px-6 py-3.5 border-b border-zinc-200/75 bg-white shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                    样式模板名称
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    className={`${FIELD_INPUT} font-medium`}
                  />
                </div>
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                    模板用途说明
                  </label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                    className={FIELD_INPUT}
                  />
                </div>
              </div>
            </div>

            {/* Inspector Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* TAB: TYPOGRAPHY */}
              {tab === "typography" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Semantic Role Selector List */}
                  <div className="lg:col-span-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] p-2 space-y-0.5">
                    <div className="px-2.5 py-1.5 text-[10.5px] font-medium text-zinc-400 flex items-center justify-between">
                      <span>语义角色</span>
                      <span className="tabular-nums">{ROLE_LABELS.length}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-0.5">
                      {ROLE_LABELS.map((r) => {
                        const spec = draft.typography[r.key];
                        const active = role === r.key;
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onClick={() => setRole(r.key)}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer border ${
                              active
                                ? "bg-white text-zinc-900 border-zinc-200/90 shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/45 border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 border border-black/10"
                                style={{ backgroundColor: spec.color }}
                              />
                              <span className="text-xs font-medium truncate">
                                {r.label}
                              </span>
                            </div>
                            <span className="text-[10.5px] text-zinc-400 font-mono tabular-nums shrink-0">
                              {spec.sizePt}pt
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Role Spec Cards */}
                  <div className="lg:col-span-8 space-y-4">
                    {/* Font & Size Card */}
                    <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                          <Type className="w-3.5 h-3.5 text-indigo-600" />
                          <span>
                            {activeRoleMeta?.label}
                            <span className="ml-1.5 text-[11px] font-mono font-normal text-zinc-400">
                              {activeRoleMeta?.short}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateSpec({ bold: !activeRoleSpec.bold })
                            }
                            className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                              activeRoleSpec.bold
                                ? "bg-zinc-900 text-white border-zinc-900"
                                : "bg-white text-zinc-600 border-zinc-200/90 hover:bg-zinc-100"
                            }`}
                            title="加粗"
                          >
                            B
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSpec({ italic: !activeRoleSpec.italic })
                            }
                            className={`px-2 py-1 rounded-md text-[11px] italic font-serif border transition-colors cursor-pointer ${
                              activeRoleSpec.italic
                                ? "bg-zinc-900 text-white border-zinc-900"
                                : "bg-white text-zinc-600 border-zinc-200/90 hover:bg-zinc-100"
                            }`}
                            title="斜体"
                          >
                            I
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            中文字体 (w:eastAsia)
                          </label>
                          <input
                            list="zh-fonts-list"
                            value={activeRoleSpec.fontZh}
                            onChange={(e) =>
                              updateSpec({ fontZh: e.target.value })
                            }
                            className={FIELD_INPUT}
                          />
                          <datalist id="zh-fonts-list">
                            {COMMON_ZH_FONTS.map((f) => (
                              <option key={f} value={f} />
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            西文 / 数字字体 (w:ascii)
                          </label>
                          <input
                            list="en-fonts-list"
                            value={activeRoleSpec.fontEn}
                            onChange={(e) =>
                              updateSpec({ fontEn: e.target.value })
                            }
                            className={FIELD_INPUT}
                          />
                          <datalist id="en-fonts-list">
                            {COMMON_EN_FONTS.map((f) => (
                              <option key={f} value={f} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_SELECT}
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
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            字号
                          </label>
                          <UnitNumberInput
                            value={activeRoleSpec.sizePt}
                            step={0.5}
                            unit="pt"
                            onChange={(v) => updateSpec({ sizePt: v })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            文字颜色
                          </label>
                          <ColorSwatchInput
                            value={activeRoleSpec.color}
                            onChange={(c) => updateSpec({ color: c })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            对齐方式
                          </label>
                          <select
                            value={activeRoleSpec.align}
                            onChange={(e) =>
                              updateSpec({ align: e.target.value })
                            }
                            className={FIELD_SELECT}
                          >
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                            <option value="justify">两端对齐</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Paragraph & Spacing Card */}
                    <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
                      <div className="text-xs font-semibold text-zinc-900">
                        段落间距与缩进
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_SELECT}
                          >
                            <option value="multiple">多倍行距</option>
                            <option value="exact">固定磅值</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            行距值
                          </label>
                          <UnitNumberInput
                            value={activeRoleSpec.lineSpacingValue}
                            step={
                              activeRoleSpec.lineSpacingRule === "exact"
                                ? 1
                                : 0.05
                            }
                            unit={
                              activeRoleSpec.lineSpacingRule === "exact"
                                ? "pt"
                                : "倍"
                            }
                            onChange={(v) =>
                              updateSpec({ lineSpacingValue: v })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            首行缩进
                          </label>
                          <UnitNumberInput
                            value={activeRoleSpec.firstLineIndentChars}
                            step={0.5}
                            unit="字符"
                            onChange={(v) =>
                              updateSpec({ firstLineIndentChars: v })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            段前间距
                          </label>
                          <UnitNumberInput
                            value={activeRoleSpec.spaceBeforePt}
                            step={1}
                            unit="pt"
                            onChange={(v) => updateSpec({ spaceBeforePt: v })}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
                            段后间距
                          </label>
                          <UnitNumberInput
                            value={activeRoleSpec.spaceAfterPt}
                            step={1}
                            unit="pt"
                            onChange={(v) => updateSpec({ spaceAfterPt: v })}
                          />
                        </div>
                        <div className="flex items-end pb-1">
                          <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(activeRoleSpec.borderBottom)}
                              onChange={(e) =>
                                updateSpec({ borderBottom: e.target.checked })
                              }
                              className="rounded accent-zinc-900 cursor-pointer"
                            />
                            <span>段底分隔线</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: PAGE & HEADER/FOOTER */}
              {tab === "page" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-900">
                        纸张规格与版心页边距
                      </h3>
                      <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                        {draft.page.widthMm} × {draft.page.heightMm} mm
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[11px] text-zinc-500 mb-1">
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
                          className={FIELD_SELECT}
                        >
                          <option value="A4">A4</option>
                          <option value="B5">B5</option>
                          <option value="Letter">Letter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          上边距
                        </label>
                        <UnitNumberInput
                          value={draft.page.marginTopMm}
                          step={0.5}
                          unit="mm"
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              page: { ...draft.page, marginTopMm: v },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          下边距
                        </label>
                        <UnitNumberInput
                          value={draft.page.marginBottomMm}
                          step={0.5}
                          unit="mm"
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              page: { ...draft.page, marginBottomMm: v },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          左边距
                        </label>
                        <UnitNumberInput
                          value={draft.page.marginLeftMm}
                          step={0.5}
                          unit="mm"
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              page: { ...draft.page, marginLeftMm: v },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          右边距
                        </label>
                        <UnitNumberInput
                          value={draft.page.marginRightMm}
                          step={0.5}
                          unit="mm"
                          onChange={(v) =>
                            setDraft({
                              ...draft,
                              page: { ...draft.page, marginRightMm: v },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-4">
                    <h3 className="text-xs font-semibold text-zinc-900">
                      页眉与页脚设置
                    </h3>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-5">
                        <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                            className="rounded accent-zinc-900 cursor-pointer"
                          />
                          <span>显示页眉</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                            className="rounded accent-zinc-900 cursor-pointer"
                          />
                          <span>页眉底部分隔线</span>
                        </label>
                      </div>

                      {draft.headerFooter.showHeader && (
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_INPUT}
                          />
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-zinc-200/70 space-y-3">
                      <div className="flex flex-wrap items-center gap-5">
                        <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                            className="rounded accent-zinc-900 cursor-pointer"
                          />
                          <span>启用页脚</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                            className="rounded accent-zinc-900 cursor-pointer"
                          />
                          <span>自动页码</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_INPUT}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_SELECT}
                          >
                            <option value="plain">纯数字 (1)</option>
                            <option value="dash">公文一字线 (— 1 —)</option>
                            <option value="of_total">共几页 (1 / N)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={FIELD_SELECT}
                          >
                            <option value="left">居左</option>
                            <option value="center">居中</option>
                            <option value="right">居右</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: NUMBERING & TABLE */}
              {tab === "numbering" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                        <Hash className="w-3.5 h-3.5 text-indigo-600" />
                        <span>多级标题自动编号规则</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                          className="rounded accent-zinc-900 cursor-pointer"
                        />
                        <span>启用确定性自动编号</span>
                      </label>
                    </div>

                    <p className="text-[11px] text-zinc-500">
                      支持占位符：
                      <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-zinc-200/80 font-mono text-[10.5px] text-zinc-700">
                        {"{zh1}"}
                      </code>
                      中文数字（一、二），
                      <code className="mx-1 px-1.5 py-0.5 rounded bg-white border border-zinc-200/80 font-mono text-[10.5px] text-zinc-700">
                        {"{n1}"}
                      </code>
                      阿拉伯数字（1, 2）。
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          { key: "h1Pattern", label: "一级标题格式 (H1)" },
                          { key: "h2Pattern", label: "二级标题格式 (H2)" },
                          { key: "h3Pattern", label: "三级标题格式 (H3)" },
                          { key: "h4Pattern", label: "四级标题格式 (H4)" },
                        ] as const
                      ).map((item) => (
                        <div key={item.key}>
                          <label className="block text-[11px] text-zinc-500 mb-1">
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
                            className={`${FIELD_INPUT} font-mono`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                      <LayoutGrid className="w-3.5 h-3.5 text-indigo-600" />
                      <span>表格排版样式</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
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
                          className={FIELD_SELECT}
                        >
                          <option value="three_line">标准学术三线表</option>
                          <option value="zebra">现代商务斑马纹</option>
                          <option value="grid">全边框标准网格</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-500 mb-1">
                          表头底色 (斑马纹 / 网格)
                        </label>
                        <ColorSwatchInput
                          value={draft.table.headerBg}
                          allowTransparent
                          onChange={(c) =>
                            setDraft({
                              ...draft,
                              table: { ...draft.table, headerBg: c },
                            })
                          }
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
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
                            className="rounded accent-zinc-900 cursor-pointer"
                          />
                          <span>跨页自动重复表头</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Specimen Preview */}
              <div className="rounded-xl border border-zinc-200/75 bg-[#F4F5F7] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>实时样式样张预览 · 所见即导出</span>
                  </div>
                  <span className="text-[10.5px] font-mono text-zinc-400 tabular-nums">
                    {draft.page.size} · {draft.page.marginTopMm}/
                    {draft.page.marginBottomMm}/{draft.page.marginLeftMm}/
                    {draft.page.marginRightMm} mm
                  </span>
                </div>

                <div className="p-6 rounded-xl bg-white border border-zinc-200/80 shadow-[0_6px_24px_-12px_rgba(15,23,42,0.12)] space-y-1">
                  <div style={specToCss(draft.typography.title)}>
                    文档主标题效果示例 Title
                  </div>
                  <div style={specToCss(draft.typography.h1)}>{h1Preview}</div>
                  <div style={specToCss(draft.typography.h2)}>{h2Preview}</div>
                  <p style={specToCss(draft.typography.body)}>
                    本段正文实时呈现当前设置的中文字体（
                    {draft.typography.body.fontZh}）、西文字体（
                    {draft.typography.body.fontEn}）、字号（
                    {draft.typography.body.sizePt}pt）、行距及首行缩进{" "}
                    {draft.typography.body.firstLineIndentChars} 字符的效果。
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
                              fontFamily: buildFontFamily(
                                draft.typography.tableHeader
                              ),
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
                              fontFamily: buildFontFamily(
                                draft.typography.tableHeader
                              ),
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
                              fontFamily: buildFontFamily(
                                draft.typography.tableCell
                              ),
                              fontSize: `${draft.typography.tableCell.sizePt}pt`,
                              padding: "4pt 8pt",
                            }}
                          >
                            版心参数
                          </td>
                          <td
                            style={{
                              fontFamily: buildFontFamily(
                                draft.typography.tableCell
                              ),
                              fontSize: `${draft.typography.tableCell.sizePt}pt`,
                              padding: "4pt 8pt",
                            }}
                          >
                            {draft.page.size} · 上{draft.page.marginTopMm} / 左
                            {draft.page.marginLeftMm}mm
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

        {/* Clean Bottom Action Bar */}
        <div className="px-5 py-3.5 bg-[#FAFAFB]/85 border-t border-zinc-200/75 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleResetDraft}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重置更改</span>
            </button>
            <span className="text-[11.5px] text-zinc-500 truncate hidden sm:inline">
              {isCustom
                ? "保存后将同步写入工作区 .onedoc/styles/"
                : "内置预置样式保存时将另存为自定义副本"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors cursor-pointer"
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
