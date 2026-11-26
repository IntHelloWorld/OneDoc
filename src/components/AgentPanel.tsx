import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Brain,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  FileOutput,
  FileSearch,
  FileText,
  FolderSearch,
  GitCompare,
  GraduationCap,
  ListPlus,
  Loader2,
  Minimize2,
  Palette,
  Paperclip,
  PenLine,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import {
  compactAgentSession,
  followUpAgentPrompt,
  resetAgentSession,
  sendAgentPrompt,
  steerAgentPrompt,
  stopAgentExecution,
} from "../lib/agentEngine";
import { isTauriRuntime } from "../lib/tauriBridge";
import { useAppStore } from "../store/useAppStore";
import type { ToolExecutionLog } from "../types/agent";

interface AgentPanelProps {
  externalPromptSignal?: { nonce: number; blockId: string } | null;
}

const STARTER_PROMPTS = [
  {
    icon: FileText,
    title: "起草国标公文通知",
    subtitle: "GB/T 9704 红头双线 · 目标任务与时间表",
    prompt:
      "请切换至党政机关公文 (GB/T 9704) 样式，帮我起草一份《关于推进智能化无纸办公试点工作的通知》，包含红头双线、工作目标、重点任务和实施时间表。",
  },
  {
    icon: Briefcase,
    title: "撰写技术标书方案",
    subtitle: "招投标书规范 · 架构、响应对比表与里程碑",
    prompt:
      "请切换至招投标书样式，撰写一份《企业文档智能平台项目技术方案》大纲与核心章节，包含系统架构、技术指标响应对比表与交付里程碑。",
  },
  {
    icon: GraduationCap,
    title: "生成学术论文结构",
    subtitle: "高校论文模板 · 摘要、引言、三线表与结论",
    prompt:
      "请切换至高校学术论文模板，生成一篇关于《结构化语义与确定性文档编译方法研究》的完整论文骨架，含摘要、引言、实验三线表与结论。",
  },
  {
    icon: Wand2,
    title: "重构优化当前文档",
    subtitle: "读取大纲与样式契约 · 梳理层次并补充对比表",
    prompt:
      "请先查看当前文档大纲与激活样式，在不改变核心事实的前提下，优化结构层次，补充一份对比总结表格并保持专业表达。",
  },
];

const TOOL_META: Record<
  string,
  { label: string; icon: typeof Wrench }
> = {
  inspect_style_profile: { label: "读取样式契约", icon: Palette },
  get_document_outline: { label: "获取文档大纲", icon: BookOpen },
  read_document_blocks: { label: "读取文档区块", icon: FileSearch },
  list_workspace_files: { label: "浏览工作区文件", icon: FolderSearch },
  read_workspace_file: { label: "读取参考文件", icon: FileText },
  replace_document: { label: "生成 / 重构整篇文档", icon: PenLine },
  upsert_blocks: { label: "局部更新区块", icon: PenLine },
  update_style_profile: { label: "调整文档样式", icon: Palette },
  export_docx: { label: "编译导出 DOCX", icon: FileOutput },
};

