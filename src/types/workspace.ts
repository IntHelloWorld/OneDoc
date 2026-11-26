import type { DocDocument } from "./document";

export type FileKind = "onedoc" | "docx" | "md" | "txt" | "dir";

export interface FileTreeNode {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  kind: FileKind | string;
  size?: number;
  children?: FileTreeNode[];
}

export interface WorkspaceFileContent {
  path: string;
  name: string;
  kind: FileKind | string;
  content: string;
  document?: DocDocument;
}

export type ViewMode = "preview" | "split" | "source";
