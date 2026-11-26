# OneDoc

**English** | [简体中文](./README.zh-CN.md)

**A Desktop Agent Harness for Document Engineering (Cursor for Documents)** — Completely decouples *content semantics* from *Word layout styling*, letting AI Agents focus on high-purity content authoring while a local deterministic Rust OOXML engine compiles accurate Word formatting.

---

## Key Features

- **Multi-Format Local Workspace**: Seamlessly browse, preview, and reference `.onedoc.json` (semantic documents), `.docx` (native Word paginated rendering), `.md` (Markdown), and `.txt` reference materials within a single workbench.
- **Declarative & Visual Style Contract (`StyleProfile`)**:
  - Includes 4 built-in industry & national standard presets: `modern-report` (Modern Tech / Business Report), `gov-gbt9704` (Chinese Official Document GB/T 9704), `academic-thesis` (Academic Thesis), and `bid-proposal` (RFP / Bid Proposal).
  - Visually customize page margins, headers & footers, CJK/Latin fonts (`w:eastAsia` / `w:ascii`), Chinese font sizes, first-line character indents, exact/multiple line spacing, multi-level numbering rules, and three-line / zebra / grid table styles per semantic role in **Style Studio**, with 60fps real-time canvas preview.
- **Reverse Style Extraction & `.docx` Import**: Drop in any external Word reference document to automatically parse `w:sectPr` and the `w:styles.xml` inheritance chain into a reusable `StyleProfile`, or import existing `.docx` files into editable semantic documents.
- **Pure Rust Deterministic OOXML Compiler**: Zero Python runtime dependency and no external Office installation required — compiles complete, valid `.docx` packages (`styles.xml`, `numbering.xml`, `header1.xml`, `footer1.xml`, and dynamic page-number fields) in milliseconds.
- **Pi Agent Sidecar Backend + Block-Level Diff Review**: Built on `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` as an isolated JSONL RPC Sidecar process, connecting directly to 43 built-in Pi model providers and **9 OAuth subscription logins** (Claude Pro/Max, ChatGPT Plus/Pro & Codex, GitHub Copilot, Kimi Code, etc., sharing `~/.pi/agent/auth.json` with `pi` CLI and auto-refreshing tokens). Supports API keys / custom local Ollama endpoints, Thinking streams, mid-run steering (`steer` / `followUp`), automatic session compaction, and 9 structured tools (`inspect_style_profile`, `replace_document`, `upsert_blocks`, etc.), with changes reviewed directly on the canvas as red/green diffs.

---

## Tech Stack Overview

| Layer | Stack | Responsibility |
| :--- | :--- | :--- |
| **Desktop Shell** | Tauri v2 | Instant startup, low memory footprint, local filesystem & native dialog access |
| **Local Engine** | Rust (`zip`, `quick-xml`, `tokio`, `reqwest`) | Pure Rust OOXML compilation & parsing, workspace scanning, Pi Sidecar process supervision |
| **Agent Backend** | Pi Agent (`@earendil-works/pi-agent-core` + `pi-ai` v1.6.0) | Standalone Node.js JSONL RPC Sidecar, 43 built-in providers (9 OAuth subscription logins + shared `~/.pi/agent/auth.json`), steering & context compaction |
| **Frontend** | React 19 + TypeScript + Vite 6 + Tailwind CSS v4 | Three-pane responsive workbench, Style Studio, and block-level interactive canvas |
| **State Management** | Zustand v5 | Document AST, undo stack, style contracts, diff state, and Agent conversation stream management |
| **Source & Preview** | CodeMirror 6 + Custom AST Paged Preview + `docx-preview` | Bidirectional Markdown sync, live A4 layout preview, native rendering of external `.docx` files |

---

## Quick Start

### Prerequisites

- Node.js `>= 20` (tested on `v24.15.0`)
- Rust toolchain (`rustc` / `cargo`; Windows requires MSVC build tools and Windows SDK)
- Windows WebView2 Runtime (typically pre-installed on Windows 10/11)

### Install & Run

```powershell
# 1. Install frontend & Pi Agent Sidecar dependencies and build the Sidecar
npm install
npm --prefix agent-sidecar install
npm run build:sidecar

# 2. Launch the Tauri desktop dev environment (hot-reloading frontend + Rust backend)
npm run tauri dev
```

### Build & Test

```powershell
# Pi Agent Sidecar typecheck, build, and RPC smoke test
npm --prefix agent-sidecar run typecheck
npm run build:sidecar
npm --prefix agent-sidecar test

# Full build (Sidecar build + TypeScript check + Vite frontend bundle)
npm run typecheck
npm run build

# Run Rust unit tests (OOXML compiler, style extraction, Sidecar path resolution, sample workspace)
cd src-tauri
cargo test

# Build desktop executable (debug / release)
cargo build
npm run tauri build
```

