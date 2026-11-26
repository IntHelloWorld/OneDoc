import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
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

const cleanLightHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "#1E3A8A", fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700", color: "#0F172A" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#334155" },
  { tag: tags.quote, color: "#475569", fontStyle: "italic" },
  { tag: tags.monospace, color: "#0F766E", backgroundColor: "#F1F5F9" },
  { tag: tags.link, color: "#2563EB", textDecoration: "underline" },
  { tag: tags.list, color: "#2563EB" },
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
      syntaxHighlighting(cleanLightHighlight),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "13.5px",
          backgroundColor: "#FFFFFF",
        },
        ".cm-scroller": {
          fontFamily: '"JetBrains Mono", "Cascadia Code", "Microsoft YaHei UI", monospace',
          lineHeight: "1.65",
          padding: "14px 8px",
        },
        ".cm-gutters": {
          backgroundColor: "#F8FAFC",
          color: "#94A3B8",
          borderRight: "1px solid #E2E8F0",
        },
        ".cm-activeLine": {
          backgroundColor: "#F8FAFC",
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
