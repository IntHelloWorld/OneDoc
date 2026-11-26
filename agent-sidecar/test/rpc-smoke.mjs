import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "..", "dist", "server.js");

// Use an isolated temporary auth directory so tests never mutate user ~/.pi/agent/auth.json
const tmpPiDir = fs.mkdtempSync(path.join(os.tmpdir(), "onedoc-pi-auth-"));

const child = spawn(process.execPath, [serverEntry], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    PI_CODING_AGENT_DIR: tmpPiDir,
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    GEMINI_API_KEY: "",
  },
});

let stderrBuf = "";
child.stderr.on("data", (d) => {
  stderrBuf += d.toString();
});

const rl = readline.createInterface({ input: child.stdout });
const events = [];
const waiters = [];

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const ev = JSON.parse(trimmed);
  events.push(ev);
  while (waiters.length > 0) {
    const idx = waiters.findIndex((w) => w.pred(ev));
    if (idx === -1) break;
    const [w] = waiters.splice(idx, 1);
    w.resolve(ev);
  }
});

function waitForEvent(pred, label, timeoutMs = 8000) {
  const existing = events.find(pred);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${label}. stderr=${stderrBuf}`));
    }, timeoutMs);
    waiters.push({
      pred,
      resolve: (ev) => {
        clearTimeout(timer);
        resolve(ev);
      },
    });
  });
}

function send(cmd) {
  child.stdin.write(`${JSON.stringify(cmd)}\n`);
}

try {
  const ready = await waitForEvent((e) => e.type === "ready", "ready");
  assert.equal(ready.version, "1.6.0");
  assert.equal(ready.tools.length, 9);

  // Initial providers catalog
  const catalog = await waitForEvent(
    (e) => e.type === "providers_catalog",
    "providers_catalog"
  );
  assert.ok(catalog.providers.length >= 40, "Expected >= 40 built-in providers");
  assert.ok(catalog.authFilePath.startsWith(tmpPiDir));
  const oauthIds = catalog.providers.filter((p) => p.hasOAuth).map((p) => p.id);
  for (const expected of [
    "anthropic",
    "openai",
    "openai-codex",
    "github-copilot",
    "kimi-coding",
  ]) {
    assert.ok(oauthIds.includes(expected), `Missing OAuth provider: ${expected}`);
  }

  // Test set_api_key -> persists to auth.json and flips authenticated=true
  events.length = 0;
  send({ type: "set_api_key", providerId: "deepseek", apiKey: "sk-smoke-123" });
  const afterKey = await waitForEvent(
    (e) => e.type === "providers_catalog",
    "catalog after set_api_key"
  );
  const ds = afterKey.providers.find((p) => p.id === "deepseek");
  assert.equal(ds.authenticated, true);
  assert.equal(ds.authType, "api_key");
  assert.ok(fs.existsSync(path.join(tmpPiDir, "auth.json")));

  // Test logout -> clears credential
  events.length = 0;
  send({ type: "logout", providerId: "deepseek" });
  const afterLogout = await waitForEvent(
    (e) => e.type === "providers_catalog",
    "catalog after logout"
  );
  const dsAfter = afterLogout.providers.find((p) => p.id === "deepseek");
  assert.equal(dsAfter.authenticated, false);

  // Test configure builtin subscription providers & custom 4 protocols
  for (const cfg of [
    {
      mode: "builtin",
      provider: "anthropic",
      api: "anthropic-messages",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-sonnet-4-5",
    },
    {
      mode: "builtin",
      provider: "openai-codex",
      api: "openai-codex-responses",
      baseUrl: "",
      apiKey: "",
      model: "gpt-5.3-codex",
    },
    {
      mode: "custom",
      provider: "custom",
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "test-key",
      model: "deepseek-chat",
    },
    {
      mode: "custom",
      provider: "custom",
      api: "google-generative-ai",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "test-key",
      model: "gemini-2.5-pro",
    },
  ]) {
    events.length = 0;
    send({
      type: "configure",
      ...cfg,
      temperature: 0.3,
      thinkingLevel: "medium",
    });
    const st = await waitForEvent((e) => e.type === "state", `state:${cfg.provider}`);
    assert.equal(st.config.mode, cfg.mode);
    assert.equal(st.tools.length, 9);
  }

  events.length = 0;
  send({ type: "abort" });
  send({ type: "reset", sessionId: "smoke-reset" });
  const resetState = await waitForEvent(
    (e) => e.type === "state" && e.sessionId === "smoke-reset",
    "reset state"
  );
  assert.equal(resetState.isStreaming, false);

  child.stdin.end();
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0);
  console.log(
    `Pi Agent sidecar RPC smoke test PASSED (${catalog.providers.length} built-in providers, OAuth/API-key store, all protocols).`
  );
} catch (err) {
  child.kill();
  console.error("Smoke test failed:", err);
  process.exit(1);
} finally {
  fs.rmSync(tmpPiDir, { recursive: true, force: true });
}
