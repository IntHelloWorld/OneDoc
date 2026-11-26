import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { FileTreeNode } from "../types/workspace";

function KindBadge({ kind, active }: { kind: string; active?: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    onedoc: {
      label: "DOC",
      cls: active
        ? "bg-indigo-100/90 text-indigo-700 border-indigo-200/80"
        : "bg-indigo-50/75 text-indigo-600/90 border-indigo-200/50",
    },
    docx: {
      label: "DOCX",
      cls: "bg-zinc-100 text-zinc-600 border-zinc-200/75",
    },
    md: {
      label: "MD",
      cls: "bg-zinc-100 text-zinc-600 border-zinc-200/75",
    },
    txt: {
      label: "TXT",
      cls: "bg-zinc-100 text-zinc-500 border-zinc-200/70",
    },
  };
  const info = map[kind] ?? {
    label: "FILE",
    cls: "bg-zinc-100 text-zinc-500 border-zinc-200/70",
  };
  return (
    <span
      className={`text-[9px] font-medium tracking-wide px-1.5 py-[2px] rounded-md border leading-none shrink-0 ${info.cls}`}
    >
      {info.label}
    </span>
  );
}

function nodeMatchesFilter(n: FileTreeNode, filter: string): boolean {
  if (!filter.trim()) return true;
  const f = filter.trim().toLowerCase();
  if (n.name.toLowerCase().includes(f)) return true;
  return Boolean(n.children?.some((child) => nodeMatchesFilter(child, f)));
}

function TreeRow({
  node,
  depth,
  filter,
}: {
  node: FileTreeNode;
  depth: number;
  filter: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const attachedFiles = useAppStore((s) => s.attachedFiles);
  const openFileNode = useAppStore((s) => s.openFileNode);
  const attachContextFile = useAppStore((s) => s.attachContextFile);
  const detachContextFile = useAppStore((s) => s.detachContextFile);

  if (!nodeMatchesFilter(node, filter)) return null;

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="group w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200/50 hover:text-zinc-900 rounded-lg transition-colors cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>

        {expanded && node.children && node.children.length > 0 && (
          <div className="ml-3.5 pl-2 border-l border-zinc-200/80 space-y-0.5 mt-0.5">
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                filter={filter}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;
  const isAttached = attachedFiles.some((f) => f.path === node.path);

  return (
    <div
      className={`group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
        isActive
          ? "bg-zinc-200/65 text-zinc-900 font-medium"
          : "text-zinc-600 hover:bg-zinc-200/45 hover:text-zinc-900"
      }`}
      onClick={() => void openFileNode(node)}
      title={node.path}
    >
      <div className="flex items-center gap-2 min-w-0">
        {node.kind === "onedoc" ? (
          <FileCode2
            className={`w-3.5 h-3.5 shrink-0 ${
              isActive ? "text-indigo-600" : "text-zinc-400 group-hover:text-zinc-600"
            }`}
          />
        ) : node.kind === "docx" ? (
          <FileType2
            className={`w-3.5 h-3.5 shrink-0 ${
              isActive ? "text-zinc-800" : "text-zinc-400 group-hover:text-zinc-600"
            }`}
          />
        ) : (
          <FileText
            className={`w-3.5 h-3.5 shrink-0 ${
              isActive ? "text-zinc-800" : "text-zinc-400 group-hover:text-zinc-600"
            }`}
          />
        )}
        <span className="truncate">{node.name}</span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isAttached) {
              detachContextFile(node.path);
            } else {
              attachContextFile({
                path: node.path,
                name: node.name,
                kind: node.kind,
              });
            }
          }}
          title={
            isAttached
              ? "已引用到 Agent 上下文（点击取消引用）"
              : "附加为 Agent 参考资料 (@引用)"
          }
          className={`p-1 rounded-md transition-all cursor-pointer ${
            isAttached
              ? "opacity-100 text-indigo-600 bg-indigo-50/90 border border-indigo-200/70"
              : "opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-indigo-600 hover:bg-white"
          }`}
        >
          <Paperclip className="w-3 h-3" />
        </button>
        <KindBadge kind={node.kind} active={isActive} />
      </div>
    </div>
  );
}

