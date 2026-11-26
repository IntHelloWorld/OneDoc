import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  cancelPiLogin,
  logoutPiProvider,
  refreshPiProviders,
  respondPiLoginPrompt,
  savePiProviderApiKey,
  startPiLogin,
  syncPiProviderConfig,
  testPiProviderConnection,
} from "../lib/agentEngine";
import { isTauriRuntime, openExternalUrl } from "../lib/tauriBridge";
import { useAppStore } from "../store/useAppStore";
import type {
  LlmApiProtocol,
  ProviderCatalogItem,
  ProviderConfig,
  ThinkingLevel,
} from "../types/agent";

type SettingsTab = "oauth" | "apikey" | "custom";

const TAB_DESCRIPTIONS: Record<
  SettingsTab,
  { title: string; subtitle: string }
> = {
  oauth: {
    title: "订阅账号直登 (OAuth)",
    subtitle:
      "支持 Claude Pro/Max、ChatGPT Plus/Pro、GitHub Copilot、Kimi Code 订阅直登，并与 Pi CLI 共享本地凭证",
  },
  apikey: {
    title: "内置 API 服务商目录",
    subtitle:
      "覆盖主流云端大模型官方接口，密钥直接持久化至 Pi 本地凭证库",
  },
  custom: {
    title: "自定义兼容网关与本地 Ollama",
    subtitle:
      "接入企业内部网关、OpenAI / Anthropic / Gemini 兼容代理或本地 Ollama 服务",
  },
};

const INPUT_CLASS =
  "w-full px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all select-text";

