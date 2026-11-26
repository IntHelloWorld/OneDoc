import type { AuthEvent } from "@earendil-works/pi-ai";

export type SupportedApi =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

export type ProviderMode = "builtin" | "custom";

export type ThinkingLevelOption = "off" | "low" | "medium" | "high";

export interface SidecarProviderConfig {
  mode: ProviderMode;
  provider: string;
  api: SupportedApi;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  thinkingLevel: ThinkingLevelOption;
  workspacePath?: string | null;
  sessionId?: string;
}

export interface CatalogModelSummary {
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export interface ProviderSummary {
  id: string;
  name: string;
  hasOAuth: boolean;
  oauthName?: string;
  oauthLabel?: string;
  isSubscription?: boolean;
  hasApiKey: boolean;
  authenticated: boolean;
  authType?: "oauth" | "api_key";
  authSource?: string;
  models: CatalogModelSummary[];
}

export type RpcCommand =
  | ({
      type: "configure";
    } & SidecarProviderConfig)
  | {
      type: "list_providers";
    }
  | {
      type: "login_start";
      loginId: string;
      providerId: string;
      authType: "oauth" | "api_key";
    }
  | {
      type: "login_prompt_response";
      promptId: string;
      value?: string;
      cancelled?: boolean;
    }
  | {
      type: "login_cancel";
      loginId: string;
    }
  | {
      type: "logout";
      providerId: string;
    }
  | {
      type: "set_api_key";
      providerId: string;
      apiKey: string;
    }
  | {
      type: "prompt";
      message: string;
      systemPrompt: string;
    }
  | {
      type: "steer";
      message: string;
    }
  | {
      type: "follow_up";
      message: string;
    }
  | {
      type: "abort";
    }
  | {
      type: "compact";
    }
  | {
      type: "reset";
      sessionId?: string;
    }
  | {
      type: "get_state";
    }
  | {
      type: "test_connection";
      requestId: string;
      mode?: ProviderMode;
      provider: string;
      api: SupportedApi;
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  | {
      type: "tool_call_result";
      callId: string;
      result: string;
      isError?: boolean;
    };

export type NormalizedAgentEvent =
  | { type: "agent_start" }
  | { type: "turn_start" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_start"; id?: string; name?: string }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      resultPreview: string;
      isError: boolean;
      durationMs?: number;
    }
  | { type: "turn_end" }
  | { type: "agent_end"; messageCount: number; errorMessage?: string }
  | { type: "error"; error: string };

export interface SerializedAuthPrompt {
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: { id: string; label: string; description?: string }[];
}

export type RpcEvent =
  | { type: "ready"; version: string; tools: string[] }
  | {
      type: "state";
      sessionId: string;
      isStreaming: boolean;
      messageCount: number;
      tools: string[];
      config: Omit<SidecarProviderConfig, "apiKey"> & { hasApiKey: boolean };
    }
  | {
      type: "providers_catalog";
      authFilePath: string;
      providers: ProviderSummary[];
    }
  | {
      type: "auth_event";
      loginId: string;
      event: AuthEvent;
    }
  | {
      type: "auth_prompt";
      loginId: string;
      promptId: string;
      prompt: SerializedAuthPrompt;
    }
  | {
      type: "auth_prompt_cancelled";
      loginId: string;
      promptId: string;
    }
  | {
      type: "auth_complete";
      loginId: string;
      providerId: string;
      credentialType: "oauth" | "api_key";
    }
  | {
      type: "auth_error";
      loginId: string;
      providerId: string;
      error: string;
    }
  | { type: "agent_event"; event: NormalizedAgentEvent }
  | {
      type: "tool_call_request";
      callId: string;
      name: string;
      args: unknown;
    }
  | {
      type: "compacted";
      removedCount: number;
      summary: string;
      messageCount: number;
    }
  | {
      type: "test_connection_result";
      requestId: string;
      ok: boolean;
      message: string;
    }
  | { type: "error"; error: string };

export function emitEvent(ev: RpcEvent): void {
  process.stdout.write(`${JSON.stringify(ev)}\n`);
}
