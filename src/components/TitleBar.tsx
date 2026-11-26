import {
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
    : "未挂载工作区";

  const modes: { id: ViewMode; label: string }[] = [
    { id: "preview", label: "排版预览" },
    { id: "split", label: "分屏" },
    { id: "source", label: "Markdown 源码" },
  ];

  // Re-evaluate whenever customStyles changes
  void customStyles;

  return (
    <header className="h-12 shrink-0 bg-white border-b border-slate-200/90 px-3 flex items-center justify-between gap-3">
      {/* Left: Brand + Workspace + Active Style Switcher */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-900">
            OneDoc
          </span>
        </div>

        <button
          type="button"
          onClick={openWorkspaceDialog}
          title={workspacePath || "打开本地工作区文件夹"}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors max-w-[170px] truncate cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="truncate">{folderName}</span>
        </button>

        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/90 rounded-md px-2 py-1">
          <span className="text-[11px] text-slate-400 shrink-0">样式契约:</span>
          <select
            value={activeStyleId}
            onChange={(e) => setActiveStyleId(e.target.value)}
            className="text-xs font-medium text-slate-800 bg-transparent outline-none cursor-pointer max-w-[165px] truncate"
          >
            {allStyles.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setStyleStudioOpen(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/70 transition-colors cursor-pointer shrink-0"
        >
          <Palette className="w-3.5 h-3.5" />
          <span>样式工作室</span>
        </button>
      </div>

      {/* Center: View mode segmented control */}
      <div className="flex items-center gap-2 shrink-0">
        {activeFileKind !== "docx" && (
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/70">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setViewMode(m.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === m.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        <span className="hidden xl:inline-flex items-center gap-1 text-xs text-slate-500 max-w-[190px] truncate">
          <span className="truncate">{activeFileName}</span>
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="有未保存修改" />
          )}
        </span>
      </div>

      {/* Right: Undo, Save, Export DOCX, Settings */}
      <div className="flex items-center gap-1.5 shrink-0">
        {undoCount > 0 && (
          <button
            type="button"
            onClick={undo}
            title="撤销文档更改 (Ctrl+Z)"
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => void saveActiveFile()}
          title="保存当前文件 (Ctrl+S)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存</span>
        </button>

        <button
          type="button"
          onClick={() => void exportActiveDocx()}
          disabled={activeFileKind === "docx"}
          title="按当前样式规范编译导出 Word (.docx)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>导出 .docx</span>
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="模型接口与 Agent 设置"
          className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
