import { useAppStore } from "../store/useAppStore";
import { cloneStyleProfile } from "../presets/stylePresets";
import {
  extractDocxText,
  isTauriRuntime,
  llmCancelStream,
  llmChatStream,
  openExternalUrl,
  piSendCommand,
  piStartSidecar,
  readTextFile,
  subscribeLlmStream,
  subscribePiAgentEvent,
  subscribePiToolRequest,
} from "./tauriBridge";
import type {
  AuthPromptUi,
  LlmApiProtocol,
  ProviderCatalogItem,
  ProviderConfig,
  ToolExecutionLog,
} from "../types/agent";
import type { DocBlock } from "../types/document";
import type { FileTreeNode } from "../types/workspace";

interface ChatApiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "inspect_style_profile",
      description:
        "查看当前激活的 StyleProfile 排版规范（页面边距、字体字号、行距、缩进、编号规则、表格风格及可用样式 ID）。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_document_outline",
      description: "获取当前文档的标题、样式 ID、各区块 ID 与摘要大纲。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_document_blocks",
      description: "读取当前文档中指定 blockIds 或指定索引区间的完整结构化块内容。",
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            items: { type: "string" },
            description: "要读取的区块 ID 列表",
          },
          startIndex: { type: "number", description: "起始索引（可选）" },
          endIndex: { type: "number", description: "结束索引（含，可选）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_workspace_files",
      description: "列出当前本地工作区中的全部支持文件（docx/md/txt/onedoc）。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_workspace_file",
      description: "读取工作区中指定文件的内容（自动解析 .docx / .md / .txt / .onedoc.json 文本）。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件绝对路径或工作区相对路径" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_document",
      description:
        "生成或整体重构当前文档的内容块序列（由预览画布生成可视 Diff 供用户审核）。标题文本请勿手写编号前缀（如“一、”或“1.1”），编译器会根据样式配置自动生成。",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "本次修改或生成摘要" },
          title: { type: "string", description: "文档总标题" },
          blocks: {
            type: "array",
            description: "DocBlock 语义块数组",
            items: { type: "object" },
          },
        },
        required: ["summary", "blocks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_blocks",
      description:
        "在当前文档中局部替换某个区块，或在指定区块后插入新区块（或追加到文末）。适用于局部润色、增补表格或扩写某节。",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "本次局部修改摘要" },
          mode: {
            type: "string",
            enum: ["replace", "insert_after", "append"],
            description: "操作模式",
          },
          targetBlockId: {
            type: "string",
            description: "目标区块 ID（replace 或 insert_after 时必填）",
          },
          blocks: {
            type: "array",
            description: "要写入的 DocBlock 数组",
            items: { type: "object" },
          },
        },
        required: ["summary", "mode", "blocks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_style_profile",
      description:
        "切换预置样式方案（modern-report / gov-gbt9704 / academic-thesis / bid-proposal）或微调当前样式（如正文字号、中文字体、行距、表格风格、是否开启编号）。",
      parameters: {
        type: "object",
        properties: {
          styleId: {
            type: "string",
            description: "切换到指定样式 ID（可选）",
          },
          bodyFontZh: { type: "string", description: "正文中文字体（可选）" },
          bodySizePt: { type: "number", description: "正文字号磅值（可选）" },
          bodyLineSpacingValue: { type: "number", description: "正文行距值（可选）" },
          bodyFirstLineIndentChars: {
            type: "number",
            description: "正文首行缩进字符数（可选）",
          },
          tableStyle: {
            type: "string",
            enum: ["three_line", "zebra", "grid"],
            description: "表格样式（可选）",
          },
          numberingEnabled: { type: "boolean", description: "是否启用标题自动编号（可选）" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_docx",
      description: "将当前文档按激活的 StyleProfile 确定性编译导出为标准 .docx 文件。",
      parameters: {
        type: "object",
        properties: {
          filename: {
            type: "string",
            description: "可选输出文件名（如 汇报材料.docx），不填则弹出保存对话框",
          },
        },
      },
    },
  },
];

function flattenTree(nodes: FileTreeNode[]): { path: string; relativePath: string; kind: string }[] {
  const out: { path: string; relativePath: string; kind: string }[] = [];
  for (const n of nodes) {
    if (n.isDir && n.children) {
      out.push(...flattenTree(n.children));
    } else if (!n.isDir) {
      out.push({ path: n.path, relativePath: n.relativePath, kind: n.kind });
    }
  }
  return out;
}

function normalizeBlock(raw: Record<string, unknown>, idx: number): DocBlock {
  const type = String(raw.type || "paragraph");
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : `ai-${Date.now().toString(36)}-${idx}`;

  switch (type) {
    case "title":
      return { type: "title", id, text: String(raw.text ?? "") };
    case "subtitle":
      return { type: "subtitle", id, text: String(raw.text ?? "") };
    case "heading": {
      const lvl = Math.min(4, Math.max(1, Number(raw.level ?? 1))) as 1 | 2 | 3 | 4;
      return { type: "heading", id, level: lvl, text: String(raw.text ?? "") };
    }
    case "list": {
      const rawItems = Array.isArray(raw.items) ? raw.items : [];
      const items = rawItems.map((it) => {
        if (typeof it === "string") return [{ text: it }];
        if (Array.isArray(it)) {
          return it.map((r) =>
            typeof r === "string" ? { text: r } : { text: String((r as Record<string, unknown>).text ?? ""), ...(r as object) }
          );
        }
        return [{ text: String(it ?? "") }];
      });
      return { type: "list", id, ordered: Boolean(raw.ordered), items };
    }
    case "quote":
      return {
        type: "quote",
        id,
        title: raw.title ? String(raw.title) : undefined,
        text: String(raw.text ?? ""),
        variant: "note",
      };
    case "code_block":
      return {
        type: "code_block",
        id,
        language: raw.language ? String(raw.language) : undefined,
        code: String(raw.code ?? ""),
      };
    case "table":
      return {
        type: "table",
        id,
        caption: raw.caption ? String(raw.caption) : undefined,
        headers: Array.isArray(raw.headers) ? raw.headers.map(String) : [],
        rows: Array.isArray(raw.rows)
          ? raw.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]))
          : [],
      };
    case "divider":
      return {
        type: "divider",
        id,
        style: raw.style === "double_red" ? "double_red" : "solid",
      };
    case "page_break":
      return { type: "page_break", id };
    default: {
      if (Array.isArray(raw.runs)) {
        const runs = raw.runs.map((r) =>
          typeof r === "string"
            ? { text: r }
            : {
                text: String((r as Record<string, unknown>).text ?? ""),
                bold: Boolean((r as Record<string, unknown>).bold) || undefined,
                italic: Boolean((r as Record<string, unknown>).italic) || undefined,
                underline: Boolean((r as Record<string, unknown>).underline) || undefined,
                code: Boolean((r as Record<string, unknown>).code) || undefined,
              }
        );
        return {
          type: "paragraph",
          id,
          runs,
          indent: typeof raw.indent === "boolean" ? raw.indent : undefined,
        };
      }
      return {
        type: "paragraph",
        id,
        runs: [{ text: String(raw.text ?? "") }],
        indent: typeof raw.indent === "boolean" ? raw.indent : undefined,
      };
    }
  }
}

