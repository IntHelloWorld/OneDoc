export type LlmApiProtocol =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai";

export type ProviderMode = "builtin" | "custom";

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface ProviderConfig {
  mode: ProviderMode;
  id: string;
  name: string;
  api: LlmApiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  thinkingLevel: ThinkingLevel;
}

export interface CatalogModelInfo {
  id: string;
  name: string;
  api: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export interface ProviderCatalogItem {
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
  models: CatalogModelInfo[];
}

export interface AuthPromptOption {
  id: string;
  label: string;
  description?: string;
}

export interface AuthPromptUi {
  promptId: string;
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: AuthPromptOption[];
}

export interface AuthUiState {
  loginId: string;
  providerId: string;
  providerName: string;
  authUrl?: string;
  instructions?: string;
  deviceCode?: {
    userCode: string;
    verificationUri: string;
  };
  progressMessages: string[];
  prompt?: AuthPromptUi;
  status: "idle" | "running" | "success" | "error";
  error?: string;
}

export interface ToolExecutionLog {
  id: string;
  name: string;
  argsPreview: string;
  resultPreview?: string;
  status: "running" | "done" | "error";
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  isSteering?: boolean;
  tools?: ToolExecutionLog[];
  timestamp: string;
  isStreaming?: boolean;
  error?: string;
}

export interface AttachedContextFile {
  path: string;
  name: string;
  kind: string;
}

export interface PiSidecarStatus {
  running: boolean;
  entryPath?: string | null;
  lastError?: string | null;
}
