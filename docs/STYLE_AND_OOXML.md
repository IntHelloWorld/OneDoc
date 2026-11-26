# OneDoc 样式契约与 OOXML 编译规范

本文档详细定义 OneDoc 的 `StyleProfile` 数据契约、`DocBlock` 语义 AST 规范、Rust 编译器的 OOXML 映射规则以及 `.docx` 样式反向提取算法。

---

## 1. `DocBlock` 语义 AST 规范

`DocDocument` 是前端画布、Markdown 编解码器、Agent 工具与 Rust 编译器之间共享的唯一语义表示（分别定义于 [document.ts](../src/types/document.ts) 与 [models.rs](../src-tauri/src/models.rs)）：

```json
{
  "id": "doc-id",
  "title": "文档总标题",
  "styleProfileId": "gov-gbt9704",
  "updatedAt": "2026-11-23T12:00:00Z",
  "blocks": []
}
```

支持的 10 种块级节点（`#[serde(tag = "type", rename_all = "snake_case")]`）：

| `type` | 关键字段 | 语义与编译说明 |
| :--- | :--- | :--- |
| `title` | `id`, `text` | 文档主标题，映射到样式 `OneDocTitle` |
| `subtitle` | `id`, `text` | 副标题或密级/副题，映射到样式 `OneDocSubtitle` |
| `heading` | `id`, `level` (`1..4`), `text` | 1~4 级章节标题，映射到 `Heading1`~`Heading4` 并附带 `<w:outlineLvl>` |
| `paragraph` | `id`, `runs: TextRun[]`, `indent?`, `align?` | 富文本段落；`runs` 支持 `bold`、`italic`、`underline`、`code`、`color` |
| `list` | `id`, `ordered: boolean`, `items: TextRun[][]` | 有序（`numId=2`）或无序（`numId=1`）列表，引用 `word/numbering.xml` |
| `quote` | `id`, `title?`, `text`, `variant?` | 提示框/引用块，渲染左侧 3pt 强调边框与背景底色（`OneDocQuote`） |
| `code_block` | `id`, `language?`, `code` | 等宽字体（`Consolas`）灰色边框代码块，保留换行 `<w:br/>` |
| `table` | `id`, `caption?`, `headers: string[]`, `rows: string[][]` | 数据表格，可选上方 `OneDocCaption` 题注，按样式支持三线表/斑马纹/网格 |
| `divider` | `id`, `style?: "solid" \| "double_red"` | 分割线；`double_red` 专用于党政公文红头双线（`thickThinSmallGap` `#CC0000`） |
| `page_break` | `id` | 硬分页符（`<w:br w:type="page"/>`） |

---

## 2. `StyleProfile` 样式契约结构

`StyleProfile`（定义于 [style.ts](../src/types/style.ts) 与 [models.rs](../src-tauri/src/models.rs)）由 6 个核心配置段组成：

1. **`page` (`PageSetup`)**：`size`（`A4` / `B5` / `Letter`）、`widthMm`、`heightMm` 及 `marginTopMm` / `marginBottomMm` / `marginLeftMm` / `marginRightMm`。
2. **`headerFooter` (`HeaderFooterConfig`)**：页眉开关 `showHeader`、`headerText`、`headerBorderBottom`；页脚开关 `showFooter`、`footerText`、`showPageNumber`、`pageNumberFormat`（`plain` / `dash` / `of_total`）及 `pageNumberAlign`（`left` / `center` / `right`）。
3. **`colors` (`ColorPalette`)**：`primary`、`accent`、`text`、`muted`、`border`、`tableHeaderBg`、`tableZebraBg`、`calloutBg`。
4. **`typography` (`TypographySet`)**：包含 11 个独立排版角色：`title`、`subtitle`、`h1`、`h2`、`h3`、`h4`、`body`、`quote`、`caption`、`tableHeader`、`tableCell`。每个角色由 `TextStyleSpec` 描述：
   - 字体：`fontZh`（中文字体）、`fontEn`（西文与数字字体）
   - 字号与修饰：`sizePt`、`bold`、`italic`、`color`、`align`（`left`/`center`/`right`/`justify`）
   - 间距与缩进：`lineSpacingRule`（`multiple` 多倍 / `exact` 固定磅值）、`lineSpacingValue`、`spaceBeforePt`、`spaceAfterPt`、`firstLineIndentChars`
   - 段属性开关：`keepWithNext`、`borderBottom`、`backgroundColor`