function summarizeBlock(b: DocBlock): string {
  switch (b.type) {
    case "title":
    case "subtitle":
    case "heading":
      return b.text.slice(0, 60);
    case "paragraph":
      return b.runs.map((r) => r.text).join("").slice(0, 60);
    case "quote":
      return `${b.title ? b.title + ": " : ""}${b.text}`.slice(0, 60);
    case "table":
      return `${b.caption ?? "表格"} (${b.headers.length}列×${b.rows.length}行)`;
    case "list":
      return `${b.ordered ? "有序" : "无序"}列表 (${b.items.length}项)`;
    case "code_block":
      return `代码块 (${b.language ?? "text"})`;
    case "divider":
      return b.style === "double_red" ? "红头双分割线" : "分割线";
    case "page_break":
      return "分页符";
  }
}

async function executeTool(name: string, argsRaw: string): Promise<string> {
  const store = useAppStore.getState();
  let args: Record<string, unknown> = {};
  try {
    args = argsRaw.trim() ? JSON.parse(argsRaw) : {};
  } catch {
    return JSON.stringify({ error: "工具参数 JSON 解析失败" });
  }

  switch (name) {
    case "inspect_style_profile": {
      const active = store.getActiveStyle();
      const all = store.getAllStyles().map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
      }));
      return JSON.stringify({ activeStyle: active, availableStyles: all });
    }

    case "get_document_outline": {
      const doc = store.document;
      return JSON.stringify({
        title: doc.title,
        styleProfileId: store.activeStyleId,
        blockCount: doc.blocks.length,
        outline: doc.blocks.map((b, idx) => ({
          index: idx,
          id: b.id,
          type: b.type,
          level: b.type === "heading" ? b.level : undefined,
          preview: summarizeBlock(b),
        })),
      });
    }

    case "read_document_blocks": {
      const blocks = store.document.blocks;
      const ids = Array.isArray(args.blockIds) ? (args.blockIds as string[]) : null;
      if (ids && ids.length > 0) {
        return JSON.stringify(blocks.filter((b) => ids.includes(b.id)));
      }
      const start = Math.max(0, Number(args.startIndex ?? 0));
      const end = Math.min(blocks.length - 1, Number(args.endIndex ?? start + 15));
      return JSON.stringify(blocks.slice(start, end + 1));
    }

    case "list_workspace_files": {
      return JSON.stringify({
        workspacePath: store.workspacePath,
        files: flattenTree(store.fileTree),
      });
    }

    case "read_workspace_file": {
      const inputPath = String(args.path ?? "");
      const flat = flattenTree(store.fileTree);
      const matched =
        flat.find((f) => f.path === inputPath || f.relativePath === inputPath) ?? null;
      const resolved = matched?.path ?? inputPath;
      if (!isTauriRuntime()) {
        return JSON.stringify({ error: "当前处于纯浏览器预览模式，无法读取本地文件系统" });
      }
      try {
        const text = resolved.toLowerCase().endsWith(".docx")
          ? await extractDocxText(resolved)
          : await readTextFile(resolved);
        return JSON.stringify({
          path: resolved,
          content: text.slice(0, 12000),
          truncated: text.length > 12000,
        });
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    }

    case "replace_document": {
      const rawBlocks = Array.isArray(args.blocks) ? args.blocks : [];
      const blocks = rawBlocks.map((b, i) =>
        normalizeBlock((b ?? {}) as Record<string, unknown>, i)
      );
      const summary = String(args.summary ?? "AI 重构生成完整文档");
      const title = args.title ? String(args.title) : undefined;
      store.applyAgentProposal(summary, blocks, title);
      return JSON.stringify({
        ok: true,
        blockCount: blocks.length,
        note: "已提交至画布 Diff 预览区等待用户审核（若原文档为空已自动生效）",
      });
    }

    case "upsert_blocks": {
      const mode = String(args.mode ?? "append");
      const targetId = args.targetBlockId ? String(args.targetBlockId) : undefined;
      const rawBlocks = Array.isArray(args.blocks) ? args.blocks : [];
      const incoming = rawBlocks.map((b, i) =>
        normalizeBlock((b ?? {}) as Record<string, unknown>, i)
      );
      const curBlocks = [...store.document.blocks];

      let proposed: DocBlock[];
      if (mode === "replace" && targetId) {
        const idx = curBlocks.findIndex((b) => b.id === targetId);
        if (idx === -1) {
          return JSON.stringify({ error: `未找到区块 ID: ${targetId}` });
        }
        // Preserve target ID on the first replacement block for clean diff alignment
        if (incoming.length > 0) {
          incoming[0] = { ...incoming[0], id: targetId };
        }
        proposed = [
          ...curBlocks.slice(0, idx),
          ...incoming,
          ...curBlocks.slice(idx + 1),
        ];
      } else if (mode === "insert_after" && targetId) {
        const idx = curBlocks.findIndex((b) => b.id === targetId);
        if (idx === -1) {
          return JSON.stringify({ error: `未找到区块 ID: ${targetId}` });
        }
        proposed = [
          ...curBlocks.slice(0, idx + 1),
          ...incoming,
          ...curBlocks.slice(idx + 1),
        ];
      } else {
        proposed = [...curBlocks, ...incoming];
      }

      store.applyAgentProposal(String(args.summary ?? "局部更新文档区块"), proposed);
      return JSON.stringify({ ok: true, totalBlocks: proposed.length });
    }

    case "update_style_profile": {
      if (args.styleId) {
        const target = store.getAllStyles().find((s) => s.id === String(args.styleId));
        if (!target) {
          return JSON.stringify({ error: `未找到样式 ID: ${String(args.styleId)}` });
        }
        store.setActiveStyleId(target.id);
      }

      const hasTweaks =
        args.bodyFontZh !== undefined ||
        args.bodySizePt !== undefined ||
        args.bodyLineSpacingValue !== undefined ||
        args.bodyFirstLineIndentChars !== undefined ||
        args.tableStyle !== undefined ||
        args.numberingEnabled !== undefined;

      if (hasTweaks) {
        const next = cloneStyleProfile(useAppStore.getState().getActiveStyle());
        if (args.bodyFontZh) next.typography.body.fontZh = String(args.bodyFontZh);
        if (args.bodySizePt) next.typography.body.sizePt = Number(args.bodySizePt);
        if (args.bodyLineSpacingValue) {
          next.typography.body.lineSpacingValue = Number(args.bodyLineSpacingValue);
        }
        if (args.bodyFirstLineIndentChars !== undefined) {
          next.typography.body.firstLineIndentChars = Number(args.bodyFirstLineIndentChars);
        }
        if (args.tableStyle) next.table.style = String(args.tableStyle);
        if (args.numberingEnabled !== undefined) {
          next.numbering.enabled = Boolean(args.numberingEnabled);
        }
        await store.saveStyleProfile(next);
      }

      return JSON.stringify({
        ok: true,
        activeStyleId: useAppStore.getState().activeStyleId,
      });
    }

    case "export_docx": {
      const filename = args.filename ? String(args.filename) : undefined;
      const out = await store.exportActiveDocx(filename);
      return JSON.stringify({ ok: Boolean(out), outputPath: out });
    }

    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

function buildSystemPrompt(): string {
  const state = useAppStore.getState();
  const style = state.getActiveStyle();
  const doc = state.document;
  const selected = state.selectedBlockIds;
  const attached = state.attachedFiles;

  return `你是 OneDoc 桌面端专业文档写作与排版 Agent（类似文档领域的 Cursor）。
你的核心原则是“内容与样式分离”：你只输出高纯度的语义文档结构块（DocBlock），严禁自己拼凑空格缩进或手工在 heading.text 前添加编号（例如不要在 heading.text 里写“一、”“1.1”，除非样式关闭了自动编号；底层确定性编译器会根据当前 StyleProfile 自动编号并套用中西文字体、字号、行距、红头与三线表）。

## 当前工作区上下文
- 当前打开文件: ${state.activeFileName} (${state.activeFileKind})
- 当前文档标题: ${doc.title}（共 ${doc.blocks.length} 个区块）
- 当前激活样式: ${style.name} (id: ${style.id}, 类别: ${style.category})
  - 版面: ${style.page.size} (${style.page.widthMm}x${style.page.heightMm}mm), 页边距 上${style.page.marginTopMm}/下${style.page.marginBottomMm}/左${style.page.marginLeftMm}/右${style.page.marginRightMm}mm
  - 正文规范: 中文字体=${style.typography.body.fontZh}, 英文字体=${style.typography.body.fontEn}, 字号=${style.typography.body.sizePt}pt, 行距=${style.typography.body.lineSpacingValue}${style.typography.body.lineSpacingRule === "exact" ? "pt固定" : "倍"}, 首行缩进=${style.typography.body.firstLineIndentChars}字符
  - 标题自动编号: ${style.numbering.enabled ? `开启 (H1="${style.numbering.h1Pattern}", H2="${style.numbering.h2Pattern}", H3="${style.numbering.h3Pattern}")` : "关闭"}
  - 表格样式: ${style.table.style}
${selected.length > 0 ? `- 用户在画布上选中的区块 ID: ${selected.join(", ")}（如用户要求“改写/优化选中内容”，请优先调用 read_document_blocks 读取这些 ID，再用 upsert_blocks 精确替换）` : ""}
${attached.length > 0 ? `- 用户附加了参考资料文件:\n${attached.map((f) => `  * ${f.name} (path: ${f.path})`).join("\n")}\n请先调用 read_workspace_file 读取参考内容后再撰稿！` : ""}

## DocBlock 规范速查
- title: { "type": "title", "text": "..." }
- subtitle: { "type": "subtitle", "text": "..." }
- heading: { "type": "heading", "level": 1|2|3|4, "text": "纯标题文字（不带编号前缀）" }
- paragraph: { "type": "paragraph", "runs": [{ "text": "...", "bold": true/false, "italic": false, "code": false }] }
- list: { "type": "list", "ordered": true|false, "items": [[{ "text": "列表项" }]] }
- quote: { "type": "quote", "title": "提示标题(可选)", "text": "..." }
- code_block: { "type": "code_block", "language": "ts", "code": "..." }
- table: { "type": "table", "caption": "表1 标题", "headers": ["列1","列2"], "rows": [["a","b"]] }
- divider: { "type": "divider", "style": "solid" | "double_red" } （党政公文红头主标题下可使用 double_red）
- page_break: { "type": "page_break" }

请用简洁清晰的中文回复，并积极使用工具直接完成文档撰写、局部改写、样式切换或导出操作。`;
}

interface StreamTurnResult {
  content: string;
  toolCalls: {
    id: string;
    name: string;
    arguments: string;
  }[];
  aborted: boolean;
}

async function runSingleLlmTurn(
  apiMessages: ChatApiMessage[],
  onDeltaContent: (text: string) => void,
  onToolDelta: (tools: { id: string; name: string; arguments: string }[]) => void
): Promise<StreamTurnResult> {
  const store = useAppStore.getState();
  const cfg = store.providerConfig;
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  store.setAgentRunning(true, requestId);

  const payload = {
    model: cfg.model,
    temperature: cfg.temperature,
    stream: true,
    messages: apiMessages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
  };

  let accContent = "";
  const toolAcc: Record<number, { id: string; name: string; arguments: string }> = {};

  const parseSseData = (dataStr: string) => {
    try {
      const parsed = JSON.parse(dataStr);
      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) return;

      if (typeof delta.content === "string" && delta.content.length > 0) {
        accContent += delta.content;
        onDeltaContent(accContent);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = Number(tc.index ?? 0);
          if (!toolAcc[idx]) {
            toolAcc[idx] = {
              id: tc.id || `call-${idx}-${Date.now()}`,
              name: tc.function?.name || "",
              arguments: "",
            };
          } else if (tc.id) {
            toolAcc[idx].id = tc.id;
          }
          if (tc.function?.name) {
            toolAcc[idx].name += tc.function.name;
          }
          if (tc.function?.arguments) {
            toolAcc[idx].arguments += tc.function.arguments;
          }
        }
        onToolDelta(Object.values(toolAcc));
      }
    } catch {
      // ignore partial SSE JSON
    }
  };

  if (isTauriRuntime()) {
    return new Promise<StreamTurnResult>((resolve, reject) => {
      let settled = false;
      let unlisten: (() => void) | null = null;

      const finish = (err?: string) => {
        if (settled) return;
        settled = true;
        if (unlisten) unlisten();
        if (err) {
          reject(new Error(err));
        } else {
          resolve({
            content: accContent,
            toolCalls: Object.values(toolAcc),
            aborted: !useAppStore.getState().isAgentRunning,
          });
        }
      };

      subscribeLlmStream(requestId, {
        onChunk: parseSseData,
        onDone: () => finish(),
        onError: (err) => finish(err),
      })
        .then((u) => {
          unlisten = u;
          return llmChatStream({
            requestId,
            baseUrl: cfg.baseUrl,
            apiKey: cfg.apiKey,
            payloadJson: JSON.stringify(payload),
          });
        })
        .catch((e) => finish(String(e)));
    });
  }

  // Fallback for browser dev mode (non-Tauri)
  const endpoint = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    if (!useAppStore.getState().isAgentRunning) break;
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) {
        const d = line.slice(5).trim();
        if (d === "[DONE]") {
          return {
            content: accContent,
            toolCalls: Object.values(toolAcc),
            aborted: false,
          };
        }
        if (d) parseSseData(d);
      }
      nl = buf.indexOf("\n");
    }
  }

  return {
    content: accContent,
    toolCalls: Object.values(toolAcc),
    aborted: !useAppStore.getState().isAgentRunning,
  };
}

