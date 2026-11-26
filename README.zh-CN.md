# OneDoc

[English](./README.md) | **简体中文**

**面向文档工程的桌面端 Agent Harness（类似文档领域的 Cursor）** —— 将“内容语义”与“Word 版式样式”彻底解耦，让 AI Agent 专注于高纯度内容写作，排版格式由本地 Rust 确定性 OOXML 引擎精准编译。

---

## 核心特性

- **多格式本地工作区**：在同一工作台内无缝浏览、预览与引用 `.onedoc.json`（语义文档）、`.docx`（Word 原生分页渲染）、`.md`（Markdown）与 `.txt` 参考资料。
- **声明式 & 可视化样式契约（Style Profile）**：
  - 内置 4 套行业/国标预置规范：`modern-report`（现代技术/商业报告）、`gov-gbt9704`（党政机关公文 GB/T 9704）、`academic-thesis`（高校学术论文）、`bid-proposal`（招投标书 / 商务方案）。
  - 支持在「样式工作室」逐角色可视化调整页边距、页眉页脚、中西文字体（`w:eastAsia` / `w:ascii`）、中文字号、首行缩进字符数、固定/多倍行距、多级编号规则与三线表/斑马纹/网格表样式，并在画布中 60fps 实时预览。
- **范文 `.docx` 反向提取与导入**：拖入任意外部 Word 范文，自动解析 `w:sectPr` 与 `w:styles.xml` 继承链生成可复用的 `StyleProfile`，或将存量 `.docx` 导入为可编辑语义文档。
- **纯 Rust 确定性 OOXML 编译器**：零 Python 运行时依赖，不依赖外部 Office，毫秒级直出完整合法的 `.docx` 压缩包（含 `styles.xml`、`numbering.xml`、`header1.xml`、`footer1.xml` 与动态页码域）。
- **Pi Agent Sidecar 后端 + 块级 Diff 审核**：基于 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 构建独立 JSONL RPC Sidecar 进程，直接接入 Pi 官方 43 家内置模型服务商与 **9 家 OAuth 订阅账号登录**（Claude Pro/Max、ChatGPT Plus/Pro & Codex、GitHub Copilot、Kimi Code 等，与 `pi` CLI 共享 `~/.pi/agent/auth.json` 并自动刷新 Token），支持 API Key / 本地 Ollama 自定义端点、Thinking 思考流、途中引导纠偏（`steer` / `followUp`）、会话自动压缩以及 `inspect_style_profile` / `replace_document` / `upsert_blocks` 等 9 个结构化工具，修改结果在画布中以红/绿 Diff 审阅。

---

## 技术栈总览

| 层次 | 选型 | 职责说明 |
| :--- | :--- | :--- |
| **桌面外壳** | Tauri v2 | 启动秒开、低内存占用、本地文件与原生对话框访问 |
| **本地引擎** | Rust (`zip`, `quick-xml`, `tokio`, `reqwest`) | 纯 Rust OOXML 编译与解析、工作区扫描、Pi Sidecar 进程监管 |
| **Agent 后端** | Pi Agent (`@earendil-works/pi-agent-core` + `pi-ai` v1.6.0) | 独立 Node.js JSONL RPC Sidecar、43 家内置服务商（9 家 OAuth 订阅登录 + 共享 `~/.pi/agent/auth.json`）、Steer 与上下文压缩 |
| **前端框架** | React 19 + TypeScript + Vite 6 + Tailwind CSS v4 | 三栏响应工作台、样式工作室与块级交互画布 |
| **状态管理** | Zustand v5 | 文档 AST、撤销栈、样式契约、Diff 状态与 Agent 对话流管理 |
| **源码与预览** | CodeMirror 6 + 自研 AST 分页预览 + `docx-preview` | Markdown 源码双向同步、实时 A4 排版预览、外部 `.docx` 原生渲染 |

---

## 快速开始

### 环境要求

- Node.js `>= 20`（当前测试环境：`v24.15.0`）
- Rust 工具链（`rustc` / `cargo`，Windows 需带有 MSVC 与 Windows SDK）
- Windows 系统需具备 WebView2 Runtime（Windows 10/11 通常已内置）

### 安装与启动

```powershell
# 1. 安装前端与 Pi Agent Sidecar 依赖并编译 Sidecar
npm install
npm --prefix agent-sidecar install
npm run build:sidecar

# 2. 启动 Tauri 桌面端开发环境（热重载前端 + 编译 Rust 后端）
npm run tauri dev
```

### 构建与测试

```powershell
# Pi Agent Sidecar 类型检查、构建与 RPC 冒烟测试
npm --prefix agent-sidecar run typecheck
npm run build:sidecar
npm --prefix agent-sidecar test

# 全量构建（Sidecar 编译 + TypeScript 检查 + Vite 前端打包）
npm run typecheck
npm run build

# 运行 Rust 单元测试（涵盖 OOXML 编译、样式提取、Sidecar 路径解析与示例工作区）
cd src-tauri
cargo test

# 编译桌面端可执行文件（调试 / 发布）
cargo build
npm run tauri build
```

