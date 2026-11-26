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
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { FileTreeNode } from "../types/workspace";

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    onedoc: { label: "DOC", cls: "bg-blue-100 text-blue-700" },
    docx: { label: "DOCX", cls: "bg-indigo-100 text-indigo-700" },
    md: { label: "MD", cls: "bg-emerald-100 text-emerald-700" },
    txt: { label: "TXT", cls: "bg-slate-200 text-slate-700" },
  };
  const info = map[kind] ?? { label: "FILE", cls: "bg-slate-100 text-slate-600" };
  return (
    <span
      className={`text-[9px] font-semibold px-1 py-0.5 rounded leading-none shrink-0 ${info.cls}`}
    >
      {info.label}
    </span>
  );
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

  const matchesFilter = (n: FileTreeNode): boolean => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    if (n.name.toLowerCase().includes(f)) return true;
    return Boolean(n.children?.some(matchesFilter));
  };

  if (!matchesFilter(node)) return null;

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-xs text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              filter={filter}
            />
          ))}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;
  const isAttached = attachedFiles.some((f) => f.path === node.path);

  return (
    <div
      style={{ paddingLeft: `${depth * 12 + 12}px` }}
      className={`group flex items-center justify-between gap-1.5 py-1.5 pr-1.5 rounded-md text-xs transition-colors cursor-pointer ${
        isActive
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-slate-700 hover:bg-slate-200/60"
      }`}
      onClick={() => void openFileNode(node)}
      title={node.path}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {node.kind === "onedoc" ? (
          <FileCode2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        ) : node.kind === "docx" ? (
          <FileType2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            attachContextFile({ path: node.path, name: node.name, kind: node.kind });
          }}
          title={isAttached ? "已引用到 Agent 上下文" : "附加为 Agent 参考资料 (@引用)"}
          className={`p-0.5 rounded transition-opacity cursor-pointer ${
            isAttached
              ? "opacity-100 text-blue-600 bg-blue-100"
              : "opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 hover:bg-white"
          }`}
        >
          <Paperclip className="w-3 h-3" />
        </button>
        <KindBadge kind={node.kind} />
      </div>
    </div>
  );
}

export function FileTreeSidebar() {
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"onedoc" | "md" | "txt">("onedoc");

  const workspacePath = useAppStore((s) => s.workspacePath);
  const fileTree = useAppStore((s) => s.fileTree);
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog);
  const refreshFileTree = useAppStore((s) => s.refreshFileTree);
  const createDemoWorkspace = useAppStore((s) => s.createDemoWorkspace);
  const createNewDocumentFile = useAppStore((s) => s.createNewDocumentFile);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createNewDocumentFile(newName.trim(), newKind);
    setNewName("");
    setCreating(false);
  };

  return (
    <aside className="w-[240px] shrink-0 bg-[#F8FAFC] border-r border-slate-200/90 flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-slate-200/70 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          工作区文档
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            title="新建文档"
            className="p-1 rounded hover:bg-slate-200/70 text-slate-600 cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void refreshFileTree()}
            title="刷新文件列表"
            className="p-1 rounded hover:bg-slate-200/70 text-slate-600 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {creating && (
        <div className="p-2.5 bg-white border-b border-slate-200 space-y-2">
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
            className="w-full px-2 py-1 text-xs border border-slate-300 rounded outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between gap-1.5">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as "onedoc" | "md" | "txt")}
              className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-slate-50 outline-none"
            >
              <option value="onedoc">.onedoc.json</option>
              <option value="md">.md</option>
              <option value="txt">.txt</option>
            </select>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-2.5 py-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤文件 (docx / md / txt)"
            className="w-full pl-7 pr-2 py-1 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-blue-400 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 pb-3 space-y-0.5">
        {!workspacePath ? (
          <div className="px-2.5 py-4 text-center space-y-2.5">
            <p className="text-xs text-slate-500 leading-relaxed">
              打开本地项目或文稿目录，即可统一预览 <code className="text-[11px] bg-slate-200/70 px-1 rounded">.docx</code>、<code className="text-[11px] bg-slate-200/70 px-1 rounded">.md</code>、<code className="text-[11px] bg-slate-200/70 px-1 rounded">.txt</code> 并供 AI 引用。
            </p>
            <button
              type="button"
              onClick={() => void openWorkspaceDialog()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>打开本地文件夹</span>
            </button>
            <button
              type="button"
              onClick={() => void createDemoWorkspace()}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>一键生成示例工作区</span>
            </button>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400 space-y-2">
            <p>该目录下暂无支持的文档文件</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-blue-600 hover:underline cursor-pointer"
            >
              + 新建第一篇文档
            </button>
          </div>
        ) : (
          fileTree.map((node) => (
            <TreeRow key={node.path} node={node} depth={0} filter={filter} />
          ))
        )}
      </div>

      <div className="p-2 border-t border-slate-200/80 text-[11px] text-slate-400 flex items-center justify-between">
        <span>支持悬停点击 📎 引用资料</span>
      </div>
    </aside>
  );
}
