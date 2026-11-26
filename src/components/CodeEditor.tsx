import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

interface CodeEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  onSave?: () => void;
  isMarkdown?: boolean;
}

const quietPrecisionHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#3730A3", fontWeight: "600" },
  { tag: tags.heading1, color: "#312E81", fontWeight: "700" },
  { tag: tags.heading2, color: "#3730A3", fontWeight: "600" },
  { tag: tags.heading3, color: "#4338CA", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600", color: "#18181B" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#3F3F46" },
  { tag: tags.strikethrough, color: "#71717A", textDecoration: "line-through" },
  { tag: tags.quote, color: "#52525B", fontStyle: "italic" },
  {
    tag: tags.monospace,
    color: "#4338CA",
    backgroundColor: "#F4F4F5",
    borderRadius: "4px",
  },
  {
    tag: [tags.link, tags.url],
    color: "#4F46E5",
    textDecoration: "underline",
  },
  { tag: tags.list, color: "#6366F1" },
  { tag: [tags.processingInstruction, tags.meta, tags.punctuation], color: "#A1A1AA" },
  { tag: tags.contentSeparator, color: "#D4D4D8" },
]);

export function CodeEditor({
  value,
  onChange,
  onSave,
  isMarkdown = true,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const debounceTimer = useRef<number | null>(null);
  const isInternalUpdate = useRef(false);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      EditorView.lineWrapping,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        {
          key: "Mod-s",
          run: () => {
            onSaveRef.current?.();
            return true;
          },
        },
      ]),
      syntaxHighlighting(quietPrecisionHighlight),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "13.5px",
          backgroundColor: "#FFFFFF",
          color: "#18181B",
        },
        "&.cm-focused": {
          outline: "none",
        },
        ".cm-scroller": {
          fontFamily:
            '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "PingFang SC", "Microsoft YaHei UI", monospace',
          lineHeight: "1.75",
          padding: "16px 0",
        },
        ".cm-content": {
          padding: "0 24px 48px 16px",
          caretColor: "#4F46E5",
        },
        ".cm-gutters": {
          backgroundColor: "#FAFAFB",
          color: "#A1A1AA",
          borderRight: "1px solid rgba(228, 228, 231, 0.75)",
          fontSize: "12px",
          fontVariantNumeric: "tabular-nums",
          paddingLeft: "6px",
          paddingRight: "6px",
        },
        ".cm-lineNumbers .cm-gutterElement": {
          minWidth: "34px",
          padding: "0 8px 0 6px",
        },
        ".cm-activeLine": {
          backgroundColor: "rgba(244, 244, 245, 0.65)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "rgba(244, 244, 245, 0.85)",
          color: "#52525B",
          fontWeight: "500",
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
          {
            backgroundColor: "rgba(99, 102, 241, 0.14)",
          },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "#4F46E5",
          borderLeftWidth: "1.5px",
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const text = update.state.doc.toString();
          isInternalUpdate.current = true;
          if (debounceTimer.current) {
            window.clearTimeout(debounceTimer.current);
          }
          debounceTimer.current = window.setTimeout(() => {
            onChangeRef.current(text);
          }, 120);
        }
      }),
    ];

    if (isMarkdown) {
      extensions.push(markdown());
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: el,
    });

    viewRef.current = view;

    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [isMarkdown]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      const cur = view.state.doc.toString();
      if (cur === value) return;
    }
    const cur = view.state.doc.toString();
    if (cur !== value) {
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-white select-text"
    />
  );
}