// =========================================================================
// Pi Agent Sidecar RPC Client (Tauri desktop mode)
// =========================================================================

let wiringPromise: Promise<void> | null = null;
let activeAssistantMsgId: string | null = null;
let needTurnParagraphBreak = false;
let pendingNewAssistantBubble = false;

const pendingConnTests = new Map<
  string,
  { resolve: (res: { ok: boolean; message: string }) => void; timer: number }
>();

function buildConfigureCommand(cfg: ProviderConfig) {
  const ws = useAppStore.getState().workspacePath;
  return {
    type: "configure",
    mode: cfg.mode || "builtin",
    provider: cfg.id || "anthropic",
    api: cfg.api || "openai-completions",
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    temperature: cfg.temperature,
    thinkingLevel: cfg.thinkingLevel || "off",
    workspacePath: ws,
  };
}

function handlePiRpcEvent(ev: Record<string, unknown>): void {
  const store = useAppStore.getState();
  const evType = String(ev.type ?? "");

  if (evType === "ready" || evType === "state") {
    store.setPiSidecarStatus({
      ...store.piSidecarStatus,
      running: true,
      lastError: null,
    });
    return;
  }

  if (evType === "providers_catalog") {
    const providers = (ev.providers as ProviderCatalogItem[]) ?? [];
    const authFilePath = String(ev.authFilePath ?? "");
    store.setProviderCatalog(providers, authFilePath);

    // If user is on default unauthenticated builtin provider and already has an active Pi CLI subscription/key, auto-adopt it
    const hasSavedExplicit = (() => {
      try {
        return Boolean(localStorage.getItem("onedoc.providerConfig.v1"));
      } catch {
        return false;
      }
    })();
    if (!hasSavedExplicit && store.providerConfig.mode === "builtin") {
      const cur = providers.find((p) => p.id === store.providerConfig.id);
      if (!cur?.authenticated) {
        const firstAuthed = providers.find(
          (p) => p.authenticated && p.models.length > 0
        );
        if (firstAuthed) {
          const m = firstAuthed.models[0];
          const nextCfg: ProviderConfig = {
            ...store.providerConfig,
            mode: "builtin",
            id: firstAuthed.id,
            name: firstAuthed.name,
            api: (m.api as LlmApiProtocol) || store.providerConfig.api,
            model: m.id,
          };
          store.setProviderConfig(nextCfg);
          void piSendCommand(buildConfigureCommand(nextCfg));
        }
      }
    }
    return;
  }

  if (evType === "auth_event") {
    const loginId = String(ev.loginId ?? "");
    const inner = (ev.event ?? {}) as Record<string, unknown>;
    const kind = String(inner.type ?? "");
    store.setAuthFlow((prev) => {
      if (!prev || prev.loginId !== loginId) return prev;
      if (kind === "auth_url") {
        const url = String(inner.url ?? "");
        if (url && prev.authUrl !== url && isTauriRuntime()) {
          void openExternalUrl(url).catch(() => {});
        }
        return {
          ...prev,
          authUrl: url,
          instructions: inner.instructions ? String(inner.instructions) : prev.instructions,
        };
      }
      if (kind === "device_code") {
        const userCode = String(inner.userCode ?? "");
        const verificationUri = String(inner.verificationUri ?? "");
        if (verificationUri && isTauriRuntime()) {
          void openExternalUrl(verificationUri).catch(() => {});
        }
        return {
          ...prev,
          deviceCode: { userCode, verificationUri },
        };
      }
      if (kind === "info" || kind === "progress") {
        const msg = String(inner.message ?? "");
        return {
          ...prev,
          progressMessages: msg
            ? [...prev.progressMessages.slice(-4), msg]
            : prev.progressMessages,
        };
      }
      return prev;
    });
    return;
  }

  if (evType === "auth_prompt") {
    const loginId = String(ev.loginId ?? "");
    const promptId = String(ev.promptId ?? "");
    const p = (ev.prompt ?? {}) as Omit<AuthPromptUi, "promptId">;
    store.setAuthFlow((prev) => {
      if (!prev || prev.loginId !== loginId) return prev;
      return {
        ...prev,
        prompt: {
          promptId,
          type: p.type,
          message: p.message,
          placeholder: p.placeholder,
          options: p.options,
        },
      };
    });
    return;
  }

  if (evType === "auth_prompt_cancelled") {
    const loginId = String(ev.loginId ?? "");
    const promptId = String(ev.promptId ?? "");
    store.setAuthFlow((prev) => {
      if (!prev || prev.loginId !== loginId) return prev;
      if (prev.prompt?.promptId !== promptId) return prev;
      return { ...prev, prompt: undefined };
    });
    return;
  }

  if (evType === "auth_complete") {
    const loginId = String(ev.loginId ?? "");
    const providerId = String(ev.providerId ?? "");
    const credType = String(ev.credentialType ?? "oauth");
    const flow = store.authFlow;
    const providerLabel =
      flow?.providerName ||
      store.providerCatalog.find((p) => p.id === providerId)?.name ||
      providerId;

    store.setAuthFlow((prev) => {
      if (!prev || prev.loginId !== loginId) return prev;
      return {
        ...prev,
        prompt: undefined,
        status: "success",
      };
    });

    const catItem = store.providerCatalog.find((p) => p.id === providerId);
    if (catItem && catItem.models.length > 0) {
      const m = catItem.models[0];
      const nextCfg: ProviderConfig = {
        ...store.providerConfig,
        mode: "builtin",
        id: catItem.id,
        name: catItem.name,
        api: (m.api as LlmApiProtocol) || store.providerConfig.api,
        model: m.id,
      };
      store.setProviderConfig(nextCfg);
      void piSendCommand(buildConfigureCommand(nextCfg));
    }

    store.showToast(
      "success",
      `已登录 ${providerLabel} (${credType === "oauth" ? "订阅 OAuth" : "API Key"})，凭证已写入 ~/.pi/agent/auth.json`
    );
    return;
  }

  if (evType === "auth_error") {
    const loginId = String(ev.loginId ?? "");
    const errMsg = String(ev.error ?? "登录失败");
    store.setAuthFlow((prev) => {
      if (!prev || prev.loginId !== loginId) return prev;
      return {
        ...prev,
        prompt: undefined,
        status: "error",
        error: errMsg,
      };
    });
    return;
  }

  if (evType === "test_connection_result") {
    const reqId = String(ev.requestId ?? "");
    const waiter = pendingConnTests.get(reqId);
    if (waiter) {
      window.clearTimeout(waiter.timer);
      pendingConnTests.delete(reqId);
      waiter.resolve({
        ok: Boolean(ev.ok),
        message: String(ev.message ?? ""),
      });
    }
    return;
  }

  if (evType === "compacted") {
    const removed = Number(ev.removedCount ?? 0);
    if (removed > 0) {
      store.showToast("success", `Pi Agent 已压缩 ${removed} 条早期会话上下文`);
    } else {
      store.showToast("info", String(ev.summary ?? "当前会话较短，暂无需压缩"));
    }
    return;
  }

  if (evType === "error") {
    const errText = String(ev.error ?? "Pi Sidecar 未知错误");
    if (activeAssistantMsgId) {
      store.updateMessage(activeAssistantMsgId, {
        error: errText,
        isStreaming: false,
      });
      activeAssistantMsgId = null;
      store.setAgentRunning(false, null);
    } else {
      store.showToast("error", errText);
    }
    return;
  }

  if (evType !== "agent_event") return;
  const inner = (ev.event ?? {}) as Record<string, unknown>;
  const innerType = String(inner.type ?? "");
  const msgId = activeAssistantMsgId;
  if (!msgId) return;

  const currentMsg = store.messages.find((m) => m.id === msgId);
  if (!currentMsg) return;

  switch (innerType) {
    case "turn_start": {
      if (pendingNewAssistantBubble && activeAssistantMsgId) {
        store.updateMessage(activeAssistantMsgId, { isStreaming: false });
        const nextId = `msg-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        store.addMessage({
          id: nextId,
          role: "assistant",
          content: "",
          tools: [],
          timestamp: new Date().toISOString(),
          isStreaming: true,
        });
        activeAssistantMsgId = nextId;
        pendingNewAssistantBubble = false;
        needTurnParagraphBreak = false;
      }
      break;
    }

    case "text_delta": {
      const delta = String(inner.delta ?? "");
      const sep = needTurnParagraphBreak && currentMsg.content ? "\n\n" : "";
      needTurnParagraphBreak = false;
      store.updateMessage(msgId, {
        content: `${currentMsg.content}${sep}${delta}`,
      });
      break;
    }

    case "thinking_delta": {
      const delta = String(inner.delta ?? "");
      store.updateMessage(msgId, {
        thinking: `${currentMsg.thinking ?? ""}${delta}`,
      });
      break;
    }

    case "tool_execution_start": {
      const callId = String(inner.toolCallId ?? "");
      const toolName = String(inner.toolName ?? "");
      const argsPreview = JSON.stringify(inner.args ?? {}).slice(0, 160);
      const prevTools = currentMsg.tools ?? [];
      const nextTools: ToolExecutionLog[] = prevTools.some((t) => t.id === callId)
        ? prevTools.map((t) =>
            t.id === callId ? { ...t, name: toolName, argsPreview, status: "running" } : t
          )
        : [
            ...prevTools,
            { id: callId, name: toolName, argsPreview, status: "running" },
          ];
      needTurnParagraphBreak = true;
      store.updateMessage(msgId, { tools: nextTools });
      break;
    }

    case "tool_execution_end": {
      const callId = String(inner.toolCallId ?? "");
      const isError = Boolean(inner.isError);
      const preview = String(inner.resultPreview ?? "");
      const prevTools = currentMsg.tools ?? [];
      const nextTools: ToolExecutionLog[] = prevTools.map((t) =>
        t.id === callId
          ? { ...t, status: isError ? "error" : "done", resultPreview: preview }
          : t
      );
      store.updateMessage(msgId, { tools: nextTools });
      break;
    }

    case "error": {
      store.updateMessage(msgId, {
        error: String(inner.error ?? "模型调用出错"),
        isStreaming: false,
      });
      break;
    }

    case "agent_end": {
      const latest = useAppStore.getState().messages.find((m) => m.id === msgId);
      const errMsg = inner.errorMessage ? String(inner.errorMessage) : undefined;
      store.updateMessage(msgId, {
        content:
          latest?.content ||
          (errMsg || latest?.error ? "" : "已完成处理。"),
        error: latest?.error || errMsg,
        isStreaming: false,
      });
      activeAssistantMsgId = null;
      needTurnParagraphBreak = false;
      pendingNewAssistantBubble = false;
      store.setQueuedSteerCount(0);
      store.setAgentRunning(false, null);
      break;
    }
  }
}

export async function ensurePiSidecarWired(): Promise<void> {
  if (!isTauriRuntime()) return;
  if (wiringPromise) return wiringPromise;

  wiringPromise = (async () => {
    await subscribePiToolRequest(async (req) => {
      try {
        const result = await executeTool(
          req.name,
          JSON.stringify(req.args ?? {})
        );
        await piSendCommand({
          type: "tool_call_result",
          callId: req.callId,
          result,
          isError: false,
        });
      } catch (err) {
        await piSendCommand({
          type: "tool_call_result",
          callId: req.callId,
          result: JSON.stringify({ error: String(err) }),
          isError: true,
        });
      }
    });

    await subscribePiAgentEvent((ev) => {
      handlePiRpcEvent(ev);
    });

    const status = await piStartSidecar();
    useAppStore.getState().setPiSidecarStatus(status);
    await piSendCommand(buildConfigureCommand(useAppStore.getState().providerConfig));
  })().catch((err) => {
    wiringPromise = null;
    useAppStore.getState().setPiSidecarStatus({
      running: false,
      lastError: String(err),
    });
    throw err;
  });

  return wiringPromise;
}

export async function initPiSidecar(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await ensurePiSidecarWired();
  } catch (err) {
    useAppStore
      .getState()
      .showToast("error", `Pi Agent 后端启动失败: ${String(err)}`);
  }
}

export async function syncPiProviderConfig(cfg: ProviderConfig): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await ensurePiSidecarWired();
    await piSendCommand(buildConfigureCommand(cfg));
  } catch (err) {
    useAppStore
      .getState()
      .showToast("error", `同步 Pi 模型配置失败: ${String(err)}`);
  }
}

export async function testPiProviderConnection(
  cfg: ProviderConfig
): Promise<{ ok: boolean; message: string }> {
  if (!isTauriRuntime()) {
    const endpoint = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 5,
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return { ok: true, message: "浏览器直连测试成功" };
  }

  await ensurePiSidecarWired();
  const requestId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingConnTests.delete(requestId);
      resolve({ ok: false, message: "连接测试超时 (25s)" });
    }, 25000);

    pendingConnTests.set(requestId, { resolve, timer });
    void piSendCommand({
      type: "test_connection",
      requestId,
      mode: cfg.mode || "builtin",
      provider: cfg.id || "anthropic",
      api: cfg.api || "openai-completions",
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    }).catch((err) => {
      window.clearTimeout(timer);
      pendingConnTests.delete(requestId);
      resolve({ ok: false, message: String(err) });
    });
  });
}

export async function refreshPiProviders(): Promise<void> {
  if (!isTauriRuntime()) return;
  await ensurePiSidecarWired();
  await piSendCommand({ type: "list_providers" });
}

export async function startPiLogin(
  providerId: string,
  providerName: string,
  authType: "oauth" | "api_key" = "oauth"
): Promise<void> {
  if (!isTauriRuntime()) {
    useAppStore
      .getState()
      .showToast("info", "订阅账号 OAuth 登录仅在 Tauri 桌面端可用");
    return;
  }
  await ensurePiSidecarWired();
  const loginId = `login-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  useAppStore.getState().setAuthFlow({
    loginId,
    providerId,
    providerName,
    progressMessages: ["正在初始化认证流程..."],
    status: "running",
  });
  await piSendCommand({
    type: "login_start",
    loginId,
    providerId,
    authType,
  });
}

export async function respondPiLoginPrompt(
  promptId: string,
  value?: string,
  cancelled?: boolean
): Promise<void> {
  if (!isTauriRuntime()) return;
  useAppStore.getState().setAuthFlow((prev) =>
    prev ? { ...prev, prompt: undefined } : prev
  );
  await piSendCommand({
    type: "login_prompt_response",
    promptId,
    value,
    cancelled,
  });
}

export async function cancelPiLogin(): Promise<void> {
  const flow = useAppStore.getState().authFlow;
  useAppStore.getState().setAuthFlow(null);
  if (flow && isTauriRuntime()) {
    await piSendCommand({ type: "login_cancel", loginId: flow.loginId });
  }
}

export async function logoutPiProvider(providerId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await ensurePiSidecarWired();
  await piSendCommand({ type: "logout", providerId });
  useAppStore.getState().showToast("info", `已注销 ${providerId} 本地凭证`);
}

export async function savePiProviderApiKey(
  providerId: string,
  apiKey: string
): Promise<void> {
  if (!isTauriRuntime()) return;
  await ensurePiSidecarWired();
  await piSendCommand({ type: "set_api_key", providerId, apiKey });
  useAppStore.getState().showToast("success", `已保存 ${providerId} API Key 至 auth.json`);
}

export async function stopAgentExecution(): Promise<void> {
  const { activeRequestId, setAgentRunning } = useAppStore.getState();
  if (isTauriRuntime()) {
    await piSendCommand({ type: "abort" });
    setAgentRunning(false, null);
    return;
  }
  setAgentRunning(false, null);
  if (activeRequestId) {
    await llmCancelStream(activeRequestId);
  }
}

export async function steerAgentPrompt(message: string): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed || !isTauriRuntime()) return;
  const store = useAppStore.getState();
  store.addMessage({
    id: `msg-steer-${Date.now()}`,
    role: "user",
    content: trimmed,
    isSteering: true,
    timestamp: new Date().toISOString(),
  });
  store.setQueuedSteerCount(store.queuedSteerCount + 1);
  needTurnParagraphBreak = true;
  pendingNewAssistantBubble = true;
  await ensurePiSidecarWired();
  await piSendCommand({ type: "steer", message: trimmed });
}

export async function followUpAgentPrompt(message: string): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed || !isTauriRuntime()) return;
  const store = useAppStore.getState();
  store.addMessage({
    id: `msg-fu-${Date.now()}`,
    role: "user",
    content: trimmed,
    timestamp: new Date().toISOString(),
  });
  store.setQueuedSteerCount(store.queuedSteerCount + 1);
  needTurnParagraphBreak = true;
  pendingNewAssistantBubble = true;
  await ensurePiSidecarWired();
  await piSendCommand({ type: "follow_up", message: trimmed });
}

