import readline from "node:readline";
import { Agent } from "@earendil-works/pi-agent-core";
import {
  createInitialSystemMessage,
  toToolDeclaration,
} from "@earendil-works/pi-ai";
import { PiAuthManager } from "./authManager.js";
import {
  emitEvent,
  type RpcCommand,
  type SidecarProviderConfig,
} from "./protocol.js";
import {
  appendSessionMessages,
  compactAgentTranscript,
  estimateTranscriptTokens,
} from "./sessionStore.js";
import {
  createPiStreamFn,
  credentialStore,
  piModels,
  resolveActiveModel,
  testPiConnection,
} from "./streamRouter.js";
import { createOneDocTools, HostToolBridge } from "./tools.js";

let config: SidecarProviderConfig = {
  mode: "builtin",
  provider: "anthropic",
  api: "anthropic-messages",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  model: "claude-sonnet-4-5",
  temperature: 0.4,
  thinkingLevel: "off",
  workspacePath: null,
  sessionId: "default",
};

const bridge = new HostToolBridge();
const tools = createOneDocTools(bridge);
const authManager = new PiAuthManager(piModels, credentialStore);
const streamFn = createPiStreamFn(() => config);

let currentSessionId = `session-${Date.now().toString(36)}`;
let lastPersistedCount = 0;

const agent = new Agent({
  initialState: {
    systemPrompt: "你是 OneDoc 专业文档写作助手。",
    model: resolveActiveModel(config),
    thinkingLevel: config.thinkingLevel,
    tools,
  },
  streamFn,
  toolExecution: "sequential",
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
  transformContext: async (messages) => {
    const estTokens = estimateTranscriptTokens(messages);
    if (messages.length > 24 || estTokens > 60000) {
      const { compactedMessages, removedCount, summary } =
        await compactAgentTranscript({
          messages,
          model: resolveActiveModel(config),
          streamFn,
          keepRecent: 8,
        });
      if (removedCount > 0) {
        emitEvent({
          type: "compacted",
          removedCount,
          summary,
          messageCount: compactedMessages.length,
        });
        return compactedMessages;
      }
    }
    return messages;
  },
});

function setLeadingSystemPrompt(systemPrompt: string): void {
  const leading = createInitialSystemMessage(
    systemPrompt,
    agent.state.tools.map(toToolDeclaration)
  );
  const rest = agent.state.messages.filter(
    (m, idx) => !(idx === 0 && m.role === "system")
  );
  agent.state.messages = leading ? [leading, ...rest] : rest;
}

agent.subscribe((ev) => {
  switch (ev.type) {
    case "agent_start":
      emitEvent({ type: "agent_event", event: { type: "agent_start" } });
      break;
    case "turn_start":
      emitEvent({ type: "agent_event", event: { type: "turn_start" } });
      break;
    case "message_update": {
      const inner = ev.assistantMessageEvent;
      if (inner.type === "text_delta" && inner.delta) {
        emitEvent({
          type: "agent_event",
          event: { type: "text_delta", delta: inner.delta },
        });
      } else if (inner.type === "thinking_delta" && inner.delta) {
        emitEvent({
          type: "agent_event",
          event: { type: "thinking_delta", delta: inner.delta },
        });
      } else if (inner.type === "toolcall_start") {
        const block = inner.partial.content[inner.contentIndex];
        emitEvent({
          type: "agent_event",
          event: {
            type: "toolcall_start",
            id: block && block.type === "toolCall" ? block.id : undefined,
            name: block && block.type === "toolCall" ? block.name : undefined,
          },
        });
      } else if (inner.type === "error") {
        emitEvent({
          type: "agent_event",
          event: {
            type: "error",
            error: inner.error.errorMessage || `模型错误 (${inner.reason})`,
          },
        });
      }
      break;
    }
    case "tool_execution_start":
      emitEvent({
        type: "agent_event",
        event: {
          type: "tool_execution_start",
          toolCallId: ev.toolCallId,
          toolName: ev.toolName,
          args: ev.args,
        },
      });
      break;
    case "tool_execution_end": {
      const preview =
        ev.result?.content
          ?.map((c: { type?: string; text?: string }) => c.text ?? "")
          .join(" ")
          .slice(0, 180) ?? "";
      emitEvent({
        type: "agent_event",
        event: {
          type: "tool_execution_end",
          toolCallId: ev.toolCallId,
          toolName: ev.toolName,
          resultPreview: preview,
          isError: ev.isError,
          durationMs: ev.durationMs,
        },
      });
      break;
    }
    case "turn_end":
      emitEvent({ type: "agent_event", event: { type: "turn_end" } });
      break;
    case "agent_end": {
      const total = agent.state.messages.length;
      if (total > lastPersistedCount) {
        const fresh = agent.state.messages.slice(lastPersistedCount);
        appendSessionMessages(config.workspacePath, currentSessionId, fresh);
        lastPersistedCount = total;
      }
      emitEvent({
        type: "agent_event",
        event: {
          type: "agent_end",
          messageCount: total,
          errorMessage: agent.state.errorMessage,
        },
      });
      break;
    }
  }
});