const SELECT_CLASS =
  "w-full px-2.5 py-2 text-xs text-zinc-900 bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all cursor-pointer";

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const providerConfig = useAppStore((s) => s.providerConfig);
  const setProviderConfig = useAppStore((s) => s.setProviderConfig);
  const providerCatalog = useAppStore((s) => s.providerCatalog);
  const authFilePath = useAppStore((s) => s.authFilePath);
  const authFlow = useAppStore((s) => s.authFlow);
  const setAuthFlow = useAppStore((s) => s.setAuthFlow);
  const showToast = useAppStore((s) => s.showToast);

  const [draft, setDraft] = useState<ProviderConfig>(providerConfig);
  const [tab, setTab] = useState<SettingsTab>("oauth");
  const [searchQuery, setSearchQuery] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(providerConfig);
      setTestResult(null);
      setPromptInput("");
      if (providerConfig.mode === "custom") {
        setTab("custom");
      } else {
        const cur = providerCatalog.find((p) => p.id === providerConfig.id);
        setTab(cur && !cur.hasOAuth ? "apikey" : "oauth");
      }
      if (isTauriRuntime()) {
        void refreshPiProviders();
      }
    }
  }, [open]);

  useEffect(() => {
    setPromptInput("");
  }, [authFlow?.prompt?.promptId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && authFlow?.status !== "running") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, authFlow?.status, setOpen]);

  if (!open) return null;

  const oauthProviders = providerCatalog.filter((p) => p.hasOAuth);
  const apiKeyProviders = providerCatalog.filter((p) => p.hasApiKey);
  const filteredKeyProviders = apiKeyProviders.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  const activeCatalogProvider: ProviderCatalogItem | undefined =
    draft.mode === "builtin"
      ? providerCatalog.find((p) => p.id === draft.id)
      : undefined;

  const selectBuiltinProvider = (p: ProviderCatalogItem) => {
    const existingModel = p.models.find((m) => m.id === draft.model);
    const chosen = existingModel ?? p.models[0];
    const nextCfg: ProviderConfig = {
      ...draft,
      mode: "builtin",
      id: p.id,
      name: p.name,
      api: (chosen?.api as LlmApiProtocol) || draft.api,
      model: chosen?.id || draft.model,
    };
    setDraft(nextCfg);
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testPiProviderConnection(draft);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    setProviderConfig(draft);
    void syncPiProviderConfig(draft);
    setOpen(false);
  };

  const handleCopyDeviceCode = async (code: string, url: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("success", `已复制授权码 ${code} 并打开验证网页`);
    } catch {
      showToast("info", `授权码：${code}`);
    }
    if (isTauriRuntime() && url) {
      await openExternalUrl(url);
    }
  };

  const handleSubmitPrompt = () => {
    if (!authFlow?.prompt) return;
    void respondPiLoginPrompt(authFlow.prompt.promptId, promptInput);
  };

  const isDraftReady =
    draft.mode === "custom"
      ? Boolean(
          draft.apiKey ||
            draft.baseUrl.includes("localhost") ||
            draft.baseUrl.includes("127.0.0.1")
        )
      : Boolean(activeCatalogProvider?.authenticated);

  return (
    <div
      onClick={() => {
        if (authFlow?.status !== "running") setOpen(false);
      }}
      className="fixed inset-0 z-50 bg-zinc-950/35 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[84vh] max-h-[760px] bg-white rounded-2xl border border-zinc-200/80 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.18)] flex overflow-hidden"
      >
        {/* Left Navigation Rail */}
        <nav className="w-56 shrink-0 bg-[#FAFAFB] border-r border-zinc-200/75 flex flex-col justify-between p-3.5">
          <div className="space-y-5">
            {/* Brand Header */}
            <div className="flex items-center gap-2.5 px-1.5 pt-0.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-[0_4px_12px_-3px_rgba(79,70,229,0.45)] shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold tracking-tight text-zinc-900 truncate">
                  模型与账号
                </div>
                <div className="text-[10.5px] text-zinc-500 truncate">
                  Pi Agent 引擎中心
                </div>
              </div>
            </div>

            {/* Section Tabs */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[10.5px] font-medium text-zinc-400">
                连接方式
              </div>
              <button
                type="button"
                onClick={() => setTab("oauth")}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  tab === "oauth"
                    ? "bg-white text-zinc-900 border-zinc-200/80 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/45 border-transparent"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ShieldCheck
                    className={`w-3.5 h-3.5 shrink-0 ${
                      tab === "oauth" ? "text-indigo-600" : "text-zinc-400"
                    }`}
                  />
                  <span className="truncate">订阅账号登录</span>
                </span>
                <span className="text-[10.5px] text-zinc-400 tabular-nums shrink-0">
                  {oauthProviders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTab("apikey")}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  tab === "apikey"
                    ? "bg-white text-zinc-900 border-zinc-200/80 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/45 border-transparent"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <KeyRound
                    className={`w-3.5 h-3.5 shrink-0 ${
                      tab === "apikey" ? "text-indigo-600" : "text-zinc-400"
                    }`}
                  />
                  <span className="truncate">内置 API 服务商</span>
                </span>
                <span className="text-[10.5px] text-zinc-400 tabular-nums shrink-0">
                  {apiKeyProviders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab("custom");
                  setDraft((d) => ({ ...d, mode: "custom" }));
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  tab === "custom"
                    ? "bg-white text-zinc-900 border-zinc-200/80 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/45 border-transparent"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Server
                    className={`w-3.5 h-3.5 shrink-0 ${
                      tab === "custom" ? "text-indigo-600" : "text-zinc-400"
                    }`}
                  />
                  <span className="truncate">自定义 / Ollama</span>
                </span>
              </button>
            </div>
          </div>

          {/* Bottom Summary & Local Auth Store */}
          <div className="space-y-2.5 pt-3 border-t border-zinc-200/70">
            <div className="p-2.5 rounded-xl bg-white border border-zinc-200/75 space-y-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10.5px] font-medium text-zinc-400">
                  待应用配置
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    isDraftReady
                      ? "bg-emerald-50/90 text-emerald-700"
                      : "bg-amber-50/90 text-amber-700"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isDraftReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {isDraftReady ? "就绪" : "待认证"}
                </span>
              </div>
              <div className="text-xs font-semibold text-zinc-900 truncate">
                {draft.mode === "builtin"
                  ? activeCatalogProvider?.oauthName ||
                    activeCatalogProvider?.name ||
                    draft.id
                  : draft.name || "自定义网关"}
              </div>
              <div className="text-[10.5px] font-mono text-zinc-500 truncate">
                {draft.model || "未填写模型 ID"}
              </div>
            </div>

            {(authFilePath || isTauriRuntime()) && (
              <div className="flex items-center justify-between gap-1.5 px-1">
                {authFilePath ? (
                  <span
                    title={`Pi 凭证库：${authFilePath}`}
                    className="text-[10px] font-mono text-zinc-400 truncate"
                  >
                    {authFilePath}
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-400">
                    Pi 本地凭证库
                  </span>
                )}
                {isTauriRuntime() && (
                  <button
                    type="button"
                    onClick={() => void refreshPiProviders()}
                    title="刷新本地 Pi 凭证状态"
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Right Main Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-200/75 flex items-start justify-between gap-4 shrink-0">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {TAB_DESCRIPTIONS[tab].title}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                {TAB_DESCRIPTIONS[tab].subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="关闭 (Esc)"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Interactive OAuth Flow Card */}
            {authFlow && (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  authFlow.status === "error"
                    ? "bg-rose-50/75 border-rose-200/80"
                    : authFlow.status === "success"
                    ? "bg-emerald-50/75 border-emerald-200/80"
                    : "bg-indigo-50/60 border-indigo-200/75"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                    {authFlow.status === "running" && (
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    )}
                    {authFlow.status === "success" && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                    {authFlow.status === "error" && (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span>
                      {authFlow.providerName}{" "}
                      {authFlow.status === "running"
                        ? "正在进行 OAuth 授权登录..."
                        : authFlow.status === "success"
                        ? "登录成功"
                        : "登录未完成"}
                    </span>
                  </div>
                  {authFlow.status === "running" ? (
                    <button
                      type="button"
                      onClick={() => void cancelPiLogin()}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white border border-zinc-200/90 text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                    >
                      取消登录
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAuthFlow(null)}
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-800 hover:bg-white/60 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {authFlow.deviceCode && (
                  <div className="p-3.5 rounded-xl bg-white border border-zinc-200/80 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-zinc-500">
                        请在浏览器页面输入以下一次性设备授权码：
                      </div>
                      <div className="text-xl font-mono font-semibold tracking-[0.2em] text-zinc-900 tabular-nums mt-1 select-text">
                        {authFlow.deviceCode.userCode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyDeviceCode(
                          authFlow.deviceCode!.userCode,
                          authFlow.deviceCode!.verificationUri
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors cursor-pointer shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>复制并打开网页</span>
                    </button>
                  </div>
                )}

                {authFlow.authUrl && (
                  <div className="p-3 rounded-xl bg-white border border-zinc-200/80 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {authFlow.instructions && (
                        <div className="text-[11.5px] text-zinc-600 mb-0.5">
                          {authFlow.instructions}
                        </div>
                      )}
                      <div className="text-[11px] text-indigo-600 font-mono truncate select-text">
                        {authFlow.authUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openExternalUrl(authFlow.authUrl!)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/60 transition-colors shrink-0 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>打开浏览器</span>
                    </button>
                  </div>
                )}

                {authFlow.prompt && (
                  <div className="p-3.5 rounded-xl bg-white border border-zinc-200/80 space-y-2.5">
                    <div className="text-xs font-medium text-zinc-800">
                      {authFlow.prompt.message}
                    </div>
                    {authFlow.prompt.type === "select" &&
                    authFlow.prompt.options ? (
                      <div className="flex flex-wrap gap-2">
                        {authFlow.prompt.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              void respondPiLoginPrompt(
                                authFlow.prompt!.promptId,
                                opt.id
                              )
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAFAFB] hover:bg-indigo-50/70 text-zinc-800 hover:text-indigo-700 border border-zinc-200/80 hover:border-indigo-200/80 transition-colors cursor-pointer"
                          >
                            {opt.label}
                            {opt.description ? ` · ${opt.description}` : ""}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type={
                            authFlow.prompt.type === "secret"
                              ? "password"
                              : "text"
                          }
                          value={promptInput}
                          onChange={(e) => setPromptInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSubmitPrompt();
                          }}
                          placeholder={
                            authFlow.prompt.placeholder ||
                            "粘贴授权回调 URL 或授权码..."
                          }
                          autoFocus
                          className={INPUT_CLASS}
                        />
                        <button
                          type="button"
                          onClick={handleSubmitPrompt}
                          className="px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors shrink-0 cursor-pointer"
                        >
                          提交
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {authFlow.progressMessages.length > 0 &&
                  authFlow.status === "running" && (
                    <div className="text-[11px] text-zinc-500 space-y-0.5 pl-0.5">
                      {authFlow.progressMessages.map((m, i) => (
                        <div key={i}>· {m}</div>
                      ))}
                    </div>
                  )}

                {authFlow.error && (
                  <div className="text-xs text-rose-700 break-all select-text">
                    {authFlow.error}
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: OAuth Subscription Providers */}
            {tab === "oauth" && (
              <div className="space-y-3">
                {!isTauriRuntime() ? (
                  <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/75 text-xs text-amber-800 leading-relaxed">
                    当前为浏览器预览模式；订阅账号 OAuth 登录与{" "}
                    <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-[11px]">
                      ~/.pi/agent/auth.json
                    </code>{" "}
                    凭证读写请在 Tauri 桌面端（
                    <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono text-[11px]">
                      npm run tauri dev
                    </code>
                    ）中使用。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {oauthProviders.map((p) => {
                      const isSelected =
                        draft.mode === "builtin" && draft.id === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => selectBuiltinProvider(p)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                            isSelected
                              ? "border-indigo-400/80 bg-indigo-50/25 ring-2 ring-indigo-500/10"
                              : "border-zinc-200/80 hover:border-zinc-300 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-zinc-900 truncate">
                                {p.oauthName || p.name}
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums flex items-center gap-1.5">
                                <span className="font-mono text-[10.5px] text-zinc-400">
                                  {p.id}
                                </span>
                                <span className="text-zinc-300">·</span>
                                <span>{p.models.length} 个模型</span>
                              </div>
                            </div>

                            <span
                              className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full shrink-0 border ${
                                p.authenticated
                                  ? "bg-emerald-50/90 text-emerald-700 border-emerald-200/70"
                                  : "bg-zinc-100/80 text-zinc-500 border-zinc-200/60"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  p.authenticated
                                    ? "bg-emerald-500"
                                    : "bg-zinc-400"
                                }`}
                              />
                              {p.authenticated
                                ? p.authType === "oauth"
                                  ? "已登录订阅"
                                  : "已配置密钥"
                                : "未登录"}
                            </span>
                          </div>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-between gap-2 pt-2.5 border-t border-zinc-100"
                          >
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  selectBuiltinProvider(p);
                                  void startPiLogin(
                                    p.id,
                                    p.oauthName || p.name,
                                    "oauth"
                                  );
                                }}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                  p.authenticated
                                    ? "bg-white hover:bg-zinc-100/80 text-zinc-700 border border-zinc-200/90"
                                    : "bg-zinc-900 hover:bg-zinc-800 text-white"
                                }`}
                              >
                                <LogIn className="w-3 h-3" />
                                <span>
                                  {p.authenticated ? "重新登录" : "OAuth 登录"}
                                </span>
                              </button>
                              {p.authenticated && (
                                <button
                                  type="button"
                                  onClick={() => void logoutPiProvider(p.id)}
                                  title="清除该服务商本地凭证"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-rose-600 hover:bg-rose-50/80 transition-colors cursor-pointer"
                                >
                                  <LogOut className="w-3 h-3" />
                                  <span>退出</span>
                                </button>
                              )}
                            </div>

                            {p.authenticated && (
                              <button
                                type="button"
                                onClick={() => selectBuiltinProvider(p)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                  isSelected
                                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200/70"
                                    : "bg-zinc-100 hover:bg-zinc-200/75 text-zinc-700"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                                <span>{isSelected ? "当前选中" : "选用"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Built-in API Key Providers */}
            {tab === "apikey" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索服务商名称或 ID（如 deepseek / google / qwen / zai / minimax / moonshot）"
                    className="w-full pl-9 pr-16 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 bg-[#FAFAFB] focus:bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <span className="text-[10.5px] text-zinc-400 tabular-nums">
                      {filteredKeyProviders.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {filteredKeyProviders.length === 0 ? (
                    <div className="py-10 text-center text-xs text-zinc-400 rounded-xl border border-dashed border-zinc-200">
                      未找到匹配 “{searchQuery}” 的内置服务商
                    </div>
                  ) : (
                    filteredKeyProviders.map((p) => {
                      const isSelected =
                        draft.mode === "builtin" && draft.id === p.id;
                      const val = apiKeyInputs[p.id] ?? "";
                      return (
                        <div
                          key={p.id}
                          onClick={() => selectBuiltinProvider(p)}
                          className={`px-3.5 py-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? "border-indigo-400/80 bg-indigo-50/25 ring-2 ring-indigo-500/10"
                              : "border-zinc-200/80 hover:border-zinc-300 bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-zinc-900">
                                {p.name}
                              </span>
                              <span className="text-[10.5px] font-mono text-zinc-400">
                                {p.id}
                              </span>
                              {p.authenticated && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50/90 text-emerald-700 border border-emerald-200/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  {p.authSource || "已配置"}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                              {p.models.length} 个可用模型
                            </div>
                          </div>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 shrink-0"
                          >
                            <input
                              type="password"
                              value={val}
                              onChange={(e) =>
                                setApiKeyInputs((m) => ({
                                  ...m,
                                  [p.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && val.trim()) {
                                  selectBuiltinProvider(p);
                                  void savePiProviderApiKey(p.id, val);
                                  setApiKeyInputs((m) => ({
                                    ...m,
                                    [p.id]: "",
                                  }));
                                }
                              }}
                              placeholder={
                                p.authenticated
                                  ? "更新 API Key..."
                                  : "输入 API Key"
                              }
                              className="w-44 px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 bg-white border border-zinc-200/90 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 select-text"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (val.trim()) {
                                  selectBuiltinProvider(p);
                                  void savePiProviderApiKey(p.id, val);
                                  setApiKeyInputs((m) => ({
                                    ...m,
                                    [p.id]: "",
                                  }));
                                }
                              }}
                              disabled={!val.trim()}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-35 transition-colors cursor-pointer"
                            >
                              保存
                            </button>
                            {p.authenticated && (
                              <button
                                type="button"
                                onClick={() => void logoutPiProvider(p.id)}
                                title="清除密钥"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50/80 transition-colors cursor-pointer"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Custom Endpoint / Ollama */}
            {tab === "custom" && (
              <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-zinc-900">
                      私有端点与协议参数
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      本地 Ollama 无需 API Key，填写 Base URL 与模型名即可直连
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        mode: "custom",
                        id: "ollama",
                        name: "本地 Ollama",
                        api: "openai-completions",
                        baseUrl: "http://127.0.0.1:11434/v1",
                        apiKey: "",
                        model: "qwen2.5:14b",
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white hover:bg-zinc-100/80 text-zinc-700 border border-zinc-200/90 transition-colors shrink-0 cursor-pointer"
                  >
                    填入本地 Ollama 模板
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
                      接口协议 (Pi AI Wire API)
                    </label>
                    <select
                      value={draft.api}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          mode: "custom",
                          api: e.target.value as LlmApiProtocol,
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="openai-completions">
                        OpenAI Completions 兼容
                      </option>
                      <option value="anthropic-messages">
                        Anthropic Messages
                      </option>
                      <option value="google-generative-ai">
                        Google Gemini
                      </option>
                      <option value="openai-responses">
                        OpenAI Responses
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={draft.apiKey}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          mode: "custom",
                          apiKey: e.target.value,
                        })
                      }
                      placeholder="sk-...（本地 Ollama 可留空）"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
                    API Base URL
                  </label>
                  <input
                    type="text"
                    value={draft.baseUrl}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mode: "custom",
                        baseUrl: e.target.value,
                      })
                    }
                    placeholder="https://api.deepseek.com/v1"
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>
            )}

            {/* Shared Active Model & Inference Controls */}
            <div className="p-4 rounded-xl border border-zinc-200/75 bg-[#FAFAFB] space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>
                    推理参数 ·{" "}
                    {draft.mode === "builtin"
                      ? `${
                          activeCatalogProvider?.oauthName ||
                          activeCatalogProvider?.name ||
                          draft.id
                        }`
                      : "自定义兼容网关"}
                  </span>
                </span>
                {draft.mode === "builtin" && activeCatalogProvider && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full border ${
                      activeCatalogProvider.authenticated
                        ? "bg-emerald-50/90 text-emerald-700 border-emerald-200/70"
                        : "bg-amber-50/90 text-amber-700 border-amber-200/70"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        activeCatalogProvider.authenticated
                          ? "bg-emerald-500"
                          : "bg-amber-500"
                      }`}
                    />
                    {activeCatalogProvider.authenticated
                      ? `凭证就绪 (${
                          activeCatalogProvider.authType === "oauth"
                            ? "OAuth"
                            : "API Key"
                        })`
                      : "尚未登录 / 配置凭证"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
                    模型 (Model ID)
                  </label>
                  {draft.mode === "builtin" &&
                  activeCatalogProvider &&
                  activeCatalogProvider.models.length > 0 ? (
                    <select
                      value={
                        activeCatalogProvider.models.some(
                          (m) => m.id === draft.model
                        )
                          ? draft.model
                          : ""
                      }
                      onChange={(e) => {
                        const m = activeCatalogProvider.models.find(
                          (item) => item.id === e.target.value
                        );
                        if (m) {
                          setDraft({
                            ...draft,
                            model: m.id,
                            api: (m.api as LlmApiProtocol) || draft.api,
                          });
                        }
                      }}
                      className={SELECT_CLASS}
                    >
                      {!activeCatalogProvider.models.some(
                        (m) => m.id === draft.model
                      ) && <option value="">自定义: {draft.model}</option>}
                      {activeCatalogProvider.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={draft.model}
                      onChange={(e) =>
                        setDraft({ ...draft, model: e.target.value })
                      }
                      placeholder="claude-sonnet-4-5"
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1.5">
                    深度思考 (Thinking)
                  </label>
                  <select
                    value={draft.thinkingLevel}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        thinkingLevel: e.target.value as ThinkingLevel,
                      })
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="off">关闭 (Off)</option>
                    <option value="low">轻量 (Low)</option>
                    <option value="medium">均衡 (Medium)</option>
                    <option value="high">深度 (High)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-zinc-600">
                      随机度 (Temperature)
                    </label>
                    <span className="text-[11px] font-mono font-medium text-zinc-700 bg-white border border-zinc-200/80 px-1.5 py-0.5 rounded tabular-nums">
                      {draft.temperature.toFixed(1)}
                    </span>
                  </div>
                  <div className="pt-1.5">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={draft.temperature}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          temperature: Number(e.target.value),
                        })
                      }
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
                  testResult.ok
                    ? "bg-emerald-50/80 text-emerald-800 border-emerald-200/80"
                    : "bg-rose-50/80 text-rose-700 border-rose-200/80"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span className="break-all select-text leading-relaxed">
                  {testResult.message}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 bg-[#FAFAFB]/80 border-t border-zinc-200/75 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-zinc-100/80 text-zinc-700 border border-zinc-200/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Pi 协议测试连接</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition-colors cursor-pointer"
              >
                应用此模型配置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