export async function compactAgentSession(): Promise<void> {
  const store = useAppStore.getState();
  if (store.isAgentRunning) {
    store.showToast("info", "请等待当前轮次完成后再压缩上下文");
    return;
  }
  if (!isTauriRuntime()) {
    store.showToast("info", "上下文压缩由 Pi Agent Sidecar 桌面后端提供");
    return;
  }
  await ensurePiSidecarWired();
  await piSendCommand({ type: "compact" });
}

export async function resetAgentSession(): Promise<void> {
  const store = useAppStore.getState();
  store.clearMessages();
  store.setQueuedSteerCount(0);
  store.setAgentRunning(false, null);
  activeAssistantMsgId = null;
  pendingNewAssistantBubble = false;
  if (isTauriRuntime()) {
    await ensurePiSidecarWired();
    await piSendCommand({ type: "reset" });
  }
}

export async function sendAgentPrompt(userPrompt: string): Promise<void> {
  const store = useAppStore.getState();
  if (store.isAgentRunning) {
    if (isTauriRuntime()) {
      await steerAgentPrompt(userPrompt);
    }
    return;
  }
  if (!store.providerConfig.model) {
    store.showToast("error", "请先在【模型与账号设置】中选择或填写 Model 名称");
    store.setSettingsOpen(true);
    return;
  }
  if (store.providerConfig.mode === "builtin") {
    const catItem = store.providerCatalog.find(
      (p) => p.id === store.providerConfig.id
    );
    if (catItem && !catItem.authenticated) {
      store.showToast(
        "info",
        `请先登录「${catItem.name}」订阅账号或配置其 API Key`
      );
      store.setSettingsOpen(true);
      return;
    }
  } else {
    if (!store.providerConfig.baseUrl) {
      store.showToast("error", "请先配置自定义 API Base URL");
      store.setSettingsOpen(true);
      return;
    }
    if (
      !store.providerConfig.apiKey &&
      !store.providerConfig.baseUrl.includes("localhost") &&
      !store.providerConfig.baseUrl.includes("127.0.0.1")
    ) {
      store.showToast("info", "请先配置有效的 API Key（本地 Ollama 除外）");
      store.setSettingsOpen(true);
      return;
    }
  }

  const userMsgId = `msg-u-${Date.now()}`;
  store.addMessage({
    id: userMsgId,
    role: "user",
    content: userPrompt,
    timestamp: new Date().toISOString(),
  });

  const assistantMsgId = `msg-a-${Date.now()}`;
  store.addMessage({
    id: assistantMsgId,
    role: "assistant",
    content: "",
    tools: [],
    timestamp: new Date().toISOString(),
    isStreaming: true,
  });

  // Primary path: Pi Agent Sidecar via Tauri JSONL RPC
  if (isTauriRuntime()) {
    activeAssistantMsgId = assistantMsgId;
    needTurnParagraphBreak = false;
    pendingNewAssistantBubble = false;
    store.setAgentRunning(true, `pi-${Date.now()}`);
    try {
      await ensurePiSidecarWired();
      await piSendCommand(buildConfigureCommand(useAppStore.getState().providerConfig));
      await piSendCommand({
        type: "prompt",
        message: userPrompt,
        systemPrompt: buildSystemPrompt(),
      });
    } catch (e) {
      store.updateMessage(assistantMsgId, {
        error: String(e),
        isStreaming: false,
      });
      activeAssistantMsgId = null;
      store.setAgentRunning(false, null);
    }
    return;
  }

  // Fallback path: browser preview mode (non-Tauri)
  const historyMsgs: ChatApiMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...useAppStore
      .getState()
      .messages.filter((m) => m.id !== assistantMsgId && !m.error)
      .slice(-10)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const allToolLogs: ToolExecutionLog[] = [];
  let combinedText = "";

  try {
    for (let step = 0; step < 8; step++) {
      if (!useAppStore.getState().isAgentRunning && step > 0) break;

      const prefixText = combinedText ? `${combinedText}\n\n` : "";
      const turn = await runSingleLlmTurn(
        historyMsgs,
        (chunkText) => {
          useAppStore.getState().updateMessage(assistantMsgId, {
            content: `${prefixText}${chunkText}`,
          });
        },
        (partialTools) => {
          const liveLogs: ToolExecutionLog[] = partialTools.map((t) => ({
            id: t.id,
            name: t.name || "calling...",
            argsPreview: t.arguments.slice(0, 140),
            status: "running",
          }));
          useAppStore.getState().updateMessage(assistantMsgId, {
            tools: [...allToolLogs, ...liveLogs],
          });
        }
      );

      if (turn.content) {
        combinedText = `${prefixText}${turn.content}`;
      }

      if (turn.aborted) {
        useAppStore.getState().updateMessage(assistantMsgId, {
          content: combinedText || "（已停止生成）",
          isStreaming: false,
        });
        break;
      }

      if (turn.toolCalls.length === 0) {
        useAppStore.getState().updateMessage(assistantMsgId, {
          content: combinedText || "已完成处理。",
          tools: allToolLogs,
          isStreaming: false,
        });
        break;
      }

      historyMsgs.push({
        role: "assistant",
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });

      for (const tc of turn.toolCalls) {
        const logIdx = allToolLogs.length;
        allToolLogs.push({
          id: tc.id,
          name: tc.name,
          argsPreview: tc.arguments.slice(0, 160),
          status: "running",
        });
        useAppStore.getState().updateMessage(assistantMsgId, {
          tools: [...allToolLogs],
        });

        const resultStr = await executeTool(tc.name, tc.arguments);
        const hasErr = resultStr.includes('"error"');
        allToolLogs[logIdx] = {
          ...allToolLogs[logIdx],
          resultPreview: resultStr.slice(0, 180),
          status: hasErr ? "error" : "done",
        };
        useAppStore.getState().updateMessage(assistantMsgId, {
          tools: [...allToolLogs],
        });

        historyMsgs.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: resultStr,
        });
      }

      historyMsgs[0] = { role: "system", content: buildSystemPrompt() };
    }
  } catch (e) {
    useAppStore.getState().updateMessage(assistantMsgId, {
      content: combinedText,
      tools: allToolLogs,
      isStreaming: false,
      error: String(e),
    });
  } finally {
    useAppStore.getState().setAgentRunning(false, null);
    useAppStore.getState().updateMessage(assistantMsgId, { isStreaming: false });
  }
}
