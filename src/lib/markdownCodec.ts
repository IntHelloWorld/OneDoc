import type { DocBlock, DocDocument, TextRun } from "../types/document";

function uid(prefix = "b"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseInlineRuns(input: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIdx) {
      runs.push({ text: input.slice(lastIdx, match.index) });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      runs.push({ text: token.slice(1, -1), italic: true });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      runs.push({ text: token.slice(1, -1), code: true });
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < input.length) {
    runs.push({ text: input.slice(lastIdx) });
  }
  return runs.length > 0 ? runs : [{ text: input }];
}

export function runsToMarkdown(runs: TextRun[]): string {
  return runs
    .map((r) => {
      let t = r.text;
      if (r.code) return `\`${t}\``;
      if (r.bold && r.italic) return `***${t}***`;
      if (r.bold) return `**${t}**`;
      if (r.italic) return `*${t}*`;
      return t;
    })
    .join("");
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function markdownToAst(
  markdown: string,
  fallbackTitle = "未命名文档",
  styleProfileId = "modern-report",
  existingId?: string
): DocDocument {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let i = 0;
  let foundTitle = false;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed === "<!-- pagebreak -->" || trimmed === "\\pagebreak") {
      blocks.push({ type: "page_break", id: uid("pb") });
      i++;
      continue;
    }

    if (trimmed === "===") {
      blocks.push({ type: "divider", id: uid("div"), style: "double_red" });
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: "divider", id: uid("div"), style: "solid" });
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      blocks.push({
        type: "code_block",
        id: uid("code"),
        language: lang,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Headings (# .. #####)
    const headingMatch = trimmed.match(/^(#{1,5})\s+(.*)$/);
    if (headingMatch) {
      const hashes = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (hashes === 1 && !foundTitle) {
        foundTitle = true;
        blocks.push({ type: "title", id: uid("title"), text });
      } else {
        const level = Math.min(4, Math.max(1, foundTitle ? hashes - 1 : hashes)) as
          | 1
          | 2
          | 3
          | 4;
        blocks.push({ type: "heading", id: uid("h"), level, text });
      }
      i++;
      continue;
    }

    // Blockquote / Callout
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      let title: string | undefined;
      let bodyText = quoteLines.join("\n");
      const calloutMatch = quoteLines[0]?.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*(.*)$/i);
      if (calloutMatch) {
        title = calloutMatch[2]?.trim() || calloutMatch[1].toUpperCase();
        bodyText = quoteLines.slice(1).join("\n").trim();
      }
      blocks.push({
        type: "quote",
        id: uid("q"),
        title,
        text: bodyText,
        variant: "note",
      });
      continue;
    }

    // Table
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(raw);
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().includes("|") &&
        lines[i].trim().length > 0
      ) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({
        type: "table",
        id: uid("tbl"),
        headers,
        rows,
      });
      continue;
    }

    // Ordered or unordered list
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      const ordered = Boolean(olMatch);
      const items: TextRun[][] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        const m = ordered ? l.match(/^\d+\.\s+(.*)$/) : l.match(/^[-*+]\s+(.*)$/);
        if (!m) break;
        items.push(parseInlineRuns(m[1]));
        i++;
      }
      blocks.push({ type: "list", id: uid("list"), ordered, items });
      continue;
    }

    // Regular paragraph (accumulate consecutive non-blank non-block lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (
        !t ||
        t.startsWith("#") ||
        t.startsWith(">") ||
        t.startsWith("```") ||
        /^[-*_]{3,}$/.test(t) ||
        t === "===" ||
        t === "<!-- pagebreak -->" ||
        /^[-*+]\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        (t.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(t);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        id: uid("p"),
        runs: parseInlineRuns(paraLines.join(" ")),
      });
    }
  }

  const docTitle =
    blocks.find((b) => b.type === "title")?.text ?? fallbackTitle;

  return {
    id: existingId ?? uid("doc"),
    title: docTitle,
    styleProfileId,
    blocks,
    updatedAt: new Date().toISOString(),
  };
}

export function astToMarkdown(doc: DocDocument): string {
  const chunks: string[] = [];
  for (const b of doc.blocks) {
    switch (b.type) {
      case "title":
        chunks.push(`# ${b.text}`);
        break;
      case "subtitle":
        chunks.push(`> [!NOTE] 副标题\n> ${b.text}`);
        break;
      case "heading":
        chunks.push(`${"#".repeat(Math.min(5, b.level + 1))} ${b.text}`);
        break;
      case "paragraph":
        chunks.push(runsToMarkdown(b.runs));
        break;
      case "list":
        chunks.push(
          b.items
            .map((runs, idx) =>
              b.ordered
                ? `${idx + 1}. ${runsToMarkdown(runs)}`
                : `- ${runsToMarkdown(runs)}`
            )
            .join("\n")
        );
        break;
      case "quote": {
        const lines: string[] = [];
        if (b.title) lines.push(`> [!NOTE] ${b.title}`);
        for (const l of b.text.split("\n")) {
          lines.push(`> ${l}`);
        }
        chunks.push(lines.join("\n"));
        break;
      }
      case "code_block":
        chunks.push(`\`\`\`${b.language ?? ""}\n${b.code}\n\`\`\``);
        break;
      case "table": {
        const header = `| ${b.headers.join(" | ")} |`;
        const sep = `| ${b.headers.map(() => "---").join(" | ")} |`;
        const rows = b.rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
        const prefix = b.caption ? `**${b.caption}**\n\n` : "";
        chunks.push(`${prefix}${header}\n${sep}${rows ? `\n${rows}` : ""}`);
        break;
      }
      case "divider":
        chunks.push(b.style === "double_red" ? "===" : "---");
        break;
      case "page_break":
        chunks.push("<!-- pagebreak -->");
        break;
    }
  }
  return chunks.join("\n\n");
}