> After launching the app for the first time, click **Generate Sample Workspace** in the left sidebar to scaffold a ready-to-explore directory containing `.onedoc.json`, a GB/T 9704 `.docx` reference template, `.md`, and `.txt` files. Click the gear icon in the top-right corner to configure **Subscription Login** (9 OAuth subscriptions including Claude Pro/Max, ChatGPT Plus/Pro & Codex, GitHub Copilot, Kimi Code, and SuperGrok — automatically inheriting `~/.pi/agent/auth.json` if already signed in with `pi` CLI), **Built-in API Providers** (43-provider catalog), or **Custom / Ollama**.

---

## Project Structure

```text
OneDoc/
├── agent-sidecar/
│   ├── src/
│   │   ├── credentialStore.ts    # Atomic ~/.pi/agent/auth.json read/write with async mutex
│   │   ├── authManager.ts        # Interactive OAuth subscription login, device code & token refresh FSM
│   │   ├── protocol.ts           # JSONL RPC command & event protocol types
│   │   ├── streamRouter.ts       # 43 Pi provider catalog, multi-protocol routing & connection checks
│   │   ├── sessionStore.ts       # JSONL session persistence & automatic context compaction
│   │   ├── tools.ts              # 9 semantic document tools & bidirectional host callback bridge
│   │   └── server.ts             # Pi Agent instance, event subscriptions & stdin/stdout loop
│   └── test/rpc-smoke.mjs        # Automated Sidecar JSONL RPC smoke test
├── docs/
│   ├── ARCHITECTURE.md           # Layered architecture, core data flows & IPC interface docs
│   ├── DESIGN_DECISIONS.md       # Architecture Decision Records (ADR-001 ~ ADR-006, incl. Pi Agent design)
│   └── STYLE_AND_OOXML.md        # StyleProfile schema, AST specification & OOXML mapping details
├── src/
│   ├── components/               # Three-pane workbench UI, preview canvas, Style Studio & Agent panel
│   ├── lib/                      # Pi RPC client/tool runner, Markdown codec, CSS mapper, Diff & IPC bridge
│   ├── presets/                  # 4 built-in style contracts & Chinese font-size table
│   ├── store/                    # Zustand global state store
│   └── types/                    # Document AST, style, workspace & Agent type definitions
├── src-tauri/
│   └── src/
│       ├── models.rs             # Rust Serde models mirroring frontend types
│       ├── docx_compiler.rs      # Pure Rust deterministic OOXML compiler & unit tests
│       ├── docx_inspector.rs     # .docx text extraction, AST import & reverse style parsing
│       ├── workspace.rs          # Workspace scanning, style persistence & sample generator
│       ├── pi_sidecar.rs         # Pi Agent Node.js Sidecar process supervision & stdio routing
│       ├── llm_proxy.rs          # Fallback streaming SSE proxy
│       └── lib.rs                # 21 Tauri command registrations, safe external links & exit cleanup hooks
└── package.json
```

---

## Documentation

- **[System Architecture (ARCHITECTURE.md)](./docs/ARCHITECTURE.md)** *(Chinese)*: Four-layer collaborative architecture, fast/slow dual-channel preview pipeline, Pi Agent Sidecar bidirectional RPC & Diff sequence diagrams, and Tauri IPC command list.
- **[Design Decisions (DESIGN_DECISIONS.md)](./docs/DESIGN_DECISIONS.md)** *(Chinese)*: Key engineering trade-offs (why LLMs don't emit raw OOXML or depend on Python, `Tauri v2` vs `Electron`, pure Rust dependency discipline, and the **Pi Agent Sidecar/RPC backend architecture**).
- **[Style Contract & OOXML Spec (STYLE_AND_OOXML.md)](./docs/STYLE_AND_OOXML.md)** *(Chinese)*: Complete `StyleProfile` and `DocBlock` schemas, TWIPS/pt conversions, CJK typography attributes, and extension guide.

---

## Roadmap

- **Phase 1 (Completed)**: Three-pane Tauri v2 + React desktop workbench, 4 built-in style presets, pure Rust OOXML compiler, external `.docx` preview & reverse style extraction, block-level Diff review, and **Pi Agent Sidecar + bidirectional JSONL RPC backend (43 built-in providers / 9 OAuth subscription logins / shared `~/.pi/agent/auth.json` / Thinking / Steer & FollowUp / auto compaction)**.
- **Phase 2 (Planned)**: Byte-preserving incremental patching for existing `.docx` files, native Word tracked changes (`<w:ins>` / `<w:del>`), local full-text workspace indexing, and bundling a slim Node runtime in desktop installers for zero-dependency distribution.
- **Phase 3 (Planned)**: Multi-step chapter orchestration Agent for long-form proposals & theses, automated chart/diagram rendering and embedding (Mermaid / ECharts), and automatic cross-reference & TOC field updates.
