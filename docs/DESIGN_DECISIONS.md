# OneDoc 架构与设计决策记录 (ADR)

本文档记录 OneDoc 在架构选型、性能权衡、跨平台构建约束以及 Agent 后端演进路线上的关键技术决策。

---

## ADR-001：采用“语义 AST + 确定性样式编译器”替代 LLM 直出 OOXML / Python 脚本

### 背景
常见 AI 写 Word 方案通常有两条路径：
1. 让大模型直接生成或修改 `.docx` 内部的 OOXML 片段；
2. 让模型临时编写 `python-docx` 脚本再执行生成。

在实际办公场景（尤其是中文公文 GB/T 9704、高校论文与招投标书）中，这两种方式均存在结构性缺陷：OOXML 依赖 `styles.xml`、`numbering.xml`、关系 ID（`rId`）之间的强一致性，模型手写极易破坏文件结构；而每次现场写脚本生成会导致同一批文档的字体、行距、缩进与表格风格反复漂移，且必须在桌面端打包完整的 Python 运行时。

### 决策
- 引入 **语义文档模型（`DocDocument` / `DocBlock`）** 作为 Agent、UI 预览与文件持久化的唯一中间表示。
- 引入 **声明式样式契约（`StyleProfile`）** 独立描述版心、字体、行距、缩进、编号模式与表格规范。
- 由纯 Rust 编译器 [docx_compiler.rs](../src-tauri/src/docx_compiler.rs) 确定性地将 `DocDocument + StyleProfile` 渲染为 `.docx`。

### 权衡与后果
- **优点**：排版质量 100% 确定且可复现；Agent 不必在提示词中浪费 Token 计算磅值/TWIPS；同一份文稿可 1 秒内切换成报告、公文、论文或标书样式。
- **局限**：Phase 1 聚焦“结构化生成 + 新编导出”，对于外部已包含复杂 SmartArt、VBA 宏或悬浮图形的存量 `.docx`，直接导入 AST 会简化为受支持的语义块集合（存量无损增量 Patch 规划在 Phase 2）。

---

## ADR-002：桌面端选型 Tauri v2 (Rust)，并严守“纯 Rust 零 C/C++ 编译依赖”纪律

### 背景
OneDoc 明确追求“秒开启动、低内存驻留、毫秒级大文档编译”。同时，当前 Windows 构建宿主机环境存在特定约束：**仅安装了 VC 14.0（VS 2015）工具链与 Windows Kits 8.1/10.0.10240**，缺少现代 VS 2022/CMake C++ 编译环境。

### 决策
1. **选择 Tauri v2 而非 Electron**：复用系统原生 WebView2（Windows 148.x Chromium 内核）/ WKWebView，避免每次捆绑 120MB+ Chromium 与 V8 实例，空闲内存保持在 30–50MB 级别。
2. **Rust 后端严禁引入需编译 C/C++/CMake 的 Crate**：
   - 不使用 `rusqlite`、`ring`、`aws-lc-rs`、`openssl-sys` 等依赖原生 C 构建的库。
   - 统一采用纯 Rust 生态：`zip`（`default-features = false, features = ["deflate"]`）、`quick-xml`、`walkdir`、`tokio`、`reqwest`（`default-features = false, features = ["json", "stream", "native-tls"]`，直接调用 Windows 原生 `schannel`）。

### 权衡与后果
- **优点**：打包体积精简（约 10–20MB 量级，调试版 [onedoc.exe](../src-tauri/target/debug/onedoc.exe) 约 18MB），在老旧/精简 MSVC 宿主机上也可一次链接通过；`zip + quick-xml` 编译百页 `.docx` 仅需数十毫秒。
- **代价**：若未来需要本地全文检索引擎（Phase 2），应选用纯 Rust 存储方案（如 `tantivy` 或纯 Rust 内存倒排索引）而非绑定 C 库的 `rusqlite` FTS5。

---

## ADR-003：快慢双通道预览架构（自研 AST-to-CSS + `docx-preview`）

### 背景
重度浏览器端 Office 套件（如 ONLYOFFICE、SuperDoc）或从零手写 Canvas 排版引擎（如 `canvas-editor`）存在两个问题：前者引入数十兆甚至上百兆重资源且受 AGPLv3 协议制约；后者需要重新实现中西文断行、字形度量与复杂表格边框塌陷，在 AI 流式打字或连续调节样式滑块时容易产生重排卡顿。

### 决策
采用 **快慢双通道分离**：
- **快通道（编辑与 AI 流式输出）**：[PagedPreview.tsx](../src/components/PagedPreview.tsx) + [styleCssMapper.ts](../src/lib/styleCssMapper.ts) 直接把 `DocBlock[] + StyleProfile` 映射为真实毫米比例（`210mm × 297mm` 等）的轻量 DOM 纸张视图。调节字号/行距或切换样式时零磁盘 IO、60fps 即时响应；源码视图采用虚拟滚动的 CodeMirror 6（[CodeEditor.tsx](../src/components/CodeEditor.tsx)）。
- **慢通道（终稿导出与外部 `.docx` 查看）**：导出时异步交由 Rust 生成标准 OOXML；浏览工作区内第三方原生 `.docx` 文件时，通过 [DocxPreviewPane.tsx](../src/components/DocxPreviewPane.tsx) 调用 `docx-preview` 直接还原原文档页面。

