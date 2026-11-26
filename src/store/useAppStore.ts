import { create } from "zustand";
import { BUILTIN_STYLE_PRESETS, cloneStyleProfile } from "../presets/stylePresets";
import { astToMarkdown, markdownToAst } from "../lib/markdownCodec";
import { createPendingDiff, resolveDiffEntry } from "../lib/docDiff";
import {
  createSampleWorkspace,
  exportDocx,
  extractDocxStyleProfile,
  importDocxToAst,
  isTauriRuntime,
  loadWorkspaceStyles,
  pickDocxFile,
  pickSaveDocxPath,
  pickWorkspaceFolder,
  readWorkspaceFile,
  saveWorkspaceStyle,
  scanWorkspace,
  writeTextFile,
} from "../lib/tauriBridge";
import type {
  AgentMessage,
  AttachedContextFile,
  AuthUiState,
  PiSidecarStatus,
  ProviderCatalogItem,
  ProviderConfig,
} from "../types/agent";
import type { DocBlock, DocDocument, PendingDiff } from "../types/document";
import type { StyleProfile } from "../types/style";
import type { FileKind, FileTreeNode, ViewMode } from "../types/workspace";

const STORAGE_PROVIDER_KEY = "onedoc.providerConfig.v1";
const STORAGE_CUSTOM_STYLES_KEY = "onedoc.customStyles.v1";
const STORAGE_WORKSPACE_KEY = "onedoc.lastWorkspace.v1";

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  mode: "builtin",
  id: "anthropic",
  name: "Anthropic",
  api: "anthropic-messages",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  model: "claude-sonnet-4-5",
  temperature: 0.4,
  thinkingLevel: "off",
};

function loadProviderConfig(): ProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_PROVIDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
      const inferredMode =
        parsed.mode ?? (parsed.apiKey || parsed.baseUrl ? "custom" : "builtin");
      return {
        ...DEFAULT_PROVIDER_CONFIG,
        ...parsed,
        mode: inferredMode,
      };
    }
  } catch {
    // ignore storage parse failure
  }
  return DEFAULT_PROVIDER_CONFIG;
}

function loadLocalCustomStyles(): StyleProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_STYLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function createWelcomeDocument(): DocDocument {
  return {
    id: "welcome-doc",
    title: "OneDoc 智能文档工程平台方案",
    styleProfileId: "modern-report",
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        type: "title",
        id: "w-title",
        text: "智能文档工程与合规交付平台方案",
      },
      {
        type: "subtitle",
        id: "w-sub",
        text: "内容语义与版式样式彻底解耦 · 一键生成零格式偏差的 Word (.docx) 文档",
      },
      {
        type: "heading",
        id: "w-h1",
        level: 1,
        text: "建设背景与核心设计",
      },
      {
        type: "paragraph",
        id: "w-p1",
        runs: [
          { text: "传统通用 AI Agent 在撰写正式 Word 文档时，常因大模型直接操作复杂的 OOXML 或临时拼装脚本而导致" },
          { text: "字体混排失真、多级编号错乱、表格边框丢失与版心参数漂移", bold: true },
          { text: "。OneDoc 采用“语义 AST + 确定性样式契约”双层架构，让 AI 专注内容逻辑，排版规则由本地 Rust 引擎毫秒级精准编译。" },
        ],
      },
      {
        type: "quote",
        id: "w-q1",
        title: "快速体验提示",
        text: "尝试点击顶部栏的【样式方案】下拉框，在「现代报告」「党政机关公文 GB/T 9704」「高校学术论文」「招投标书」之间即时切换，观察页面边距、中文字体、行距、红头双线与三线表的瞬时联动变化。",
        variant: "note",
      },
      {
        type: "heading",
        id: "w-h2",
        level: 1,
        text: "核心能力与场景矩阵",
      },
      {
        type: "heading",
        id: "w-h2-1",
        level: 2,
        text: "四大典型文档场景对比",
      },
      {
        type: "table",
        id: "w-tbl1",
        caption: "表1 OneDoc 样式契约覆盖场景与排版规范",
        headers: ["文档类型", "默认版心与字体规范", "表格与编号体系", "适用场景"],
        rows: [
          ["现代技术报告", "微软雅黑 + Calibri · 1.5倍行距", "斑马纹表 · 1.1.1 阿拉伯编号", "架构方案、周报、产品白皮书"],
          ["党政机关公文", "三号仿宋_GB2312 · 28磅固定行距", "标准网格表 · 一、/（一）/1.", "通知、请示、纪要、红头文件"],
          ["高校学术论文", "宋体 + Times New Roman · 首行2字符", "标准三线表 · 学术分级编号", "毕业论文、期刊投稿、综述"],
          ["招投标书方案", "商务深蓝视觉 · 跨页重复表头", "商务网格表 · 第X章结构", "政企投标文件、技术标书"],
        ],
      },
      {
        type: "heading",
        id: "w-h3",
        level: 2,
        text: "工作区与范文提取流",
      },
      {
        type: "list",
        id: "w-list1",
        ordered: true,
        items: [
          [
            { text: "左侧打开本地工作区（或点击" },
            { text: "创建示例工作区", bold: true },
            { text: "），混合预览 " },
            { text: ".docx / .md / .txt / .onedoc.json", code: true },
            { text: " 文件；" },
          ],
          [
            { text: "在【样式工作室】导入任意外部 " },
            { text: ".docx", code: true },
            { text: " 范文，自动提取页边距、标题字体与行距参数；" },
          ],
          [
            { text: "点击画布中的任意段落，即可通过右侧 Agent 局部改写并逐块审核 Diff，确认后一键导出标准 " },
            { text: ".docx", code: true },
            { text: "。" },
          ],
        ],
      },
    ],
  };
}