export function FileTreeSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"onedoc" | "md" | "txt">("onedoc");

  const workspacePath = useAppStore((s) => s.workspacePath);
  const fileTree = useAppStore((s) => s.fileTree);
  const attachedFiles = useAppStore((s) => s.attachedFiles);
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog);
  const refreshFileTree = useAppStore((s) => s.refreshFileTree);
  const createDemoWorkspace = useAppStore((s) => s.createDemoWorkspace);
  const createNewDocumentFile = useAppStore((s) => s.createNewDocumentFile);
  const extractStyleFromDocxDialog = useAppStore(
    (s) => s.extractStyleFromDocxDialog
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createNewDocumentFile(newName.trim(), newKind);
    setNewName("");
    setCreating(false);
  };

  if (collapsed) {
    return (
      <aside className="w-[46px] shrink-0 bg-[#FAFAFB] border-r border-zinc-200/75 flex flex-col items-center py-2.5 gap-1.5 h-full select-none">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展开工作区侧边栏"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
        <div className="w-5 h-px bg-zinc-200/80 my-0.5" />
        <button
          type="button"
          onClick={() => {
            setCollapsed(false);
            setCreating(true);
          }}
          title="新建文档"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
        >
          <FilePlus className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void openWorkspaceDialog()}
          title="打开本地工作区"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void extractStyleFromDocxDialog()}
          title="从 .docx 范文提取样式"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50/70 transition-colors cursor-pointer"
        >
          <Wand2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void refreshFileTree()}
          title="刷新文件列表"
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[244px] shrink-0 bg-[#FAFAFB] border-r border-zinc-200/75 flex flex-col h-full select-none">
      {/* Header */}
      <div className="h-10 px-3 border-b border-zinc-200/75 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[11px] font-semibold tracking-wide text-zinc-500">
          工作区
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            title="新建文档"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              creating
                ? "bg-zinc-200/75 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60"
            }`}
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void extractStyleFromDocxDialog()}
            title="从 .docx 范文提取样式模板"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50/70 transition-colors cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void openWorkspaceDialog()}
            title="打开或切换本地文件夹"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void refreshFileTree()}
            title="刷新文件列表"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="折叠侧边栏"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline New Document Popover */}
      {creating && (
        <div className="mx-2.5 mt-2.5 p-2.5 rounded-xl bg-white border border-zinc-200/90 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.08)] space-y-2 animate-float-in">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="输入文档名称..."
            autoFocus
            className="w-full px-2.5 py-1.5 text-xs text-zinc-900 bg-[#FAFAFB] border border-zinc-200/90 rounded-lg outline-none focus:bg-white focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-zinc-400 transition-all"
          />
          <div className="flex items-center justify-between gap-1.5">
            <select
              value={newKind}
              onChange={(e) =>
                setNewKind(e.target.value as "onedoc" | "md" | "txt")
              }
              className="text-[11px] font-medium text-zinc-700 border border-zinc-200/80 rounded-lg px-2 py-1 bg-[#FAFAFB] outline-none cursor-pointer"
            >
              <option value="onedoc">.onedoc.json</option>
              <option value="md">.md</option>
              <option value="txt">.txt</option>
            </select>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search filter */}
      <div className="px-2.5 py-2 shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索工作区文件..."
            className="w-full pl-7 pr-7 py-1.5 text-xs text-zinc-800 bg-white/85 hover:bg-white border border-zinc-200/80 rounded-lg outline-none focus:bg-white focus:border-indigo-400/80 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-zinc-400 transition-all"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-zinc-400 hover:text-zinc-700 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree / Empty states */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {!workspacePath ? (
          <div className="mx-0.5 my-2 p-4 rounded-xl bg-white border border-zinc-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.03)] text-center space-y-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-100/90 border border-zinc-200/70 flex items-center justify-center mx-auto text-zinc-500">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-800">
                挂载本地工作区
              </p>
              <p className="text-[11.5px] text-zinc-500 leading-relaxed">
                统一管理{" "}
                <code className="text-[10.5px] font-mono bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded">
                  .docx
                </code>{" "}
                <code className="text-[10.5px] font-mono bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded">
                  .md
                </code>{" "}
                <code className="text-[10.5px] font-mono bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded">
                  .txt
                </code>
                ，随时引用供 AI 撰写。
              </p>
            </div>
            <div className="space-y-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => void openWorkspaceDialog()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors shadow-2xs cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>打开本地文件夹</span>
              </button>
              <button
                type="button"
                onClick={() => void createDemoWorkspace()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-indigo-50/75 hover:bg-indigo-100/75 text-indigo-700 border border-indigo-200/65 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>一键生成示例工作区</span>
              </button>
            </div>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="mx-1 my-4 p-4 rounded-xl border border-dashed border-zinc-200/90 text-center space-y-2">
            <p className="text-xs text-zinc-400">暂无支持的文档文件</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              <FilePlus className="w-3.5 h-3.5" />
              <span>新建第一篇文档</span>
            </button>
          </div>
        ) : filter.trim() &&
          !fileTree.some((node) => nodeMatchesFilter(node, filter)) ? (
          <div className="px-3 py-8 text-center text-xs text-zinc-400 space-y-1.5">
            <p>未找到匹配 “{filter.trim()}” 的文档</p>
            <button
              type="button"
              onClick={() => setFilter("")}
              className="text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer"
            >
              清除过滤
            </button>
          </div>
        ) : (
          fileTree.map((node) => (
            <TreeRow key={node.path} node={node} depth={0} filter={filter} />
          ))
        )}
      </div>

      {/* Subtle Footer */}
      <div className="px-3 py-2 border-t border-zinc-200/75 text-[11px] text-zinc-400 flex items-center justify-between gap-2 shrink-0">
        <span className="truncate flex items-center gap-1">
          <Paperclip className="w-3 h-3 shrink-0" />
          <span>悬停点击可 @引用资料</span>
        </span>
        {attachedFiles.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-medium tabular-nums shrink-0">
            <Sparkles className="w-2.5 h-2.5" />
            {attachedFiles.length}
          </span>
        )}
      </div>
    </aside>
  );
}
