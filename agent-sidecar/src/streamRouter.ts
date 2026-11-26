import {
  createProvider,
  type Api,
  type Context,
  type Model,
  type MutableModels,
  type ProviderStreams,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import * as openAICompletionsApi from "@earendil-works/pi-ai/api/openai-completions";
import * as openAIResponsesApi from "@earendil-works/pi-ai/api/openai-responses";
import * as anthropicApi from "@earendil-works/pi-ai/api/anthropic-messages";
import * as googleApi from "@earendil-works/pi-ai/api/google-generative-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { FileCredentialStore, getAuthFilePath } from "./credentialStore.js";
import type {
  ProviderMode,
  ProviderSummary,
  SidecarProviderConfig,
  SupportedApi,
} from "./protocol.js";

const CUSTOM_PROVIDER_ID = "custom-endpoint";

const OAUTH_PRIORITY = [
  "anthropic",
  "openai-codex",
  "openai",
  "github-copilot",
  "kimi-coding",
  "xai",
  "openrouter",
  "meta",
  "radius",
];

const POPULAR_KEY_PRIORITY = [
  "deepseek",
  "google",
  "qwen-token-plan-cn",
  "qwen-token-plan-individual-cn",
  "zai-coding-cn",
  "moonshotai-cn",
  "minimax-cn",
  "xiaomi",
  "groq",
  "mistral",
];

export const credentialStore = new FileCredentialStore();
export const piModels: MutableModels = builtinModels({
  credentials: credentialStore,
});

export function normalizeBaseUrl(api: SupportedApi, baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (api === "anthropic-messages") {
    const clean = trimmed || "https://api.anthropic.com";
    return clean.endsWith("/v1") ? clean.slice(0, -3) : clean;
  }
  if (api === "google-generative-ai") {
    return trimmed || "https://generativelanguage.googleapis.com/v1beta";
  }
  return trimmed || "https://api.openai.com/v1";
}

function getApiStreams(api: SupportedApi): ProviderStreams {
  switch (api) {
    case "openai-responses":
      return {
        stream: openAIResponsesApi.stream as ProviderStreams["stream"],
        streamSimple:
          openAIResponsesApi.streamSimple as ProviderStreams["streamSimple"],
      };
    case "anthropic-messages":
      return {
        stream: anthropicApi.stream as ProviderStreams["stream"],
        streamSimple: anthropicApi.streamSimple as ProviderStreams["streamSimple"],
      };
    case "google-generative-ai":
      return {
        stream: googleApi.stream as ProviderStreams["stream"],
        streamSimple: googleApi.streamSimple as ProviderStreams["streamSimple"],
      };
    case "openai-completions":
    default:
      return {
        stream: openAICompletionsApi.stream as ProviderStreams["stream"],
        streamSimple:
          openAICompletionsApi.streamSimple as ProviderStreams["streamSimple"],
      };
  }
}

export function syncCustomProvider(cfg: {
  api: SupportedApi;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel?: string;
}): Model<Api> {
  const modelId = cfg.model.trim() || "deepseek-chat";
  const baseUrl = normalizeBaseUrl(cfg.api, cfg.baseUrl);
  const resolvedKey = cfg.apiKey?.trim() || "ollama";
  const model: Model<SupportedApi> = {
    id: modelId,
    name: modelId,
    api: cfg.api,
    provider: CUSTOM_PROVIDER_ID,
    baseUrl,
    reasoning: Boolean(cfg.thinkingLevel && cfg.thinkingLevel !== "off"),
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };

  piModels.setProvider(
    createProvider({
      id: CUSTOM_PROVIDER_ID,
      name: "自定义兼容接口",
      baseUrl,
      auth: {
        apiKey: {
          name: "Custom API key",
          resolve: async () => ({
            auth: { apiKey: resolvedKey },
            source: "Custom endpoint",
          }),
        },
      },
      models: [model],
      api: getApiStreams(cfg.api),
    })
  );

  return model as Model<Api>;
}

export function resolveActiveModel(cfg: {
  mode?: ProviderMode;
  provider: string;
  api: SupportedApi;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingLevel?: string;
}): Model<Api> {
  const mode: ProviderMode = cfg.mode ?? "builtin";
  if (mode === "custom") {
    return syncCustomProvider(cfg);
  }

  const providerId = cfg.provider || "anthropic";
  const provider = piModels.getProvider(providerId);
  if (!provider) {
    return syncCustomProvider(cfg);
  }

  const exact = piModels.getModel(providerId, cfg.model);
  if (exact) return exact;

  const list = provider.getModels();
  if (list.length > 0) {
    const first = list[0];
    if (cfg.model.trim()) {
      return {
        ...first,
        id: cfg.model.trim(),
        name: cfg.model.trim(),
      };
    }
    return first;
  }

  return syncCustomProvider({ ...cfg, model: cfg.model || "default" });
}

export async function listProvidersCatalog(): Promise<{
  authFilePath: string;
  providers: ProviderSummary[];
}> {
  const all = piModels
    .getProviders()
    .filter((p) => p.id !== CUSTOM_PROVIDER_ID);

  const summaries: ProviderSummary[] = await Promise.all(
    all.map(async (p) => {
      let check: Awaited<ReturnType<typeof piModels.checkAuth>> = undefined;
      let cred: Awaited<ReturnType<typeof credentialStore.read>> = undefined;
      try {
        [check, cred] = await Promise.all([
          piModels.checkAuth(p.id),
          credentialStore.read(p.id),
        ]);
      } catch {
        // best-effort status check
      }

      const rawModels = p.getModels();
      const filteredModels =
        check && p.filterModels ? p.filterModels(rawModels, cred) : rawModels;

      const models = filteredModels.map((m) => ({
        id: m.id,
        name: m.name,
        api: m.api,
        reasoning: Boolean(m.reasoning),
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      }));

      return {
        id: p.id,
        name: p.name,
        hasOAuth: Boolean(p.auth.oauth),
        oauthName: p.auth.oauth?.name,
        oauthLabel: p.auth.oauth?.loginLabel,
        isSubscription: p.auth.oauth?.isSubscription,
        hasApiKey: Boolean(p.auth.apiKey),
        authenticated: Boolean(check),
        authType: check?.type,
        authSource: check?.source,
        models,
      };
    })
  );

  summaries.sort((a, b) => {
    const aAuth = a.authenticated ? 0 : 1;
    const bAuth = b.authenticated ? 0 : 1;
    if (aAuth !== bAuth) return aAuth - bAuth;

    const aO = OAUTH_PRIORITY.indexOf(a.id);
    const bO = OAUTH_PRIORITY.indexOf(b.id);
    if (aO !== -1 || bO !== -1) {
      if (aO === -1) return 1;
      if (bO === -1) return -1;
      return aO - bO;
    }

    const aP = POPULAR_KEY_PRIORITY.indexOf(a.id);
    const bP = POPULAR_KEY_PRIORITY.indexOf(b.id);
    if (aP !== -1 || bP !== -1) {
      if (aP === -1) return 1;
      if (bP === -1) return -1;
      return aP - bP;
    }

    return a.name.localeCompare(b.name);
  });

  return {
    authFilePath: getAuthFilePath(),
    providers: summaries,
  };
}

/**
 * Important: Never inject an empty or stale apiKey here, because Models.applyAuth()
 * prioritizes `options.apiKey` over stored OAuth tokens in FileCredentialStore.
 */
export function createPiStreamFn(
  getConfig: () => SidecarProviderConfig
): StreamFn {
  return (model, context, options) => {
    const cfg = getConfig();
    const mergedOptions: SimpleStreamOptions = {
      ...options,
      temperature: options?.temperature ?? cfg.temperature,
    };
    return piModels.streamSimple(
      model,
      context as unknown as Context,
      mergedOptions
    );
  };
}

export async function testPiConnection(cfg: {
  mode?: ProviderMode;
  provider: string;
  api: SupportedApi;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const model = resolveActiveModel({ ...cfg, thinkingLevel: "off" });
    const stream = piModels.streamSimple(
      model,
      {
        systemPrompt: "You are a connectivity check assistant.",
        messages: [
          {
            role: "user",
            content: "Reply with OK",
            timestamp: Date.now(),
          },
        ],
      },
      {
        maxTokens: 16,
        temperature: 0,
      }
    );
    const finalMsg = await stream.result();
    if (finalMsg.stopReason === "error" || finalMsg.stopReason === "aborted") {
      return {
        ok: false,
        message: finalMsg.errorMessage || `停止原因: ${finalMsg.stopReason}`,
      };
    }
    return {
      ok: true,
      message: `连接成功 (${model.provider} · ${model.id})`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
