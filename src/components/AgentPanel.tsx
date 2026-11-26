import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Eraser,
  ListPlus,
  Loader2,
  Minimize2,
  Paperclip,
  Send,
  Sparkles,
  Square,
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
    title: "起草国标公文通知",
    prompt:
      "请切换至党政机关公文 (GB/T 9704) 样式，帮我起草一份《关于推进智能化无纸办公试点工作的通知》，包含红头双线、工作目标、重点任务和实施时间表。",
  },
  {
    title: "撰写技术标书方案",
    prompt:
      "请切换至招投标书样式，撰写一份《企业文档智能平台项目技术方案》大纲与核心章节，包含系统架构、技术指标响应对比表与交付里程碑。",
  },
  {
    title: "生成学术论文结构",
    prompt:
      "请切换至高校学术论文模板，生成一篇关于《结构化语义与确定性文档编译方法研究》的完整论文骨架，含摘要、引言、实验三线表与结论。",
  },
  {
    title: "重构优化当前文档",
    prompt:
      "请先查看当前文档大纲与激活样式，在不改变核心事实的前提下，优化结构层次，补充一份对比总结表格并保持专业表达。",
  },
];

function ToolCard({ log }: { log: ToolExecutionLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/90 text-[11px] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-100/80 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {log.status === "running" ? (
            <Loader2 className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
          ) : log.status === "error" ? (
            <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          )}
          <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="font-mono font-medium text-slate-700 truncate">
            {log.name}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-2.5 py-2 border-t border-slate-200 bg-white space-y-1.5 font-mono text-[10px] text-slate-600 break-all select-text">
          {log.argsPreview && (
            <div>
              <span className="text-slate-400">args: </span>
              <span>{log.argsPreview}</span>
            </div>
          )}
          {log.resultPreview && (
            <div>
              <span className="text-slate-400">result: </span>
              <span>{log.resultPreview}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingDrawer({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-indigo-200/70 bg-indigo-50/40 text-[11px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between text-indigo-700 hover:bg-indigo-50/80 cursor-pointer"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Brain className="w-3 h-3" />
          <span>思考过程 ({thinking.length} 字)</span>
        </span>
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      {open && (
        <div className="px-2.5 py-2 border-t border-indigo-100 text-[11px] text-slate-600 whitespace-pre-wrap leading-relaxed select-text max-h-48 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

function SimpleMarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-800 select-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith("### ")) {
          return (
            <div key={idx} className="font-semibold text-slate-900 pt-1">
              {trimmed.slice(4)}
            </div>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <div key={idx} className="font-semibold text-[13px] text-slate-900 pt-1">
              {trimmed.slice(3)}
            </div>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={idx} className="flex gap-1.5 pl-1">
              <span className="text-blue-600">•</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={idx}>
            {parts.map((p, i) => {
              if (p.startsWith("**") && p.endsWith("**")) {
                return <strong key={i}>{p.slice(2, -2)}</strong>;
              }
              if (p.startsWith("`") && p.endsWith("`")) {
                return (
                  <code
                    key={i}
                    className="px-1 py-0.5 rounded bg-slate-100 text-teal-800 font-mono text-[11px]"
                  >
                    {p.slice(1, -1)}
                  </code>
                );
              }
              return <span key={i}>{p}</span>;
            })}
          </p>
        );
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

  const detachContextFile = useAppStore((s) => s.detachContextFile);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

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

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

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

  return (
    <aside className="w-[340px] xl:w-[370px] shrink-0 bg-white border-l border-slate-200/90 flex flex-col h-full">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-900">
                Pi Agent Harness
              </span>
              {desktopMode && (
                <span
                  title={
                    piSidecarStatus.lastError ||
                    (piSidecarStatus.running
                      ? "Pi Agent Sidecar 运行中"
                      : "Pi Agent Sidecar 待机")
                  }
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    piSidecarStatus.running
                      ? "bg-emerald-500"
                      : piSidecarStatus.lastError
                      ? "bg-amber-500"
                      : "bg-slate-300"
                  }`}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-[10px] text-slate-400 hover:text-blue-600 cursor-pointer truncate block max-w-[215px]"
            >
              {providerConfig.mode === "builtin"
                ? `${activeCat?.name || providerConfig.id}${
                    activeCat?.authType === "oauth" ? " (OAuth)" : ""
                  } · ${providerConfig.model}`
                : `自定义 · ${providerConfig.model}`}
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
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 disabled:opacity-40 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => void resetAgentSession()}
              title="重置会话"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active context chips */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white border border-slate-200 text-slate-600 max-w-[160px] truncate">
          @{activeFileName}
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 border border-blue-200 text-blue-700 max-w-[160px] truncate">
          <Sparkles className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{activeStyle.name}</span>
        </span>
        {selectedBlockIds.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-800">
            已选 {selectedBlockIds.length} 块
            <button
              type="button"
              onClick={clearSelection}
              className="hover:text-amber-950 cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        )}
        {attachedFiles.map((f) => (
          <span
            key={f.path}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-800 max-w-[165px]"
          >
            <Paperclip className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{f.name}</span>
            <button
              type="button"
              onClick={() => detachContextFile(f.path)}
              className="hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>

      {/* Message stream */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/70 border border-blue-100">
              <div className="text-xs font-semibold text-slate-800 mb-1">
                Pi Agent 驱动的文档写作工作台
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                支持 Claude Pro/Max、ChatGPT Plus/Pro、GitHub Copilot、Kimi Code 订阅直登，以及途中「引导纠偏 (Steer)」与块级 Diff 审核。
              </p>
              {!isAccountReady && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="mt-2 w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  点击登录订阅账号 / 配置模型
                </button>
              )}
            </div>

            <div className="text-[11px] font-medium text-slate-400 px-0.5">
              常用场景指令：
            </div>
            <div className="space-y-2">
              {STARTER_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => void sendAgentPrompt(item.prompt)}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors cursor-pointer group"
                >
                  <div className="text-xs font-medium text-slate-800 group-hover:text-blue-700">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                    {item.prompt}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`space-y-2 ${
                msg.role === "user" ? "flex flex-col items-end" : ""
              }`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[90%] rounded-2xl rounded-tr-xs bg-blue-600 text-white px-3.5 py-2 text-xs leading-relaxed shadow-xs select-text">
                  {msg.isSteering && (
                    <span className="inline-block text-[10px] font-semibold bg-amber-400 text-slate-900 px-1.5 py-0.5 rounded mr-1.5">
                      途中引导
                    </span>
                  )}
                  {msg.content}
                </div>
              ) : (
                <div className="space-y-2">
                  {msg.thinking && <ThinkingDrawer thinking={msg.thinking} />}

                  {msg.tools && msg.tools.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.tools.map((t) => (
                        <ToolCard key={t.id} log={t} />
                      ))}
                    </div>
                  )}

                  {msg.content && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5">
                      <SimpleMarkdownText text={msg.content} />
                    </div>
                  )}

                  {msg.isStreaming &&
                    !msg.content &&
                    !msg.thinking &&
                    (!msg.tools || msg.tools.length === 0) && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Pi Agent 正在思考与编排文档...</span>
                      </div>
                    )}

                  {msg.error && (
                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 break-all select-text">
                      {msg.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Prompt Composer */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="rounded-xl border border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 transition-all bg-white p-2">
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
            rows={3}
            placeholder={
              isAgentRunning && desktopMode
                ? "生成中可输入纠偏指令（Enter 发送途中引导 Steer）"
                : "输入写作目标、改写要求或排版指令（Enter 发送，Shift+Enter 换行）"
            }
            className="w-full resize-none text-xs text-slate-800 placeholder:text-slate-400 outline-none bg-transparent select-text"
          />
          <div className="flex items-center justify-between gap-1.5 pt-1.5">
            <span className="text-[10px] text-slate-400 truncate">
              {selectedBlockIds.length > 0
                ? "将聚焦改写选中的区块"
                : isAgentRunning
                ? "支持中途引导 / 排队追问"
                : "可全篇生成或局部插入"}
            </span>
            {isAgentRunning ? (
              <div className="flex items-center gap-1 shrink-0">
                {desktopMode && input.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={handleSteer}
                      title="当前工具执行完后立即插话纠偏"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>引导</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFollowUp}
                      title="待本轮完全结束后自动追问"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                    >
                      <ListPlus className="w-3 h-3" />
                      <span>追问</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void stopAgentExecution()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>停止</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 cursor-pointer shrink-0"
              >
                <Send className="w-3 h-3" />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