> 首次打开应用后，可直接在左侧栏点击 **「一键生成示例工作区」**，系统会在目标目录下生成包含 `.onedoc.json`、GB/T 9704 `.docx` 范文、`.md` 与 `.txt` 的完整体验目录；点击右上角齿轮图标即可在 **「订阅账号登录」**（Claude Pro/Max、ChatGPT Plus/Pro & Codex、GitHub Copilot、Kimi Code、SuperGrok 等 9 家 OAuth 订阅，若本机已登录过 `pi` CLI 会自动继承 `~/.pi/agent/auth.json`）、**「内置 API 服务商」**（43 家服务商目录）或 **「自定义 / Ollama」** 中完成接入配置。

---

## 目录结构

```text
OneDoc/
├── agent-sidecar/
│   ├── src/
│   │   ├── credentialStore.ts    # ~/.pi/agent/auth.json 原子读写与异步互斥锁
│   │   ├── authManager.ts        # 交互式 OAuth 订阅登录、设备码与 Token 刷新状态机
│   │   ├── protocol.ts           # JSONL RPC 指令与事件协议类型
│   │   ├── streamRouter.ts       # Pi 43 服务商目录、多协议路由与连接测试
│   │   ├── sessionStore.ts       # JSONL 会话落盘与自动上下文压缩
│   │   ├── tools.ts              # 9 个文档语义工具与双向宿主回调桥
│   │   └── server.ts             # Pi Agent 实例、事件订阅与 stdin/stdout 循环
│   └── test/rpc-smoke.mjs        # Sidecar JSONL RPC 自动化冒烟测试
├── docs/
│   ├── ARCHITECTURE.md           # 系统分层架构、核心数据流与 IPC 接口文档
│   ├── DESIGN_DECISIONS.md       # 架构决策记录 (ADR-001 ~ ADR-006，含 Pi Agent 落地设计)
│   └── STYLE_AND_OOXML.md        # StyleProfile Schema、AST 规范与 OOXML 映射细节
├── src/
│   ├── components/               # 工作台三栏 UI、预览画布、样式工作室与 Agent 面板
│   ├── lib/                      # Pi RPC 客户端/工具执行、Markdown 编解码、CSS 映射器、Diff 与 IPC 桥
│   ├── presets/                  # 4 套内置场景样式契约与中文字号表
│   ├── store/                    # Zustand 全局状态中心
│   └── types/                    # 文档 AST、样式、工作区与 Agent 类型定义
├── src-tauri/
│   └── src/
│       ├── models.rs             # 与前端对称的 Rust Serde 模型定义
│       ├── docx_compiler.rs      # 纯 Rust OOXML 确定性编译器与单元测试
│       ├── docx_inspector.rs     # .docx 文本提取、AST 导入与样式反向解析
│       ├── workspace.rs          # 工作区扫描、样式持久化与示例目录生成
│       ├── pi_sidecar.rs         # Pi Agent Node.js Sidecar 进程监管与 stdio 路由
│       ├── llm_proxy.rs          # 兼容备用流式 SSE 代理
│       └── lib.rs                # 21 个 Tauri 命令注册、安全外链唤起与退出清理钩子
└── package.json
```

---

## 文档导航

- **[系统架构文档 (ARCHITECTURE.md)](./docs/ARCHITECTURE.md)**：四层协同架构、快慢双通道预览机制、Pi Agent Sidecar 双向 RPC 与 Diff 时序图、Tauri IPC 命令清单。
- **[设计决策记录 (DESIGN_DECISIONS.md)](./docs/DESIGN_DECISIONS.md)**：记录所有核心取舍（为什么不用 LLM 直出 OOXML / Python、`Tauri v2` vs `Electron`、纯 Rust 依赖纪律、以及 **Pi Agent Sidecar/RPC 后端落地架构**）。
- **[样式契约与 OOXML 规范 (STYLE_AND_OOXML.md)](./docs/STYLE_AND_OOXML.md)**：`StyleProfile` 与 `DocBlock` 完整 Schema、TWIPS/磅值换算、中文排版属性与扩展指南。

---

## 演进路线图

- **Phase 1（已完成）**：Tauri v2 + React 桌面端三栏工作台、4 套预置样式、纯 Rust OOXML 编译器、外部 `.docx` 预览与范文样式提取、块级 Diff 审核，以及 **Pi Agent Sidecar + 双向 JSONL RPC 后端（43 家内置服务商 / 9 家 OAuth 订阅账号登录 / 共享 `~/.pi/agent/auth.json` / Thinking / Steer & FollowUp / 自动压缩）**。
- **Phase 2（规划中）**：存量 `.docx` 字节保留式增量 Patch、Word 原生修订红线（`<w:ins>` / `<w:del>`）、工作区本地全文索引，以及桌面安装包内嵌精简 Node 运行时以实现零依赖分发。
- **Phase 3（规划中）**：长篇标书/论文分章节多步编排 Agent、图表自动渲染嵌入（Mermaid/ECharts）、交叉引用与目录域自动更新。