5. **`numbering` (`HeadingNumbering`)**：`enabled` 开关与 `h1Pattern` ~ `h4Pattern` 模板串。
   - 中文数字占位符：`{zh1}` ~ `{zh4}`（基于 `to_chinese_numeral`，支持 `一` 到 `九百九十九`）
   - 阿拉伯数字占位符：`{n1}` ~ `{n4}`
6. **`table` (`TableStyleSpec`)**：`style`（`three_line` / `zebra` / `grid`）、`borderColor`、`headerBg`、`headerTextColor`、`zebraBg`、`repeatHeader`（跨页重复表头）、`cellPaddingPt`。

---

## 3. OOXML 编译与中文排版精准映射 (`docx_compiler.rs`)

[docx_compiler.rs](../src-tauri/src/docx_compiler.rs) 打包输出 8 个标准 XML 部件（`[Content_Types].xml`、`_rels/.rels`、`word/_rels/document.xml.rels`、`word/styles.xml`、`word/numbering.xml`、`word/header1.xml`、`word/footer1.xml`、`word/document.xml`）。

### 3.1 物理单位换算

| 源单位 | OOXML 目标属性 | 换算公式 |
| :--- | :--- | :--- |
| 毫米 (`mm`) | `w:pgSz` / `w:pgMar` (TWIPS) | `(mm * 56.6929133858).round()` |
| 磅 (`pt`) | `w:spacing` / `w:ind` / `w:tblCellMar` (TWIPS) | `(pt * 20.0).round()` |
| 磅 (`pt`) | `w:sz` / `w:szCs` (Half-points) | `(pt * 2.0).round()` |
| 磅 (`pt`) | 边框粗细 `w:sz` (1/8 pt) | `(pt * 8.0).round()`（例：1.5pt = `12`，0.5pt = `4`） |
| 字符数 (`chars`) | `w:ind w:firstLineChars` | `(chars * 100.0).round()`（同时输出兼容 `w:firstLine`） |
| 倍数 (`multiple`) | `w:spacing w:line` (`w:lineRule="auto"`) | `(multiple * 240.0).round()` |

### 3.2 中文排版的四大关键细节

1. **中西文字体严格分离**：在 `<w:rFonts>` 同时写入 `w:ascii`、`w:hAnsi`、`w:cs`（指向 `fontEn`）与 `w:eastAsia`（指向 `fontZh`），防止 Word 将英文数字渲染成宋体或将中文退回默认等线。
2. **公文与论文的固定行距**：当 `lineSpacingRule == "exact"` 时，输出 `<w:spacing w:line="{pt*20}" w:lineRule="exact"/>`，确保 GB/T 9704“每页 22 行、固定 28 磅”绝对稳定。
3. **三线表（`three_line`）规范实现**：
   - 表级 `<w:tblBorders>` 仅启用 `top`（`sz="12"`，1.5pt）与 `bottom`（`sz="12"`，1.5pt），隐藏左右外框及内部横竖线；
   - 仅表头行单元格 `<w:tcBorders>` 追加 `bottom`（`sz="6"`，0.75pt）形成标准三线；
   - 所有行强制加注 `<w:cantSplit/>` 防止单行内容被截断到两页，且表头支持 `<w:tblHeader/>` 实现跨页自动重复。
