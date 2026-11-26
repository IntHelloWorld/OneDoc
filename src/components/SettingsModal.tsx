import { useEffect, useState } from "react";
import {
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/70">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Pi Agent 账号登录与多模型中心
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              支持 Claude Pro/Max、ChatGPT Plus/Pro、GitHub Copilot、Kimi Code 等订阅直接 OAuth 登录，并与 Pi CLI 共享凭证
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top tab switcher + credential path bar */}
        <div className="px-5 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setTab("oauth")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                tab === "oauth"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>订阅账号登录 ({oauthProviders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("apikey")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                tab === "apikey"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>内置 API 服务商 ({apiKeyProviders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("custom");
                setDraft((d) => ({ ...d, mode: "custom" }));
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                tab === "custom"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>自定义 / Ollama</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {authFilePath && (
              <span
                title={authFilePath}
                className="max-w-[230px] truncate bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px]"
              >
                凭证库: {authFilePath}
              </span>
            )}
            {isTauriRuntime() && (
              <button
                type="button"
                onClick={() => void refreshPiProviders()}
                title="刷新本地 Pi 凭证状态"
                className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Interactive OAuth flow card */}
          {authFlow && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                authFlow.status === "error"
                  ? "bg-red-50/70 border-red-200"
                  : authFlow.status === "success"
                  ? "bg-emerald-50/70 border-emerald-200"
                  : "bg-blue-50/70 border-blue-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  {authFlow.status === "running" && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  )}
                  {authFlow.status === "success" && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                  {authFlow.status === "error" && (
                    <XCircle className="w-4 h-4 text-red-600" />
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
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    取消登录
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthFlow(null)}
                    className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {authFlow.deviceCode && (
                <div className="p-3 rounded-lg bg-white border border-blue-200 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-slate-500">
                      请在浏览器页面输入以下一次性设备授权码：
                    </div>
                    <div className="text-lg font-mono font-bold tracking-widest text-blue-700 mt-0.5 select-text">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制并打开网页</span>
                  </button>
                </div>
              )}

              {authFlow.authUrl && (
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {authFlow.instructions && (
                      <div className="text-[11px] text-slate-600 mb-0.5">
                        {authFlow.instructions}
                      </div>
                    )}
                    <div className="text-[11px] text-blue-600 font-mono truncate select-text">
                      {authFlow.authUrl}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openExternalUrl(authFlow.authUrl!)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 shrink-0 cursor-pointer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>打开浏览器</span>
                  </button>
                </div>
              )}

              {authFlow.prompt && (
                <div className="p-3 rounded-lg bg-white border border-blue-200 space-y-2">
                  <div className="text-xs font-medium text-slate-800">
                    {authFlow.prompt.message}
                  </div>
                  {authFlow.prompt.type === "select" && authFlow.prompt.options ? (
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
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
                        >
                          {opt.label}
                          {opt.description ? ` · ${opt.description}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type={authFlow.prompt.type === "secret" ? "password" : "text"}
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSubmitPrompt();
                        }}
                        placeholder={
                          authFlow.prompt.placeholder || "粘贴授权回调 URL 或授权码..."
                        }
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md outline-none focus:border-blue-500 select-text"
                      />
                      <button
                        type="button"
                        onClick={handleSubmitPrompt}
                        className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                      >
                        提交
                      </button>
                    </div>
                  )}
                </div>
              )}

              {authFlow.progressMessages.length > 0 && authFlow.status === "running" && (
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  {authFlow.progressMessages.map((m, i) => (
                    <div key={i}>• {m}</div>
                  ))}
                </div>
              )}

              {authFlow.error && (
                <div className="text-xs text-red-700 break-all select-text">
                  {authFlow.error}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: OAuth Subscription Providers */}
          {tab === "oauth" && (
            <div className="space-y-3">
              {!isTauriRuntime() ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  当前为浏览器预览模式；订阅账号 OAuth 登录与 `~/.pi/agent/auth.json` 凭证读写请在 Tauri 桌面端（<code className="bg-amber-100 px-1 rounded">npm run tauri dev</code>）中使用。
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {oauthProviders.map((p) => {
                    const isSelected =
                      draft.mode === "builtin" && draft.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => selectBuiltinProvider(p)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-900 truncate">
                                {p.oauthName || p.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {p.id} · {p.models.length} 个可用模型
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                              p.authenticated
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {p.authenticated
                              ? p.authType === "oauth"
                                ? "已登录订阅"
                                : "已配置密钥"
                              : "未登录"}
                          </span>
                        </div>

                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100"
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
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                            >
                              <LogIn className="w-3 h-3" />
                              <span>{p.authenticated ? "重新登录" : "OAuth 登录"}</span>
                            </button>
                            {p.authenticated && (
                              <button
                                type="button"
                                onClick={() => void logoutPiProvider(p.id)}
                                title="清除该服务商本地凭证"
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
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
                              className={`px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                                isSelected
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                              }`}
                            >
                              {isSelected ? "当前选中" : "选用"}
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

          {/* TAB 2: Built-in API Key / Token Plan Providers */}
          {tab === "apikey" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索内置服务商（如 deepseek / google / qwen / zai / minimax / moonshot）"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {filteredKeyProviders.map((p) => {
                  const isSelected =
                    draft.mode === "builtin" && draft.id === p.id;
                  const val = apiKeyInputs[p.id] ?? "";
                  return (
                    <div
                      key={p.id}
                      onClick={() => selectBuiltinProvider(p)}
                      className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/40"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900">
                            {p.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {p.id}
                          </span>
                          {p.authenticated && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              {p.authSource || "已配置"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {p.models.length} 个模型
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
                            setApiKeyInputs((m) => ({ ...m, [p.id]: e.target.value }))
                          }
                          placeholder={p.authenticated ? "更新 API Key..." : "输入 API Key"}
                          className="w-40 px-2.5 py-1 text-xs border border-slate-300 rounded-md outline-none focus:border-blue-500 select-text"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (val.trim()) {
                              selectBuiltinProvider(p);
                              void savePiProviderApiKey(p.id, val);
                              setApiKeyInputs((m) => ({ ...m, [p.id]: "" }));
                            }
                          }}
                          disabled={!val.trim()}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 cursor-pointer"
                        >
                          保存
                        </button>
                        {p.authenticated && (
                          <button
                            type="button"
                            onClick={() => void logoutPiProvider(p.id)}
                            title="清除密钥"
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Custom Endpoint / Ollama */}
          {tab === "custom" && (
            <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  自定义私有部署 / 兼容网关
                </span>
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
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  填入本地 Ollama 模板
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
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
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                  >
                    <option value="openai-completions">OpenAI Completions 兼容</option>
                    <option value="anthropic-messages">Anthropic Messages</option>
                    <option value="google-generative-ai">Google Gemini</option>
                    <option value="openai-responses">OpenAI Responses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={(e) =>
                      setDraft({ ...draft, mode: "custom", apiKey: e.target.value })
                    }
                    placeholder="sk-...（本地 Ollama 可留空）"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none select-text"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  API Base URL
                </label>
                <input
                  type="text"
                  value={draft.baseUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, mode: "custom", baseUrl: e.target.value })
                  }
                  placeholder="https://api.deepseek.com/v1"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none select-text"
                />
              </div>
            </div>
          )}

          {/* Shared Active Model & Inference Controls */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  当前选用：
                  {draft.mode === "builtin"
                    ? `${activeCatalogProvider?.oauthName || activeCatalogProvider?.name || draft.id} (Pi 内置)`
                    : "自定义兼容网关"}
                </span>
              </span>
              {draft.mode === "builtin" && activeCatalogProvider && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    activeCatalogProvider.authenticated
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {activeCatalogProvider.authenticated
                    ? `凭证就绪 (${activeCatalogProvider.authType === "oauth" ? "OAuth" : "Key"})`
                    : "尚未登录/配置凭证"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  模型 (Model ID)
                </label>
                {draft.mode === "builtin" &&
                activeCatalogProvider &&
                activeCatalogProvider.models.length > 0 ? (
                  <select
                    value={
                      activeCatalogProvider.models.some((m) => m.id === draft.model)
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
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none focus:border-blue-500"
                  >
                    {!activeCatalogProvider.models.some(
                      (m) => m.id === draft.model
                    ) && (
                      <option value="">自定义: {draft.model}</option>
                    )}
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
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    placeholder="claude-sonnet-4-5"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none select-text"
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
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
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md outline-none"
                >
                  <option value="off">关闭 (Off)</option>
                  <option value="low">轻量 (Low)</option>
                  <option value="medium">均衡 (Medium)</option>
                  <option value="high">深度 (High)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  随机度 (Temperature: {draft.temperature})
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) =>
                    setDraft({ ...draft, temperature: Number(e.target.value) })
                  }
                  className="w-full mt-2 accent-blue-600"
                />
              </div>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                testResult.ok
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              )}
              <span className="break-all select-text">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 disabled:opacity-50 cursor-pointer"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>Pi 协议测试连接</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              应用此模型配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