function ToolRow({ log }: { log: ToolExecutionLog }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[log.name];
  const ToolIcon = meta?.icon ?? Wrench;
  const hasDetails = Boolean(log.argsPreview || log.resultPreview);

  return (
    <div className="rounded-xl border border-zinc-200/75 bg-[#FAFAFB] overflow-hidden transition-colors">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={`w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-left transition-colors ${
          hasDetails
            ? "hover:bg-zinc-100/70 cursor-pointer"
            : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 flex items-center justify-center">
            {log.status === "running" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : log.status === "error" ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
          </span>
          <ToolIcon className="w-3 h-3 text-zinc-400 shrink-0" />
          <span className="text-[11.5px] font-medium text-zinc-700 truncate">
            {meta?.label ?? log.name}
          </span>
          {meta && (
            <span className="text-[10px] font-mono text-zinc-400 truncate hidden sm:inline">
              {log.name}
            </span>
          )}
        </div>
        {hasDetails && (
          <span className="text-zinc-400 shrink-0">
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-3 py-2 border-t border-zinc-200/70 bg-white space-y-1.5 font-mono text-[10.5px] leading-relaxed text-zinc-600 break-all select-text">
          {log.argsPreview && (
            <div>
              <span className="text-zinc-400 select-none">args · </span>
              <span>{log.argsPreview}</span>
            </div>
          )}
          {log.resultPreview && (
            <div>
              <span className="text-zinc-400 select-none">result · </span>
              <span>{log.resultPreview}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingDrawer({
  thinking,
  isStreaming,
}: {
  thinking: string;
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-200/75 bg-[#FAFAFB] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium min-w-0">
          <Brain
            className={`w-3.5 h-3.5 shrink-0 ${
              isStreaming
                ? "text-indigo-600 animate-pulse"
                : "text-zinc-400"
            }`}
          />
          <span className={isStreaming ? "text-indigo-700" : "text-zinc-600"}>
            {isStreaming ? "正在深度思考" : "思考过程"}
          </span>
          <span className="text-[10.5px] text-zinc-400 tabular-nums">
            {thinking.length} 字
          </span>
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-3 py-2.5 border-t border-zinc-200/65 bg-white/70 text-[11.5px] text-zinc-500 whitespace-pre-wrap leading-relaxed select-text max-h-52 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-zinc-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded-md bg-zinc-100 border border-zinc-200/70 text-zinc-800 font-mono text-[11px]"
        >
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function SimpleMarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-[13px] leading-[1.65] text-zinc-800 select-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith("### ")) {
          return (
            <div
              key={idx}
              className="font-semibold text-[13px] text-zinc-900 pt-1.5 tracking-tight"
            >
              {renderInlineMarkdown(trimmed.slice(4))}
            </div>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <div
              key={idx}
              className="font-semibold text-[14px] text-zinc-900 pt-2 tracking-tight"
            >
              {renderInlineMarkdown(trimmed.slice(3))}
            </div>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-0.5">
              <span className="w-1 h-1 rounded-full bg-zinc-400 mt-2 shrink-0" />
              <span className="flex-1">
                {renderInlineMarkdown(trimmed.slice(2))}
              </span>
            </div>
          );
        }
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span className="text-[11.5px] font-medium text-zinc-400 tabular-nums mt-[1px] shrink-0">
                {orderedMatch[1]}.
              </span>
              <span className="flex-1">
                {renderInlineMarkdown(orderedMatch[2])}
              </span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export function AgentPanel({ externalPromptSignal }: AgentPanelProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const activeFileName = useAppStore((s) => s.activeFileName);
  const activeStyleId = useAppStore((s) => s.activeStyleId);
  const customStyles = useAppStore((s) => s.customStyles);
  const getActiveStyle = useAppStore((s) => s.getActiveStyle);
  const selectedBlockIds = useAppStore((s) => s.selectedBlockIds);
  const attachedFiles = useAppStore((s) => s.attachedFiles);
  const messages = useAppStore((s) => s.messages);
  const isAgentRunning = useAppStore((s) => s.isAgentRunning);
  const providerConfig = useAppStore((s) => s.providerConfig);
  const piSidecarStatus = useAppStore((s) => s.piSidecarStatus);
  const providerCatalog = useAppStore((s) => s.providerCatalog);
  const pendingDiff = useAppStore((s) => s.pendingDiff);

  const detachContextFile = useAppStore((s) => s.detachContextFile);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setStyleStudioOpen = useAppStore((s) => s.setStyleStudioOpen);
  const acceptAllDiffs = useAppStore((s) => s.acceptAllDiffs);
  const rejectAllDiffs = useAppStore((s) => s.rejectAllDiffs);

  void activeStyleId;
  void customStyles;
  const activeStyle = getActiveStyle();
  const desktopMode = isTauriRuntime();
  const activeCat =
    providerConfig.mode === "builtin"
      ? providerCatalog.find((p) => p.id === providerConfig.id)
      : undefined;
  const isAccountReady =
    providerConfig.mode === "custom"
      ? Boolean(
          providerConfig.apiKey ||
            providerConfig.baseUrl.includes("localhost") ||
            providerConfig.baseUrl.includes("127.0.0.1")
        )
      : Boolean(activeCat?.authenticated);

  const diffStats = useMemo(() => {
    if (!pendingDiff) return null;
    let added = 0;
    let modified = 0;
    let deleted = 0;
    for (const e of pendingDiff.entries) {
      if (e.kind === "added") added++;
      else if (e.kind === "modified") modified++;
      else if (e.kind === "deleted") deleted++;
    }
    return { added, modified, deleted, total: added + modified + deleted };
  }, [pendingDiff]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 52), 164);
    el.style.height = `${nextHeight}px`;
  }, [input]);

  useEffect(() => {
    if (externalPromptSignal) {
      if (!input.trim()) {
        setInput("请将我选中的区块改写得更加严谨、专业、条理清晰：");
      }
      inputRef.current?.focus();
    }
  }, [externalPromptSignal]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    if (isAgentRunning) {
      if (desktopMode) void steerAgentPrompt(trimmed);
      return;
    }
    void sendAgentPrompt(trimmed);
  };

  const handleSteer = () => {
    const trimmed = input.trim();
    if (!trimmed || !isAgentRunning || !desktopMode) return;
    setInput("");
    void steerAgentPrompt(trimmed);
  };

  const handleFollowUp = () => {
    const trimmed = input.trim();
    if (!trimmed || !isAgentRunning || !desktopMode) return;
    setInput("");
    void followUpAgentPrompt(trimmed);
  };

  const providerLabel =
    providerConfig.mode === "builtin"
      ? `${activeCat?.name || providerConfig.id}${
          activeCat?.authType === "oauth" ? " · OAuth" : ""
        }`
      : "自定义网关";

  return (
    <aside className="w-[360px] lg:w-[380px] xl:w-[400px] shrink-0 bg-white border-l border-zinc-200/75 flex flex-col h-full">
      {/* Compact AI-Native Header */}
      <div className="px-4 py-3 border-b border-zinc-200/75 flex items-center justify-between gap-2 shrink-0 bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-[0_2px_8px_-2px_rgba(79,70,229,0.5)]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold tracking-tight text-zinc-900">
                OneDoc AI
              </span>
              {desktopMode && (
                <span
                  title={
                    piSidecarStatus.lastError ||
                    (isAgentRunning
                      ? "Pi Agent 正在生成中"
                      : piSidecarStatus.running
                      ? "Pi Agent Sidecar 已连接"
                      : "Pi Agent Sidecar 待机")
                  }
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    isAgentRunning
                      ? "bg-indigo-500 animate-pulse"
                      : piSidecarStatus.running
                      ? "bg-emerald-500"
                      : piSidecarStatus.lastError
                      ? "bg-amber-500"
                      : "bg-zinc-300"
                  }`}
                />
              )}
              {isAgentRunning && (
                <span className="text-[10.5px] font-medium text-indigo-600">
                  生成中
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="点击切换模型或管理订阅账号"
              className="mt-0.5 inline-flex items-center gap-1.5 max-w-[235px] rounded-md px-1.5 py-0.5 -ml-1.5 text-[11px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isAccountReady ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
              <span className="truncate font-medium text-zinc-600">
                {providerLabel}
              </span>
              <span className="text-zinc-300">/</span>
              <span className="truncate font-mono text-[10.5px] text-zinc-500">
                {providerConfig.model}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {messages.length > 2 && desktopMode && (
            <button
              type="button"
              onClick={() => void compactAgentSession()}
              disabled={isAgentRunning}
              title="压缩早期上下文（Pi Session Compaction）"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-35 transition-colors cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => void resetAgentSession()}
              title="清空并新建会话"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="模型与订阅账号设置"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Message Stream / Minimalist Welcome State */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-5 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="pt-4 pb-2 space-y-5">
            {/* Serene Emblem & Subtitle */}
            <div className="space-y-2.5 px-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(79,70,229,0.5)]">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                  文档智能协作者
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed mt-1">
                  遵循当前样式契约起草、润色与重构文档，支持途中引导与块级 Diff 审核。
                </p>
              </div>

              {!isAccountReady && (
                <div className="mt-3 p-3 rounded-xl bg-[#FAFAFB] border border-zinc-200/80 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-800">
                      连接模型账号以开始写作
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                      支持 Claude / ChatGPT / Copilot OAuth 订阅直登
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors shrink-0 cursor-pointer"
                  >
                    登录配置
                  </button>
                </div>
              )}
            </div>

            {/* Starter Prompt Chips */}
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-zinc-400 px-1 tracking-wide">
                推荐起点
              </div>
              <div className="space-y-1.5">
                {STARTER_PROMPTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => void sendAgentPrompt(item.prompt)}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-[#FAFAFB] hover:bg-white border border-zinc-200/75 hover:border-zinc-300/90 hover:shadow-2xs transition-all cursor-pointer group flex items-start gap-2.5"
                    >
                      <div className="w-6 h-6 rounded-lg bg-white border border-zinc-200/80 text-zinc-500 group-hover:text-indigo-600 group-hover:border-indigo-200/80 group-hover:bg-indigo-50/50 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-zinc-800 group-hover:text-zinc-950 truncate">
                            {item.title}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user"
                  ? "flex flex-col items-end"
                  : "space-y-2.5"
              }
            >
              {msg.role === "user" ? (
                <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-zinc-100/90 border border-zinc-200/60 text-zinc-900 px-3.5 py-2.5 text-[13px] leading-relaxed select-text">
                  {msg.isSteering && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50/90 text-amber-700 border border-amber-200/70 px-1.5 py-0.5 rounded-md mr-1.5 align-middle">
                      <CornerDownRight className="w-2.5 h-2.5" />
                      途中引导
                    </span>
                  )}
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Minimal AI attribution row */}
                  <div className="flex items-center gap-1.5">
                    <span className="w-4.5 h-4.5 rounded-md bg-indigo-50/85 border border-indigo-200/60 text-indigo-600 flex items-center justify-center shrink-0">
                      <Sparkles className="w-2.5 h-2.5" />
                    </span>
                    <span className="text-[11px] font-medium text-zinc-500">
                      OneDoc AI
                    </span>
                    {msg.isStreaming && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-indigo-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      </span>
                    )}
                  </div>

                  {msg.thinking && (
                    <ThinkingDrawer
                      thinking={msg.thinking}
                      isStreaming={Boolean(msg.isStreaming && !msg.content)}
                    />
                  )}

                  {msg.tools && msg.tools.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.tools.map((t) => (
                        <ToolRow key={t.id} log={t} />
                      ))}
                    </div>
                  )}

                  {msg.content && (
                    <div className="pl-0.5">
                      <SimpleMarkdownText text={msg.content} />
                    </div>
                  )}

                  {msg.isStreaming &&
                    !msg.content &&
                    !msg.thinking &&
                    (!msg.tools || msg.tools.length === 0) && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500 pl-0.5 py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                        <span>正在理解上下文与编排文档...</span>
                      </div>
                    )}

                  {msg.error && (
                    <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200/75 text-xs text-rose-700 flex items-start gap-2 break-all select-text">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                      <span>{msg.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pending Diff Floating Strip */}
      {pendingDiff && diffStats && (
        <div className="px-3 pb-2 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-emerald-50/75 border border-emerald-200/75 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <GitCompare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11.5px] font-medium text-zinc-900 truncate">
                  {pendingDiff.summary || "待审核文档变更"}
                </div>
                <div className="text-[10.5px] text-zinc-500 tabular-nums flex items-center gap-1.5">
                  {diffStats.added > 0 && (
                    <span className="text-emerald-700">
                      +{diffStats.added} 新增
                    </span>
                  )}
                  {diffStats.modified > 0 && (
                    <span className="text-amber-700">
                      ~{diffStats.modified} 修改
                    </span>
                  )}
                  {diffStats.deleted > 0 && (
                    <span className="text-rose-700">
                      -{diffStats.deleted} 删除
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={rejectAllDiffs}
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-zinc-600 hover:text-rose-700 hover:bg-white/80 transition-colors cursor-pointer"
              >
                撤销
              </button>
              <button
                type="button"
                onClick={acceptAllDiffs}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>接受</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI-Native Composer Card */}
      <div className="px-3 pb-3 pt-1 shrink-0 bg-white">
        <div className="rounded-xl bg-white border border-zinc-200/90 shadow-xs focus-within:border-indigo-400/80 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all overflow-hidden">
          {/* Context pills cleanly seated inside top of composer */}
          <div className="px-2.5 pt-2 pb-1.5 border-b border-zinc-100 flex flex-wrap items-center gap-1.5">
            <span
              title={activeFileName}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-zinc-100/85 text-zinc-600 border border-zinc-200/60 max-w-[148px]"
            >
              <FileText className="w-2.5 h-2.5 text-zinc-400 shrink-0" />
              <span className="truncate">{activeFileName}</span>
            </span>

            <button
              type="button"
              onClick={() => setStyleStudioOpen(true)}
              title="点击打开样式契约工作室"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-indigo-50/75 hover:bg-indigo-100/75 text-indigo-700 border border-indigo-200/60 max-w-[148px] transition-colors cursor-pointer"
            >
              <Sparkles className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{activeStyle.name}</span>
            </button>

            {selectedBlockIds.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-amber-50/85 border border-amber-200/70 text-amber-700 tabular-nums">
                <span>已选 {selectedBlockIds.length} 块</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  title="取消选中区块"
                  className="hover:text-amber-950 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {attachedFiles.map((f) => (
              <span
                key={f.path}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-emerald-50/80 border border-emerald-200/70 text-emerald-700 max-w-[155px]"
              >
                <Paperclip className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => detachContextFile(f.path)}
                  title="移除参考文件"
                  className="hover:text-emerald-950 cursor-pointer"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>

          {/* Borderless auto-growing textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder={
              isAgentRunning && desktopMode
                ? "生成中可输入纠偏指令，Enter 发送途中引导 (Steer)..."
                : selectedBlockIds.length > 0
                ? "输入针对已选区块的改写、扩写或润色要求..."
                : "描述写作目标、文档大纲或排版调整..."
            }
            className="w-full resize-none px-3 pt-2.5 pb-1.5 text-[13px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 outline-none bg-transparent select-text"
          />

          {/* Bottom action bar */}
          <div className="px-2.5 pb-2 pt-1 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-zinc-400 truncate">
              {selectedBlockIds.length > 0
                ? "聚焦已选区块 · 块级 Diff 审核"
                : isAgentRunning
                ? "支持途中引导或排队追问"
                : "Enter 发送 · Shift+Enter 换行"}
            </span>

            {isAgentRunning ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {desktopMode && input.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={handleSteer}
                      title="当前工具执行完后立即插话纠偏"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-colors cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>引导</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFollowUp}
                      title="待本轮完全结束后自动追问"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 transition-colors cursor-pointer"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>追问</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void stopAgentExecution()}
                  title="停止当前生成"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 transition-colors cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>停止</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                title="发送指令 (Enter)"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-2xs disabled:opacity-35 disabled:from-zinc-300 disabled:to-zinc-300 disabled:shadow-none transition-all cursor-pointer shrink-0"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
