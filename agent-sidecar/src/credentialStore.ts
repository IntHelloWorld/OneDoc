import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

export function getAuthFilePath(): string {
  const baseDir =
    process.env.PI_CODING_AGENT_DIR?.trim() ||
    path.join(os.homedir(), ".pi", "agent");
  return path.join(baseDir, "auth.json");
}

function readAuthMapSync(filePath: string): Record<string, Credential> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, Credential>;
    }
  } catch (err) {
    process.stderr.write(
      `[pi-sidecar] failed to read auth.json (${filePath}): ${String(err)}\n`
    );
  }
  return {};
}

function writeAuthMapSync(
  filePath: string,
  data: Record<string, Credential>
): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Disk-backed CredentialStore sharing ~/.pi/agent/auth.json with Pi CLI.
 * Per-provider async serialization ensures OAuth token refreshes never race.
 */
export class FileCredentialStore implements CredentialStore {
  private queues = new Map<string, Promise<unknown>>();

  private enqueue<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(providerId) ?? Promise.resolve();
    const next = prev.then(task, task);
    const settled = next.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(providerId, settled);
    void settled.then(() => {
      if (this.queues.get(providerId) === settled) {
        this.queues.delete(providerId);
      }
    });
    return next;
  }

  async read(
    providerId: string,
    options?: AuthOperationOptions
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    const map = readAuthMapSync(getAuthFilePath());
    return map[providerId];
  }

  async list(
    options?: AuthOperationOptions
  ): Promise<readonly CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    const map = readAuthMapSync(getAuthFilePath());
    return Object.entries(map)
      .filter(([, cred]) => cred && (cred.type === "oauth" || cred.type === "api_key"))
      .map(([providerId, cred]) => ({
        providerId,
        type: cred.type,
      }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions
  ): Promise<Credential | undefined> {
    return this.enqueue(providerId, async () => {
      options?.signal?.throwIfAborted();
      const filePath = getAuthFilePath();
      const map = readAuthMapSync(filePath);
      const current = map[providerId];
      const updated = await fn(current);
      if (updated === undefined) {
        return current;
      }
      map[providerId] = updated;
      writeAuthMapSync(filePath, map);
      return updated;
    });
  }

  async delete(
    providerId: string,
    options?: AuthOperationOptions
  ): Promise<void> {
    await this.enqueue(providerId, async () => {
      options?.signal?.throwIfAborted();
      const filePath = getAuthFilePath();
      const map = readAuthMapSync(filePath);
      if (providerId in map) {
        delete map[providerId];
        writeAuthMapSync(filePath, map);
      }
    });
  }
}