4. **动态页码域（Word Field Codes）**：`word/footer1.xml` 通过标准 `begin` → `instrText(" PAGE ")` → `separate` → 占位符 → `end` 结构写入真域代码，支持纯页码、公文一字线（`— PAGE —`）及 `PAGE / NUMPAGES`。

---

## 4. 四套内置预置样式规格对比 (`stylePresets.ts`)

| 样式 ID | 名称 | 页边距 (上/下/左/右 mm) | 正文字体与字号 | 行距与首行缩进 | 编号与表格 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `modern-report` | 现代技术/商业报告 | `25.4 / 25.4 / 28 / 28` | 微软雅黑 + Calibri · 10.5pt | 1.5 倍 · 0 字符 | `1.1.1` · 斑马纹表 |
| `gov-gbt9704` | 党政机关公文 (GB/T 9704) | `37 / 35 / 28 / 26` | 仿宋_GB2312 + Times New Roman · 16pt (三号) | 固定 28pt · 2 字符 | `一、/（一）/1.` · 网格表 |
| `academic-thesis` | 高校学术论文模板 | `25 / 25 / 30 / 25` | 宋体 + Times New Roman · 12pt (小四) | 固定 20pt · 2 字符 | `1 / 1.1 / 1.1.1` · 标准三线表 |
| `bid-proposal` | 招投标书 / 商务方案 | `25.4 / 25.4 / 25.4 / 25.4` | 宋体 + Calibri · 11pt | 1.5 倍 · 2 字符 | `第一章 / 1.1` · 商务网格表 |

---

## 5. `.docx` 范文样式反向提取原理 (`docx_inspector.rs`)

当用户导入外部 `.docx` 模板执行 `extract_docx_style_profile` 时，后端执行以下解析流程：

1. **提取版心尺寸**：扫描 `word/document.xml` 中的 `<w:pgSz>` 与 `<w:pgMar>`，将 TWIPS 反向换算为精确到 `0.1mm` 的纸张与四边页边距。
2. **解析样式表与继承链**：解析 `word/styles.xml` 中的 `<w:docDefaults>` 与各段落 `<w:style>`（匹配 `Normal`/`正文`、`Title`/`OneDocTitle`、`Subtitle`、`Heading1`~`Heading4` 或中文样式名 `标题 1`~`标题 4`）。
3. **沿着 `w:basedOn` 向上追溯（最多 5 层）**：按 `DocDefaults -> Base -> Child` 的顺序由粗到细覆盖合并字体（`w:eastAsia` / `w:ascii`）、字号、粗斜体、颜色、对齐、段间距、行距与首行缩进，输出新的自定义 `StyleProfile` 与人类可读的提取报告摘要。

---

## 6. 扩展开发指南

### 新增预置样式
1. 在 [stylePresets.ts](../src/presets/stylePresets.ts) 的 `BUILTIN_STYLE_PRESETS` 数组中追加新的 `StyleProfile` 对象（可使用现有 `makeSpec` 辅助函数）。
2. 如需被示例工作区脚手架或 Rust 单元测试直接引用，可在 [workspace.rs](../src-tauri/src/workspace.rs) 同步配置。

### 新增 `DocBlock` 语义块类型
若要新增诸如 `footnote` 或 `image` 等语义块，需同步更新以下 4 个位置以保证前后端全链路对齐：
1. 类型定义：[models.rs](../src-tauri/src/models.rs) 与 [document.ts](../src/types/document.ts)。
2. 编解码与预览：[markdownCodec.ts](../src/lib/markdownCodec.ts) 与 [PagedPreview.tsx](../src/components/PagedPreview.tsx)。
3. OOXML 编译与导入：[docx_compiler.rs](../src-tauri/src/docx_compiler.rs) 与 [docx_inspector.rs](../src-tauri/src/docx_inspector.rs)。
4. Agent 工具 Schema 与归一化：[agentEngine.ts](../src/lib/agentEngine.ts) 中的 `normalizeBlock`、`summarizeBlock` 与 System Prompt 速查表。
