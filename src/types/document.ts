export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

export type DocBlock =
  | { type: "title"; id: string; text: string }
  | { type: "subtitle"; id: string; text: string }
  | { type: "heading"; id: string; level: 1 | 2 | 3 | 4; text: string }
  | {
      type: "paragraph";
      id: string;
      runs: TextRun[];
      indent?: boolean;
      align?: "left" | "center" | "right" | "justify";
    }
  | { type: "list"; id: string; ordered: boolean; items: TextRun[][] }
  | {
      type: "quote";
      id: string;
      title?: string;
      text: string;
      variant?: "note" | "warning" | "tip";
    }
  | { type: "code_block"; id: string; language?: string; code: string }
  | {
      type: "table";
      id: string;
      caption?: string;
      headers: string[];
      rows: string[][];
    }
  | { type: "divider"; id: string; style?: "solid" | "double_red" }
  | { type: "page_break"; id: string };

export interface DocDocument {
  id: string;
  title: string;
  styleProfileId: string;
  blocks: DocBlock[];
  updatedAt: string;
}

export type BlockDiffKind = "unchanged" | "added" | "modified" | "deleted";

export interface BlockDiffEntry {
  key: string;
  kind: BlockDiffKind;
  oldBlock?: DocBlock;
  newBlock?: DocBlock;
}

export interface PendingDiff {
  id: string;
  summary: string;
  baseBlocks: DocBlock[];
  proposedBlocks: DocBlock[];
  entries: BlockDiffEntry[];
}