### 权衡与后果
- **优点**：开发迭代极快、无传染性开源协议风险、编辑态流畅度极高。
- **局限**：快通道预览采用浏览器 CSS 盒子模型近似分页（单张弹性纸张预览，仅在显式插入 `page_break` 块时标识分页线），精确自动跨页断行与页眉页脚真实分页仍以导出的 `.docx`（在 Word/WPS 或 `docx-preview` 中打开）为准。

---

## ADR-004：前后端同构的确定性多级标题编号

### 背景
Microsoft Word 的 `w:numbering` 自动多级列表 XML 结构极为脆弱，一旦在不同机器的 Word / WPS 之间打开，或与中文“一、 / （一） / 第X章”混用时，极易出现编号丢失、缩进错位或编号重启异常。

### 决策
- 在 `StyleProfile.numbering` 中显式声明四级编号模板（支持 `{zh1}` 中文数字与 `{n1}` 阿拉伯数字占位符）。
- 前端 [styleCssMapper.ts](../src/lib/styleCssMapper.ts) 与后端 [docx_compiler.rs](../src-tauri/src/docx_compiler.rs) 实现**完全一致的计数状态机与防重复前缀守卫**（若标题文本已带相同前缀则不再重复拼接），在编译阶段将真实编号文字写入标题段落，同时保留 `<w:outlineLvl>` 以确保 Word 导航窗格与自动目录（TOC）完全可用。
- 在 System Prompt（[agentEngine.ts](../src/lib/agentEngine.ts)）中明确要求 Agent 在 `heading.text` 中仅输出纯标题文字。

### 权衡与后果
- **优点**：OneDoc 预览与 Word / WPS 打开的标题编号 100% 一致，彻底消除中式公文/标书编号错乱；切换样式模板时，所有标题瞬间在“1.1 / 一、（一） / 第一章”之间无损重构。
- **局限**：如果用户导出后在 Word 内手动拖拽章节顺序，需在 Word 中手动调整文本编号（或重新导回 OneDoc 编译）。

---

## ADR-005：块级 Diff 审阅队列与本地工作区安全边界

### 决策
1. **块级 Diff 审阅（[docDiff.ts](../src/lib/docDiff.ts)）**：Agent 调用 `replace_document` 或 `upsert_blocks` 修改非空文档时，不直接覆盖用户当前正文，而是生成 `PendingDiff` 队列并在 `PagedPreview` 中渲染红删绿增对比块，用户可逐块 `接受/拒绝` 或一键批量应用。
2. **工作区安全沙箱（[workspace.rs](../src-tauri/src/workspace.rs)）**：`delete_workspace_file` 在执行删除前强制对 `workspace_root` 与 `file_path` 调用 `fs::canonicalize`，确认目标路径前缀严格位于工作区内，防止路径穿越误删系统文件。
3. **LLM 密钥与流式取消（[llm_proxy.rs](../src-tauri/src/llm_proxy.rs)）**：桌面端所有模型请求默认通过 Rust 原生代理发出（绕开浏览器 CORS 限制），并通过 `StreamRegistry` 维护 `oneshot::Sender` 实现毫秒级中断生成。

---

## ADR-006：Agent 后端选型与 Pi Agent Sidecar 落地架构（已实施：方案 A）

### 演进背景
在原型初期，OneDoc 曾采用前端 `agentEngine.ts` + Rust `llm_proxy.rs` 的轻量直连方案，仅支持 OpenAI 兼容协议且缺乏长文档会话压缩与途中纠偏机制。

### 关键兼容性约束：为什么不直接在 WebView 中打包 `pi-coding-agent`？
经核验 npm 包依赖树，`pi-ai` 底层重度依赖 Node 生态的 HTTP 与云 SDK（如 `undici`、`http-proxy-agent`、`@aws-sdk/client-bedrock-runtime` 等），而 `pi-coding-agent` 还捆绑了面向编程终端的 `pi-tui`、`quickjs-wasi`、`@silvia-odwyer/photon-node` 等本地重依赖。因此：
1. 不能将 `pi-ai` 全量打入 Vite WebView 前端包；
2. 对于专注文档编辑的 OneDoc 而言，也无需把编程终端的 Bash/TUI 工具引入桌面应用，直接基于核心层组合最为精简。