export interface ToastNotice {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

interface AppState {
  workspacePath: string | null;
  fileTree: FileTreeNode[];
  activeFilePath: string | null;
  activeFileName: string;
  activeFileKind: FileKind | "welcome";
  document: DocDocument;
  rawText: string;
  isDirty: boolean;
  viewMode: ViewMode;
  zoom: number;

  activeStyleId: string;
  customStyles: StyleProfile[];
  pendingDiff: PendingDiff | null;
  undoStack: DocDocument[];
  selectedBlockIds: string[];

  attachedFiles: AttachedContextFile[];
  messages: AgentMessage[];
  isAgentRunning: boolean;
  activeRequestId: string | null;
  providerConfig: ProviderConfig;
  piSidecarStatus: PiSidecarStatus;
  queuedSteerCount: number;
  providerCatalog: ProviderCatalogItem[];
  authFilePath: string;
  authFlow: AuthUiState | null;

  styleStudioOpen: boolean;
  settingsOpen: boolean;
  toast: ToastNotice | null;

  showToast: (type: ToastNotice["type"], text: string) => void;
  clearToast: () => void;

  getAllStyles: () => StyleProfile[];
  getActiveStyle: () => StyleProfile;

  setViewMode: (mode: ViewMode) => void;
  setZoom: (zoom: number) => void;
  setStyleStudioOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setProviderConfig: (cfg: ProviderConfig) => void;

  setActiveStyleId: (styleId: string) => void;
  saveStyleProfile: (profile: StyleProfile) => Promise<void>;
  deleteCustomStyle: (styleId: string) => void;
  extractStyleFromDocxDialog: (explicitPath?: string) => Promise<StyleProfile | null>;

  toggleBlockSelection: (blockId: string, multi?: boolean) => void;
  clearSelection: () => void;
  updateDocument: (doc: DocDocument, pushUndo?: boolean) => void;
  updateRawText: (text: string) => void;
  undo: () => void;

  applyAgentProposal: (summary: string, proposedBlocks: DocBlock[], newTitle?: string) => void;
  acceptDiffEntry: (key: string) => void;
  rejectDiffEntry: (key: string) => void;
  acceptAllDiffs: () => void;
  rejectAllDiffs: () => void;

