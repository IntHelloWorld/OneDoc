import fs from "node:fs";
import path from "node:path";
import type { Api, Context, Message, Model } from "@earendil-works/pi-ai";
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";

function sessionFilePath(workspacePath: string, sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(workspacePath, ".onedoc", "sessions", `${safeId}.jsonl`);
}

export function appendSessionMessages(
  workspacePath: string | null | undefined,
  sessionId: string,
  messages: AgentMessage[]
): void {
  if (!workspacePath || messages.length === 0) return;
  try {
    const file = sessionFilePath(workspacePath, sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lines = messages
      .filter((m) => m.role !== "system")
      .map((m) => JSON.stringify(m))
      .join("\n");
    if (lines) {
      fs.appendFileSync(file, `${lines}\n`, "utf-8");
    }
  } catch (err) {
    process.stderr.write(`[pi-sidecar] session persist failed: ${String(err)}\n`);
  }
}

export function extractTextFromAgentMessage(msg: AgentMessage): string {
  const c = (msg as { content?: unknown }).content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part as { type?: string; text?: string; name?: string };
        if (p.type === "text" && p.text) return p.text;
        if (p.type === "toolCall" && p.name) return `[toolCall:${p.name}]`;
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export function estimateTranscriptTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const m of messages) {
    const txt = extractTextFromAgentMessage(m);
    let cjk = 0;
    for (let i = 0; i < txt.length; i++) {
      if (txt.charCodeAt(i) > 0x2e80) cjk++;
    }
    const ascii = txt.length - cjk;
    total += Math.ceil(cjk / 1.4 + ascii / 3.8) + 12;
  }
  return total;
}

export async function compactAgentTranscript(params: {
  messages: AgentMessage[];
  model: Model<Api>;
  streamFn: StreamFn;
  keepRecent?: number;
}): Promise<{
  compactedMessages: AgentMessage[];
  removedCount: number;
  summary: string;
}> {
  const keepRecent = params.keepRecent ?? 6;
  const sysMessages = params.messages.filter(
    (m, idx) => idx === 0 && m.role === "system"
  );
  const rest = params.messages.filter(
    (m, idx) => !(idx === 0 && m.role === "system")
  );

  if (rest.length <= keepRecent + 1) {
    return {
      compactedMessages: params.messages,
      removedCount: 0,
      summary: "当前对话较短，暂无需压缩。",
    };
  }

  const older = rest.slice(0, rest.length - keepRecent);
  const recent = rest.slice(rest.length - keepRecent);

  const historyDigest = older
    .map((m) => {
      const txt = extractTextFromAgentMessage(m).slice(0, 600);
      return `[${m.role}]: ${txt}`;
    })
    .join("\n");

  const summaryCtx: Context = {
    systemPrompt:
      "你是文档写作会话摘要压缩器。请将以下多轮对话与工具执行记录浓缩成精炼的中文上下文摘要，务必保留文档目标、已确定的样式规范、关键数据口径和重要结论。",
    messages: [
      {
        role: "user",
        content: `请压缩以下历史记录（不超过 500 字）：\n\n${historyDigest.slice(0, 12000)}`,
        timestamp: Date.now(),
      },
    ],
  };

  let summaryText = "";
  try {
    const stream = await params.streamFn(
      params.model,
      summaryCtx as unknown as Parameters<StreamFn>[1],
      {
        maxTokens: 650,
        temperature: 0.2,
      }
    );
    const res = await stream.result();
    summaryText = res.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
  } catch (err) {
    process.stderr.write(
      `[pi-sidecar] compact llm failed, falling back: ${String(err)}\n`
    );
  }

  if (!summaryText) {
    summaryText = `已折叠前 ${older.length} 条历史消息；最近上下文保留 ${recent.length} 条。`;
  }

  const summaryMsg: Message = {
    role: "user",
    content: `[历史会话压缩摘要]\n${summaryText}`,
    timestamp: Date.now(),
  };

  return {
    compactedMessages: [...sysMessages, summaryMsg, ...recent],
    removedCount: older.length,
    summary: summaryText,
  };
}
