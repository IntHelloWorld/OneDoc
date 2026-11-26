import {
  ChevronDown,
  FileDown,
  FolderOpen,
  Palette,
  Save,
  Settings,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { ViewMode } from "../types/workspace";

export function TitleBar() {
  const workspacePath = useAppStore((s) => s.workspacePath);
  const activeFileName = useAppStore((s) => s.activeFileName);
  const activeFileKind = useAppStore((s) => s.activeFileKind);
  const isDirty = useAppStore((s) => s.isDirty);
  const viewMode = useAppStore((s) => s.viewMode);
  const activeStyleId = useAppStore((s) => s.activeStyleId);
  const customStyles = useAppStore((s) => s.customStyles);
  const undoCount = useAppStore((s) => s.undoStack.length);

  const getAllStyles = useAppStore((s) => s.getAllStyles);
  const setActiveStyleId = useAppStore((s) => s.setActiveStyleId);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setStyleStudioOpen = useAppStore((s) => s.setStyleStudioOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog);
  const saveActiveFile = useAppStore((s) => s.saveActiveFile);
  const exportActiveDocx = useAppStore((s) => s.exportActiveDocx);
  const undo = useAppStore((s) => s.undo);

  const allStyles = getAllStyles();
  const folderName = workspacePath
    ? workspacePath.split(/[\\/]/).filter(Boolean).pop() || workspacePath
    : "打开工作区";

  const modes: { id: ViewMode; label: string }[] = [
    { id: "preview", label: "排版预览" },
    { id: "split", label: "分屏" },
    { id: "source", label: "源码" },
  ];

  // Re-evaluate whenever customStyles changes
  void customStyles;

  return (
    <header className="h-12 shrink-0 bg-white/95 backdrop-blur-xs border-b border-zinc-200/75 px-3.5 flex items-center justify-between gap-3 select-none">
      {/* Left: Brand + Workspace + Unified Style Contract Control */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-[7px] bg-gradient-to-br from-zinc-900 via-indigo-950 to-indigo-600 flex items-center justify-center text-white shadow-[0_1px_2px_rgba(15,23,42,0.16)] ring-1 ring-inset ring-white/15">
            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
          </div>
          <span className="font-semibold text-[13.5px] tracking-[-0.02em] text-zinc-900">
            OneDoc
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-200/80 shrink-0 mx-0.5" />

        <button
          type="button"
          onClick={openWorkspaceDialog}
          title={workspacePath || "打开本地工作区文件夹"}
          className="group flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/90 transition-colors max-w-[148px] xl:max-w-[180px] truncate cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
          <span className="truncate">{folderName}</span>
        </button>

        {/* Unified style selector + Style Studio trigger */}
        <div className="flex items-center rounded-lg border border-zinc-200/80 bg-[#FAFAFB] hover:border-zinc-300/80 transition-colors shrink-0">
          <div className="relative flex items-center">
            <select
              value={activeStyleId}
              onChange={(e) => setActiveStyleId(e.target.value)}
              aria-label="切换样式契约"
              title="切换当前文档绑定的排版样式契约"
              className="appearance-none text-xs font-medium text-zinc-800 bg-transparent pl-2.5 pr-6 py-1 outline-none cursor-pointer max-w-[140px] xl:max-w-[170px] truncate"
            >
              {allStyles.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 pointer-events-none absolute right-2" />
          </div>

          <div className="h-3.5 w-px bg-zinc-200/85 shrink-0" />

          <button
            type="button"
            onClick={() => setStyleStudioOpen(true)}
            title="打开样式工作室，精细微调或从范文提取样式"
            className="flex items-center gap-1 px-2 py-1 rounded-r-[7px] text-xs font-medium text-zinc-600 hover:text-indigo-700 hover:bg-indigo-50/70 transition-colors cursor-pointer shrink-0"
          >
            <Palette className="w-3.5 h-3.5" />
            <span>样式工作室</span>
          </button>
        </div>
      </div>

      {/* Center: Segmented view mode switcher + active filename & unsaved dot */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        {activeFileKind !== "docx" && (
          <div
            role="tablist"
            aria-label="文档视图模式"
            className="inline-flex items-center bg-zinc-100/90 p-0.5 rounded-lg border border-zinc-200/60"
          >
            {modes.map((m) => {
              const active = viewMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setViewMode(m.id)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-white text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-900/[0.04]"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}

        <div
          className={`${
            activeFileKind === "docx"
              ? "inline-flex bg-zinc-100/80 border border-zinc-200/60 px-2.5 py-1 rounded-full"
              : "hidden xl:inline-flex"
          } items-center gap-1.5 text-xs text-zinc-500 max-w-[190px] 2xl:max-w-[240px] truncate`}
          title={activeFileName}
        >
          <span className="truncate font-normal">{activeFileName}</span>
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-500 ring-2 ring-amber-500/20 shrink-0"
              title="有未保存修改"
            />
          )}
        </div>
      </div>

      {/* Right: Undo, Save, Obsidian Primary Export, Settings */}
      <div className="flex items-center gap-1.5 shrink-0">
        {undoCount > 0 && (
          <button
            type="button"
            onClick={undo}
            title={`撤销文档更改 (${undoCount}) · Ctrl+Z`}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => void saveActiveFile()}
          title="保存当前文件 (Ctrl+S)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100/80 border border-zinc-200/90 transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5 text-zinc-500" />
          <span>保存</span>
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
              aria-hidden="true"
            />
          )}
        </button>

        <button
          type="button"
          onClick={() => void exportActiveDocx()}
          disabled={activeFileKind === "docx"}
          title="按当前样式规范编译导出 Word (.docx)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-[0_1px_2px_rgba(15,23,42,0.12)] cursor-pointer"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>导出 .docx</span>
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="模型接口与 Agent 设置"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