  openWorkspaceDialog: () => Promise<void>;
  loadWorkspace: (path: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  createDemoWorkspace: () => Promise<void>;
  openFileNode: (node: FileTreeNode) => Promise<void>;
  createNewDocumentFile: (name: string, kind: "onedoc" | "md" | "txt") => Promise<void>;
  importDocxAsActiveDocument: (docxPath: string) => Promise<void>;
  saveActiveFile: () => Promise<void>;
  exportActiveDocx: (explicitPath?: string) => Promise<string | null>;

  attachContextFile: (file: AttachedContextFile) => void;
  detachContextFile: (path: string) => void;
  addMessage: (msg: AgentMessage) => void;
  updateMessage: (id: string, patch: Partial<AgentMessage>) => void;
  clearMessages: () => void;
  setAgentRunning: (running: boolean, requestId?: string | null) => void;
  setPiSidecarStatus: (status: PiSidecarStatus) => void;
  setQueuedSteerCount: (count: number) => void;
  setProviderCatalog: (catalog: ProviderCatalogItem[], authFilePath: string) => void;
  setAuthFlow: (flow: AuthUiState | null | ((prev: AuthUiState | null) => AuthUiState | null)) => void;
}

const initialDoc = createWelcomeDocument();
const initialRaw = astToMarkdown(initialDoc);

export const useAppStore = create<AppState>((set, get) => ({
  workspacePath: (() => {
    try {
      return localStorage.getItem(STORAGE_WORKSPACE_KEY);
    } catch {
      return null;
    }
  })(),
  fileTree: [],
  activeFilePath: null,
  activeFileName: "示例文档 · 智能平台方案.onedoc.json",
  activeFileKind: "welcome",
  document: initialDoc,
  rawText: initialRaw,
  isDirty: false,
  viewMode: "preview",
  zoom: 0.92,

  activeStyleId: initialDoc.styleProfileId,
  customStyles: loadLocalCustomStyles(),
  pendingDiff: null,
  undoStack: [],
  selectedBlockIds: [],

  attachedFiles: [],
  messages: [],
  isAgentRunning: false,
  activeRequestId: null,
  providerConfig: loadProviderConfig(),
  piSidecarStatus: { running: false, entryPath: null, lastError: null },
  queuedSteerCount: 0,
  providerCatalog: [],
  authFilePath: "",
  authFlow: null,

  styleStudioOpen: false,
  settingsOpen: false,
  toast: null,

  showToast: (type, text) => {
    const id = Date.now();
    set({ toast: { id, type, text } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 4200);
  },

  clearToast: () => set({ toast: null }),

  getAllStyles: () => [...BUILTIN_STYLE_PRESETS, ...get().customStyles],

  getActiveStyle: () => {
    const all = get().getAllStyles();
    return (
      all.find((s) => s.id === get().activeStyleId) ??
      all.find((s) => s.id === get().document.styleProfileId) ??
      BUILTIN_STYLE_PRESETS[0]
    );
  },

  setViewMode: (viewMode) => set({ viewMode }),
  setZoom: (zoom) => set({ zoom: Math.max(0.55, Math.min(1.6, zoom)) }),
  setStyleStudioOpen: (styleStudioOpen) => set({ styleStudioOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  setProviderConfig: (cfg) => {
    try {
      localStorage.setItem(STORAGE_PROVIDER_KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
    set({ providerConfig: cfg });
  },

  setActiveStyleId: (styleId) => {
    const cur = get().document;
    set({
      activeStyleId: styleId,
      document: { ...cur, styleProfileId: styleId, updatedAt: new Date().toISOString() },
      isDirty: get().activeFileKind === "onedoc" ? true : get().isDirty,
    });
  },

  saveStyleProfile: async (profile) => {
    const existing = get().customStyles;
    const isBuiltin = BUILTIN_STYLE_PRESETS.some((b) => b.id === profile.id);
    const savedProfile = isBuiltin
      ? {
          ...cloneStyleProfile(profile),
          id: `custom-${Date.now().toString(36)}`,
          name: `${profile.name} (自定义)`,
          category: "custom",
        }
      : cloneStyleProfile(profile);

    const next = existing.some((s) => s.id === savedProfile.id)
      ? existing.map((s) => (s.id === savedProfile.id ? savedProfile : s))
      : [...existing, savedProfile];

    try {
      localStorage.setItem(STORAGE_CUSTOM_STYLES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }

    const ws = get().workspacePath;
    if (ws && isTauriRuntime()) {
      try {
        await saveWorkspaceStyle(ws, savedProfile);
      } catch (e) {
        get().showToast("error", `写入工作区样式文件失败: ${String(e)}`);
      }
    }

    set({
      customStyles: next,
      activeStyleId: savedProfile.id,
      document: {
        ...get().document,
        styleProfileId: savedProfile.id,
        updatedAt: new Date().toISOString(),
      },
    });
    get().showToast("success", `已保存样式模板「${savedProfile.name}」`);
  },

  deleteCustomStyle: (styleId) => {
    const next = get().customStyles.filter((s) => s.id !== styleId);
    try {
      localStorage.setItem(STORAGE_CUSTOM_STYLES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    const nextActive =
      get().activeStyleId === styleId ? BUILTIN_STYLE_PRESETS[0].id : get().activeStyleId;
    set({ customStyles: next, activeStyleId: nextActive });
  },

  extractStyleFromDocxDialog: async (explicitPath) => {
    if (!isTauriRuntime()) {
      get().showToast("info", "请在 Tauri 桌面端中使用 .docx 范文样式提取");
      return null;
    }
    const filePath = explicitPath ?? (await pickDocxFile());
    if (!filePath) return null;
    try {
      const base = cloneStyleProfile(get().getActiveStyle());
      const res = await extractDocxStyleProfile(filePath, base);
      await get().saveStyleProfile(res.profile);
      get().showToast(
        "success",
        `已从范文提取样式：${res.summary.slice(0, 2).join("；")}`
      );
      return res.profile;
    } catch (e) {
      get().showToast("error", `提取样式失败: ${String(e)}`);
      return null;
    }
  },

  toggleBlockSelection: (blockId, multi = false) => {
    const prev = get().selectedBlockIds;
    if (multi) {
      const exists = prev.includes(blockId);
      set({
        selectedBlockIds: exists
          ? prev.filter((id) => id !== blockId)
          : [...prev, blockId],
      });
    } else {
      set({
        selectedBlockIds:
          prev.length === 1 && prev[0] === blockId ? [] : [blockId],
      });
    }
  },

  clearSelection: () => set({ selectedBlockIds: [] }),

  updateDocument: (nextDoc, pushUndo = true) => {
    const prev = get().document;
    const undoStack = pushUndo
      ? [...get().undoStack.slice(-19), prev]
      : get().undoStack;
    const nextRaw =
      get().activeFileKind === "txt" ? get().rawText : astToMarkdown(nextDoc);
    set({
      document: { ...nextDoc, updatedAt: new Date().toISOString() },
      rawText: nextRaw,
      undoStack,
      isDirty: get().activeFilePath !== null,
    });
  },

  updateRawText: (text) => {
    const kind = get().activeFileKind;
    const curDoc = get().document;
    if (kind === "txt") {
      const lines = text.replace(/\r\n/g, "\n").split("\n");
      const blocks: DocBlock[] = lines
        .filter((l) => l.trim().length > 0)
        .map((l, idx) => ({
          type: "paragraph",
          id: `txt-${idx}`,
          runs: [{ text: l }],
          indent: false,
        }));
      set({
        rawText: text,
        document: { ...curDoc, blocks, updatedAt: new Date().toISOString() },
        isDirty: get().activeFilePath !== null,
      });
      return;
    }

    const parsed = markdownToAst(
      text,
      curDoc.title,
      get().activeStyleId,
      curDoc.id
    );
    set({
      rawText: text,
      document: parsed,
      isDirty: get().activeFilePath !== null,
    });
  },

  undo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    set({
      document: prev,
      rawText: astToMarkdown(prev),
      undoStack: stack.slice(0, -1),
      pendingDiff: null,
    });
  },

  applyAgentProposal: (summary, proposedBlocks, newTitle) => {
    const cur = get().document;
    const nextTitle = newTitle?.trim() || cur.title;

    // If current document is virtually empty, apply directly and record undo
    if (cur.blocks.length === 0) {
      get().updateDocument(
        {
          ...cur,
          title: nextTitle,
          blocks: proposedBlocks,
        },
        true
      );
      return;
    }

    const diff = createPendingDiff(summary, cur.blocks, proposedBlocks);
    set({
      pendingDiff: diff,
      document: newTitle ? { ...cur, title: nextTitle } : cur,
      viewMode: get().viewMode === "source" ? "preview" : get().viewMode,
    });
  },

  acceptDiffEntry: (key) => {
    const diff = get().pendingDiff;
    if (!diff) return;
    const { nextBase, remaining } = resolveDiffEntry(diff, key, true);
    const cur = get().document;
    const nextDoc: DocDocument = {
      ...cur,
      blocks: nextBase,
      updatedAt: new Date().toISOString(),
    };
    set({
      undoStack: [...get().undoStack.slice(-19), cur],
      document: nextDoc,
      rawText: astToMarkdown(nextDoc),
      pendingDiff: remaining,
      isDirty: get().activeFilePath !== null,
    });
  },

  rejectDiffEntry: (key) => {
    const diff = get().pendingDiff;
    if (!diff) return;
    const { nextBase, remaining } = resolveDiffEntry(diff, key, false);
    const cur = get().document;
    const nextDoc: DocDocument = {
      ...cur,
      blocks: nextBase,
      updatedAt: new Date().toISOString(),
    };
    set({
      document: nextDoc,
      rawText: astToMarkdown(nextDoc),
      pendingDiff: remaining,
    });
  },

  acceptAllDiffs: () => {
    const diff = get().pendingDiff;
    if (!diff) return;
    const cur = get().document;
    const nextDoc: DocDocument = {
      ...cur,
      blocks: diff.proposedBlocks,
      updatedAt: new Date().toISOString(),
    };
    set({
      undoStack: [...get().undoStack.slice(-19), cur],
      document: nextDoc,
      rawText: astToMarkdown(nextDoc),
      pendingDiff: null,
      isDirty: get().activeFilePath !== null,
    });
    get().showToast("success", "已应用全部 AI 修改建议");
  },

  rejectAllDiffs: () => {
    set({ pendingDiff: null });
    get().showToast("info", "已拒绝本次 AI 修改");
  },

  openWorkspaceDialog: async () => {
    if (!isTauriRuntime()) {
      get().showToast("info", "请在 Tauri 桌面端打开本地文件夹");
      return;
    }
    const dir = await pickWorkspaceFolder();
    if (dir) {
      await get().loadWorkspace(dir);
    }
  },

  loadWorkspace: async (path) => {
    if (!isTauriRuntime()) return;
    try {
      const tree = await scanWorkspace(path);
      let wsStyles: StyleProfile[] = [];
      try {
        wsStyles = await loadWorkspaceStyles(path);
      } catch {
        wsStyles = [];
      }

      // Merge workspace styles with localStorage custom styles
      const merged = [...get().customStyles];
      for (const s of wsStyles) {
        if (!merged.some((m) => m.id === s.id)) {
          merged.push(s);
        }
      }

      try {
        localStorage.setItem(STORAGE_WORKSPACE_KEY, path);
        localStorage.setItem(STORAGE_CUSTOM_STYLES_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }

      set({
        workspacePath: path,
        fileTree: tree,
        customStyles: merged,
      });
    } catch (e) {
      get().showToast("error", `打开工作区失败: ${String(e)}`);
    }
  },

  refreshFileTree: async () => {
    const ws = get().workspacePath;
    if (!ws || !isTauriRuntime()) return;
    try {
      const tree = await scanWorkspace(ws);
      set({ fileTree: tree });
    } catch {
      // ignore
    }
  },

  createDemoWorkspace: async () => {
    if (!isTauriRuntime()) {
      get().showToast("info", "请在 Tauri 桌面端中生成本地示例工作区");
      return;
    }
    const dir = await pickWorkspaceFolder();
    if (!dir) return;
    try {
      const target = dir.endsWith("OneDoc_Demo")
        ? dir
        : `${dir.replace(/[\\/]+$/, "")}\\OneDoc_Demo`;
      await createSampleWorkspace(target);
      await get().loadWorkspace(target);
      const firstNode = get().fileTree.find((n) => n.kind === "onedoc");
      if (firstNode) {
        await get().openFileNode(firstNode);
      }
      get().showToast("success", "已创建示例工作区并生成示例 .docx 与文档");
    } catch (e) {
      get().showToast("error", `创建示例工作区失败: ${String(e)}`);
    }
  },

  openFileNode: async (node) => {
    if (node.isDir || !isTauriRuntime()) return;
    try {
      const res = await readWorkspaceFile(node.path);
      if (res.kind === "docx") {
        set({
          activeFilePath: res.path,
          activeFileName: res.name,
          activeFileKind: "docx",
          pendingDiff: null,
          selectedBlockIds: [],
          isDirty: false,
        });
        return;
      }

      if (res.kind === "onedoc" && res.document) {
        const doc = res.document;
        const allStyles = get().getAllStyles();
        const styleId = allStyles.some((s) => s.id === doc.styleProfileId)
          ? doc.styleProfileId
          : get().activeStyleId;
        set({
          activeFilePath: res.path,
          activeFileName: res.name,
          activeFileKind: "onedoc",
          document: doc,
          rawText: astToMarkdown(doc),
          activeStyleId: styleId,
          pendingDiff: null,
          selectedBlockIds: [],
          isDirty: false,
        });
        return;
      }

      if (res.kind === "txt") {
        const lines = res.content.replace(/\r\n/g, "\n").split("\n");
        const doc: DocDocument = {
          id: `txt-${Date.now()}`,
          title: res.name.replace(/\.txt$/i, ""),
          styleProfileId: get().activeStyleId,
          updatedAt: new Date().toISOString(),
          blocks: lines
            .filter((l) => l.trim().length > 0)
            .map((l, idx) => ({
              type: "paragraph",
              id: `txt-${idx}`,
              runs: [{ text: l }],
              indent: false,
            })),
        };
        set({
          activeFilePath: res.path,
          activeFileName: res.name,
          activeFileKind: "txt",
          document: doc,
          rawText: res.content,
          pendingDiff: null,
          selectedBlockIds: [],
          isDirty: false,
        });
        return;
      }

      // Markdown
      const doc = markdownToAst(
        res.content,
        res.name.replace(/\.(md|markdown)$/i, ""),
        get().activeStyleId
      );
      set({
        activeFilePath: res.path,
        activeFileName: res.name,
        activeFileKind: "md",
        document: doc,
        rawText: res.content,
        pendingDiff: null,
        selectedBlockIds: [],
        isDirty: false,
      });
    } catch (e) {
      get().showToast("error", `读取文件失败: ${String(e)}`);
    }
  },

  createNewDocumentFile: async (rawName, kind) => {
    const cleanBase = rawName.trim().replace(/[\\/:*?"<>|]/g, "_") || "新文档";
    const ext =
      kind === "onedoc"
        ? ".onedoc.json"
        : kind === "md"
        ? ".md"
        : ".txt";
    const fileName = cleanBase.endsWith(ext) ? cleanBase : `${cleanBase}${ext}`;
    const styleId = get().activeStyleId;

    const newDoc: DocDocument = {
      id: `doc-${Date.now().toString(36)}`,
      title: cleanBase.replace(/\.(onedoc\.json|md|txt)$/i, ""),
      styleProfileId: styleId,
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          type: "title",
          id: "b-title",
          text: cleanBase.replace(/\.(onedoc\.json|md|txt)$/i, ""),
        },
        {
          type: "heading",
          id: "b-h1",
          level: 1,
          text: "引言",
        },
        {
          type: "paragraph",
          id: "b-p1",
          runs: [{ text: "在此开始撰写正文内容，或使用右侧 AI Agent 快速生成大纲与全文。" }],
        },
      ],
    };

    const raw =
      kind === "onedoc"
        ? JSON.stringify(newDoc, null, 2)
        : kind === "md"
        ? astToMarkdown(newDoc)
        : `${newDoc.title}\n\n在此开始撰写纯文本内容。\n`;

    const ws = get().workspacePath;
    if (ws && isTauriRuntime()) {
      const fullPath = `${ws.replace(/[\\/]+$/, "")}\\${fileName}`;
      try {
        await writeTextFile(fullPath, raw);
        await get().refreshFileTree();
        set({
          activeFilePath: fullPath,
          activeFileName: fileName,
          activeFileKind: kind,
          document: newDoc,
          rawText: kind === "onedoc" ? astToMarkdown(newDoc) : raw,
          pendingDiff: null,
          isDirty: false,
        });
        get().showToast("success", `已创建文件 ${fileName}`);
      } catch (e) {
        get().showToast("error", `创建文件失败: ${String(e)}`);
      }
    } else {
      set({
        activeFilePath: null,
        activeFileName: fileName,
        activeFileKind: kind,
        document: newDoc,
        rawText: kind === "onedoc" ? astToMarkdown(newDoc) : raw,
        pendingDiff: null,
        isDirty: false,
      });
    }
  },

  importDocxAsActiveDocument: async (docxPath) => {
    if (!isTauriRuntime()) return;
    try {
      const imported = await importDocxToAst(docxPath, get().activeStyleId);
      const md = astToMarkdown(imported);
      const ws = get().workspacePath;
      const baseName =
        docxPath.split(/[\\/]/).pop()?.replace(/\.docx$/i, "") ?? "导入文档";

      if (ws) {
        const target = `${ws.replace(/[\\/]+$/, "")}\\${baseName}_导入.onedoc.json`;
        await writeTextFile(target, JSON.stringify(imported, null, 2));
        await get().refreshFileTree();
        set({
          activeFilePath: target,
          activeFileName: `${baseName}_导入.onedoc.json`,
          activeFileKind: "onedoc",
          document: imported,
          rawText: md,
          pendingDiff: null,
          isDirty: false,
        });
        get().showToast("success", `已将 .docx 语义导入为 ${baseName}_导入.onedoc.json`);
      } else {
        set({
          activeFilePath: null,
          activeFileName: `${baseName}_导入.onedoc.json`,
          activeFileKind: "welcome",
          document: imported,
          rawText: md,
          pendingDiff: null,
          isDirty: false,
        });
        get().showToast("success", "已将该 .docx 内容导入当前编辑画布");
      }
    } catch (e) {
      get().showToast("error", `导入 .docx 失败: ${String(e)}`);
    }
  },

  saveActiveFile: async () => {
    const { activeFilePath, activeFileKind, document, rawText } = get();
    if (!activeFilePath || !isTauriRuntime()) {
      await get().exportActiveDocx();
      return;
    }
    try {
      const payload =
        activeFileKind === "onedoc"
          ? JSON.stringify(document, null, 2)
          : rawText;
      await writeTextFile(activeFilePath, payload);
      set({ isDirty: false });
      get().showToast("success", `已保存 ${get().activeFileName}`);
    } catch (e) {
      get().showToast("error", `保存失败: ${String(e)}`);
    }
  },

  exportActiveDocx: async (explicitPath) => {
    if (!isTauriRuntime()) {
      get().showToast("info", "请在 Tauri 桌面端中执行原生 .docx 编译导出");
      return null;
    }
    const { document, workspacePath } = get();
    const style = get().getActiveStyle();

    let outputPath: string | null = null;
    if (explicitPath) {
      const isAbs = /^[a-zA-Z]:[\\/]|^\\\\|^\//.test(explicitPath);
      outputPath =
        !isAbs && workspacePath
          ? `${workspacePath.replace(/[\\/]+$/, "")}\\${explicitPath.replace(/^[\\/]+/, "")}`
          : explicitPath;
    } else {
      const defaultPath = workspacePath
        ? `${workspacePath.replace(/[\\/]+$/, "")}\\${document.title || "OneDoc导出"}.docx`
        : `${document.title || "OneDoc导出"}.docx`;
      outputPath = await pickSaveDocxPath(defaultPath);
    }

    if (!outputPath) return null;
    try {
      const written = await exportDocx(document, style, outputPath);
      await get().refreshFileTree();
      get().showToast("success", `已编译导出规范 Word 文档：${written}`);
      return written;
    } catch (e) {
      get().showToast("error", `导出 .docx 失败: ${String(e)}`);
      return null;
    }
  },

  attachContextFile: (file) => {
    const exists = get().attachedFiles.some((f) => f.path === file.path);
    if (!exists) {
      set({ attachedFiles: [...get().attachedFiles, file] });
    }
  },

  detachContextFile: (path) => {
    set({
      attachedFiles: get().attachedFiles.filter((f) => f.path !== path),
    });
  },

  addMessage: (msg) => set({ messages: [...get().messages, msg] }),

  updateMessage: (id, patch) =>
    set({
      messages: get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }),

  clearMessages: () => set({ messages: [] }),

  setAgentRunning: (isAgentRunning, requestId = null) =>
    set({ isAgentRunning, activeRequestId: requestId }),

  setPiSidecarStatus: (piSidecarStatus) => set({ piSidecarStatus }),

  setQueuedSteerCount: (queuedSteerCount) => set({ queuedSteerCount }),

  setProviderCatalog: (providerCatalog, authFilePath) =>
    set({ providerCatalog, authFilePath }),

  setAuthFlow: (updater) =>
    set((state) => ({
      authFlow: typeof updater === "function" ? updater(state.authFlow) : updater,
    })),
}));