### 最终决策：基于 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` 的独立 Sidecar + 双向 JSONL RPC + 原生 OAuth 订阅凭据体系
OneDoc 最终采纳 **方案 A（Tauri Sidecar + JSON-Line RPC）**，并原生接入 `@earendil-works/pi-ai@1.6.0` 的 `builtinModels` 目录与 `CredentialStore` 订阅登录体系，工程结构如下：
- **独立的 Pi Sidecar 服务（[agent-sidecar/](../agent-sidecar/)）**：
  - [credentialStore.ts](../agent-sidecar/src/credentialStore.ts) 实现 Pi 的 `CredentialStore` 接口，将 OAuth Token、Refresh Token 与 API Key 原子持久化到 `$PI_CODING_AGENT_DIR/auth.json`（默认 `~/.pi/agent/auth.json`，Windows 下为 `%USERPROFILE%\.pi\agent\auth.json`），使用按服务商粒度串行化的异步互斥锁与临时文件原子替换（temp-rename），天然与原生 `pi` CLI 共享订阅登录态。
  - [authManager.ts](../agent-sidecar/src/authManager.ts) 驱动 `models.login(providerId, authType, interaction, { agentName: "OneDoc" })`，将 OAuth 授权链接（`auth_url`）、设备码（`device_code`）、进度事件以及 `select` / `manual_code` / `text` / `secret` 等交互式提问映射为 JSONL RPC 事件，并竞态监听 `prompt.signal`（当本地 localhost 回调先行完成时自动向前端发出 `auth_prompt_cancelled` 退出手动输入等待）。
  - [streamRouter.ts](../agent-sidecar/src/streamRouter.ts) 基于 `builtinModels({ credentials: credentialStore })` 挂载全部 **43 家内置服务商**（含 **9 家 OAuth 订阅登录**：`anthropic` / Claude Pro/Max、`openai` / ChatGPT 订阅、`openai-codex` / ChatGPT Plus/Pro、`github-copilot`、`kimi-coding`、`xai` / SuperGrok/X、`openrouter`、`meta`、`radius`，以及 `deepseek`、`google`、`qwen-token-plan-cn` 等 34 家 API Key / Coding Token Plan 服务商），并通过 `syncCustomProvider()` 将用户自定义接口与本地 Ollama 隔离在 `"custom-endpoint"`；调用 `piModels.streamSimple()` 时对内置服务商刻意**不传入**覆盖性的 `options.apiKey`（`Agent` 构造也不传 `getApiKey`），确保 `pi-ai` 内部的 `applyAuth()` 能正确使用并自动续期 OAuth 凭据。
  - [server.ts](../agent-sidecar/src/server.ts) 基于 `@earendil-works/pi-agent-core@1.6.0` 的 `Agent` 状态机，接入 `steer()`、`followUp()`、`abort()` 与 `transformContext` 自动上下文压缩。
  - [tools.ts](../agent-sidecar/src/tools.ts) 注册 9 个文档语义工具，通过 `HostToolBridge` 发出 `tool_call_request` 并等待宿主返回 `tool_call_result`，从而无需把 Zustand 状态树和 Rust OOXML 编译器复制到 Node 进程中。
  - [sessionStore.ts](../agent-sidecar/src/sessionStore.ts) 将多轮记录以 JSONL 追加落盘至 `<workspace>/.onedoc/sessions/`。
- **Rust 进程监管与安全外链唤起（[pi_sidecar.rs](../src-tauri/src/pi_sidecar.rs) / [lib.rs](../src-tauri/src/lib.rs)）**：在 Windows 下以 `CREATE_NO_WINDOW` 静默拉起 `node agent-sidecar/dist/server.js`，负责 `stdin/stdout` JSONL 双向转发与退出零残留清理；同时通过 `open_external_url`（仅放行 `http://` / `https://` 并经环境变量传参给隐藏 PowerShell `Start-Process`）安全唤起系统浏览器完成 OAuth 授权，避免 `&` / `=` 等查询参数引发命令行注入或截断。
- **前端配置兼容与自动继承（[useAppStore.ts](../src/store/useAppStore.ts) / [agentEngine.ts](../src/lib/agentEngine.ts)）**：桌面端优先根据 `providers_catalog` 与 `mode: "builtin" | "custom"` 路由；当本地尚无旧版配置而 `~/.pi/agent/auth.json` 已存在已登录订阅服务商时，OneDoc 会在启动收到服务商目录后自动继承选用该服务商，无需重复登录；纯浏览器预览模式下保留 `fetch` SSE 回退路径以便离线 UI 调试。

### 权衡与后续演进
- **收益**：用户可直接复用 Claude Pro/Max、ChatGPT Plus/Pro & Codex、GitHub Copilot、Kimi Code 等既有订阅额度，或零配置共享本机 `pi` CLI 的登录凭据，同时完整保有 Thinking 推理流展示、途中 `steer()` 引导纠偏、长文档上下文压缩、JSONL 会话持久化与本地 Rust OOXML 编译确定性。
- **代价与 Phase 2 优化**：开发/运行期当前依赖宿主环境中的 `node` 命令；Phase 2 可进一步通过 Node SEA / pkg / 内嵌精简版 Node 二进制将其打包为 Tauri 外部二进制 Sidecar，彻底消除用户机器的 Node 安装门槛。
