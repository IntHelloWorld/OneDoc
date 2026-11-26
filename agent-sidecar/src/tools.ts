import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { emitEvent } from "./protocol.js";

interface PendingToolCall {
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class HostToolBridge {
  private pending = new Map<string, PendingToolCall>();

  callHostTool(
    callId: string,
    name: string,
    args: unknown,
    signal?: AbortSignal,
    timeoutMs = 60000
  ): Promise<string> {
    if (signal?.aborted) {
      return Promise.reject(new Error("工具调用已取消"));
    }

    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        const entry = this.pending.get(callId);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(callId);
        }
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new Error("工具执行被用户中断"));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`宿主工具 ${name} 响应超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(callId, {
        resolve: (val) => {
          cleanup();
          resolve(val);
        },
        reject: (err) => {
          cleanup();
          reject(err);
        },
        timer,
      });

      signal?.addEventListener("abort", onAbort, { once: true });

      emitEvent({
        type: "tool_call_request",
        callId,
        name,
        args: args ?? {},
      });
    });
  }

  resolveHostResult(callId: string, result: string, isError?: boolean): void {
    const entry = this.pending.get(callId);
    if (!entry) return;
    if (isError) {
      entry.reject(new Error(result));
    } else {
      entry.resolve(result);
    }
  }
}

function makeHostTool(
  bridge: HostToolBridge,
  def: {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
  }
): AgentTool<any> {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    executionMode: "sequential",
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal
    ): Promise<AgentToolResult<unknown>> => {
      try {
        const resultText = await bridge.callHostTool(
          toolCallId,
          def.name,
          params,
          signal
        );
        return {
          content: [{ type: "text", text: resultText }],
          details: { toolName: def.name },
          isError: resultText.includes('"error"'),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          details: { toolName: def.name, error: msg },
          isError: true,
        };
      }
    },
  };
}

export function createOneDocTools(bridge: HostToolBridge): AgentTool<any>[] {
  return [
    makeHostTool(bridge, {
      name: "inspect_style_profile",
      label: "查看样式规范",
      description:
        "查看当前激活的 StyleProfile 排版规范（页面边距、字体字号、行距、缩进、编号规则、表格风格及可用样式 ID）。",
      parameters: { type: "object", properties: {} },
    }),
    makeHostTool(bridge, {
      name: "get_document_outline",
      label: "读取文档大纲",
      description: "获取当前文档的标题、样式 ID、各区块 ID 与摘要大纲。",
      parameters: { type: "object", properties: {} },
    }),
    makeHostTool(bridge, {
      name: "read_document_blocks",
      label: "读取文档区块",
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
    }),
    makeHostTool(bridge, {
      name: "list_workspace_files",
      label: "列出工作区文件",
      description: "列出当前本地工作区中的全部支持文件（docx/md/txt/onedoc）。",
      parameters: { type: "object", properties: {} },
    }),
    makeHostTool(bridge, {
      name: "read_workspace_file",
      label: "读取参考文件",
      description: "读取工作区中指定文件的内容（自动解析 .docx / .md / .txt / .onedoc.json 文本）。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件绝对路径或工作区相对路径" },
        },
        required: ["path"],
      },
    }),
    makeHostTool(bridge, {
      name: "replace_document",
      label: "生成/重构整篇文档",
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
    }),
    makeHostTool(bridge, {
      name: "upsert_blocks",
      label: "局部更新区块",
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
    }),
    makeHostTool(bridge, {
      name: "update_style_profile",
      label: "调整文档样式",
      description:
        "切换预置样式方案（modern-report / gov-gbt9704 / academic-thesis / bid-proposal）或微调当前样式（如正文字号、中文字体、行距、表格风格、是否开启编号）。",
      parameters: {
        type: "object",
        properties: {
          styleId: { type: "string", description: "切换到指定样式 ID（可选）" },
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
          numberingEnabled: {
            type: "boolean",
            description: "是否启用标题自动编号（可选）",
          },
        },
      },
    }),
    makeHostTool(bridge, {
      name: "export_docx",
      label: "编译导出 DOCX",
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
    }),
  ];
}