function emitState(): void {
  const { apiKey, ...restCfg } = config;
  emitEvent({
    type: "state",
    sessionId: currentSessionId,
    isStreaming: agent.state.isStreaming,
    messageCount: agent.state.messages.length,
    tools: agent.state.tools.map((t) => t.name),
    config: { ...restCfg, hasApiKey: Boolean(apiKey?.trim()) },
  });
}

async function handleCommand(cmd: RpcCommand): Promise<void> {
  switch (cmd.type) {
    case "configure": {
      config = {
        ...config,
        mode: cmd.mode ?? config.mode,
        provider: cmd.provider,
        api: cmd.api,
        baseUrl: cmd.baseUrl,
        apiKey: cmd.apiKey,
        model: cmd.model,
        temperature: cmd.temperature,
        thinkingLevel: cmd.thinkingLevel,
        workspacePath: cmd.workspacePath ?? config.workspacePath,
        sessionId: cmd.sessionId ?? currentSessionId,
      };
      if (cmd.sessionId) {
        currentSessionId = cmd.sessionId;
      }
      agent.state.model = resolveActiveModel(config);
      agent.state.thinkingLevel = config.thinkingLevel;
      agent.sessionId = currentSessionId;
      emitState();
      break;
    }

    case "list_providers": {
      await authManager.emitCatalog();
      break;
    }

    case "login_start": {
      authManager.startLogin(cmd.loginId, cmd.providerId, cmd.authType);
      break;
    }

    case "login_prompt_response": {
      authManager.respondPrompt(cmd.promptId, cmd.value, cmd.cancelled);
      break;
    }

    case "login_cancel": {
      authManager.cancelLogin(cmd.loginId);
      break;
    }

    case "logout": {
      await authManager.logout(cmd.providerId);
      break;
    }

    case "set_api_key": {
      await authManager.setApiKey(cmd.providerId, cmd.apiKey);
      break;
    }

    case "prompt": {
      if (agent.state.isStreaming) {
        agent.steer({
          role: "user",
          content: [{ type: "text", text: cmd.message }],
          timestamp: Date.now(),
        });
        return;
      }
      setLeadingSystemPrompt(cmd.systemPrompt);
      void agent.prompt(cmd.message).catch((err) => {
        emitEvent({
          type: "agent_event",
          event: {
            type: "error",
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });
      break;
    }

    case "steer": {
      agent.steer({
        role: "user",
        content: [{ type: "text", text: cmd.message }],
        timestamp: Date.now(),
      });
      break;
    }

    case "follow_up": {
      agent.followUp({
        role: "user",
        content: [{ type: "text", text: cmd.message }],
        timestamp: Date.now(),
      });
      break;
    }

    case "abort": {
      agent.abort();
      break;
    }

    case "compact": {
      if (agent.state.isStreaming) {
        emitEvent({ type: "error", error: "生成进行中，无法立即压缩上下文" });
        return;
      }
      const res = await compactAgentTranscript({
        messages: agent.state.messages,
        model: resolveActiveModel(config),
        streamFn,
        keepRecent: 6,
      });
      agent.state.messages = res.compactedMessages;
      lastPersistedCount = agent.state.messages.length;
      emitEvent({
        type: "compacted",
        removedCount: res.removedCount,
        summary: res.summary,
        messageCount: res.compactedMessages.length,
      });
      break;
    }

    case "reset": {
      if (agent.state.isStreaming) {
        agent.abort();
        await agent.waitForIdle();
      }
      agent.reset();
      currentSessionId = cmd.sessionId || `session-${Date.now().toString(36)}`;
      agent.sessionId = currentSessionId;
      lastPersistedCount = agent.state.messages.length;
      emitState();
      break;
    }

    case "get_state": {
      emitState();
      break;
    }

    case "test_connection": {
      const res = await testPiConnection({
        mode: cmd.mode ?? config.mode,
        provider: cmd.provider,
        api: cmd.api,
        baseUrl: cmd.baseUrl,
        apiKey: cmd.apiKey,
        model: cmd.model,
      });
      emitEvent({
        type: "test_connection_result",
        requestId: cmd.requestId,
        ok: res.ok,
        message: res.message,
      });
      break;
    }

    case "tool_call_result": {
      bridge.resolveHostResult(cmd.callId, cmd.result, cmd.isError);
      break;
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const cmd = JSON.parse(trimmed) as RpcCommand;
    void handleCommand(cmd).catch((err) => {
      emitEvent({
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    emitEvent({
      type: "error",
      error: `无效 RPC 指令 JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

rl.on("close", () => {
  process.exit(0);
});

emitEvent({
  type: "ready",
  version: "1.6.0",
  tools: tools.map((t) => t.name),
});
void authManager.emitCatalog().catch((err) => {
  process.stderr.write(`[pi-sidecar] initial catalog failed: ${String(err)}\n`);
});
