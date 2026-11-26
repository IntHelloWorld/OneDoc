import type {
  AuthInteraction,
  AuthPrompt,
  AuthType,
  CredentialStore,
  Models,
} from "@earendil-works/pi-ai";
import { emitEvent, type SerializedAuthPrompt } from "./protocol.js";
import { listProvidersCatalog } from "./streamRouter.js";

interface PendingPrompt {
  loginId: string;
  resolve: (value: string) => void;
  reject: (err: Error) => void;
}

export class PiAuthManager {
  private activeLogins = new Map<string, AbortController>();
  private pendingPrompts = new Map<string, PendingPrompt>();
  private promptCounter = 0;

  constructor(
    private models: Models,
    private credentials: CredentialStore
  ) {}

  async emitCatalog(): Promise<void> {
    const catalog = await listProvidersCatalog();
    emitEvent({
      type: "providers_catalog",
      authFilePath: catalog.authFilePath,
      providers: catalog.providers,
    });
  }

  startLogin(loginId: string, providerId: string, authType: AuthType): void {
    const prev = this.activeLogins.get(loginId);
    if (prev) {
      prev.abort(new Error("Superseded by new login request"));
    }

    const controller = new AbortController();
    this.activeLogins.set(loginId, controller);

    const interaction: AuthInteraction = {
      signal: controller.signal,
      notify: (event) => {
        emitEvent({ type: "auth_event", loginId, event });
      },
      prompt: (prompt: AuthPrompt) => {
        const promptId = `prompt-${++this.promptCounter}-${Date.now().toString(36)}`;
        const serialized: SerializedAuthPrompt =
          prompt.type === "select"
            ? {
                type: "select",
                message: prompt.message,
                options: prompt.options.map((o) => ({
                  id: o.id,
                  label: o.label,
                  description: o.description,
                })),
              }
            : {
                type: prompt.type,
                message: prompt.message,
                placeholder: prompt.placeholder,
              };

        return new Promise<string>((resolve, reject) => {
          const onPromptSignalAbort = () => {
            if (this.pendingPrompts.delete(promptId)) {
              emitEvent({
                type: "auth_prompt_cancelled",
                loginId,
                promptId,
              });
              reject(
                prompt.signal?.reason instanceof Error
                  ? prompt.signal.reason
                  : new Error("登录交互已自动完成或取消")
              );
            }
          };

          if (prompt.signal?.aborted) {
            reject(new Error("登录交互已取消"));
            return;
          }

          prompt.signal?.addEventListener("abort", onPromptSignalAbort, {
            once: true,
          });

          this.pendingPrompts.set(promptId, {
            loginId,
            resolve: (val) => {
              prompt.signal?.removeEventListener("abort", onPromptSignalAbort);
              resolve(val);
            },
            reject: (err) => {
              prompt.signal?.removeEventListener("abort", onPromptSignalAbort);
              reject(err);
            },
          });

          emitEvent({
            type: "auth_prompt",
            loginId,
            promptId,
            prompt: serialized,
          });
        });
      },
    };

    void (async () => {
      try {
        const cred = await this.models.login(providerId, authType, interaction, {
          agentName: "OneDoc",
        });
        emitEvent({
          type: "auth_complete",
          loginId,
          providerId,
          credentialType: cred.type,
        });
        await this.emitCatalog();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emitEvent({
          type: "auth_error",
          loginId,
          providerId,
          error: msg,
        });
      } finally {
        if (this.activeLogins.get(loginId) === controller) {
          this.activeLogins.delete(loginId);
        }
        for (const [pid, p] of this.pendingPrompts.entries()) {
          if (p.loginId === loginId) {
            this.pendingPrompts.delete(pid);
          }
        }
      }
    })();
  }

  respondPrompt(promptId: string, value?: string, cancelled?: boolean): void {
    const entry = this.pendingPrompts.get(promptId);
    if (!entry) return;
    this.pendingPrompts.delete(promptId);
    if (cancelled) {
      entry.reject(new Error("用户取消了登录输入"));
    } else {
      entry.resolve(value ?? "");
    }
  }

  cancelLogin(loginId: string): void {
    const ctrl = this.activeLogins.get(loginId);
    if (ctrl) {
      ctrl.abort(new Error("用户取消登录"));
      this.activeLogins.delete(loginId);
    }
    for (const [pid, p] of this.pendingPrompts.entries()) {
      if (p.loginId === loginId) {
        this.pendingPrompts.delete(pid);
        p.reject(new Error("用户取消登录"));
      }
    }
  }

  async logout(providerId: string): Promise<void> {
    await this.models.logout(providerId);
    await this.emitCatalog();
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      await this.models.logout(providerId);
    } else {
      await this.credentials.modify(providerId, async () => ({
        type: "api_key",
        key: trimmed,
      }));
    }
    await this.emitCatalog();
  }
}
