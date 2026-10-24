"use client";

import { cn } from "@metis/ui/lib/utils";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import { isRecord } from "@/lib/guards";
import { parseSearch } from "@/search/query";
import { matchingParen, searchTokens } from "@/search/tokens";

export type SearchKey = "up" | "down" | "enter" | "mod-enter" | "tab" | "escape" | "right";

export interface SearchInputHandle {
  focus: () => void;
  replace: (start: number, end: number, text: string) => void;
  setText: (text: string, select?: boolean) => void;
}

interface Props {
  value: string;
  timeZone: string;
  placeholder: string;
  label: string;
  className?: string;
  onChange: (text: string, caret: number) => void;
  onCaret: (caret: number) => void;
  onKey: (key: SearchKey) => boolean;
}

const highlightKey = new PluginKey<DecorationSet>("search-highlight");

function decorate(
  doc: Parameters<typeof DecorationSet.create>[0],
  previous: DecorationSet,
  timeZone: string,
): DecorationSet {
  const text = doc.textContent;
  const parsed = parseSearch(text, timeZone);
  const at = (offset: number) => Math.min(offset + 1, doc.content.size - 1);
  if (parsed.ok) {
    const decorations = searchTokens(parsed.ast).map((token) =>
      Decoration.inline(
        at(token.start),
        at(token.end),
        { class: `sq-${token.kind}` },
        { kind: token.kind },
      ),
    );
    for (const issue of parsed.diagnostics) {
      if (issue.end <= issue.start) continue;
      decorations.push(
        Decoration.inline(
          at(issue.start),
          at(issue.end),
          { class: "sq-invalid", title: issue.message },
          { kind: "invalid" },
        ),
      );
    }
    return DecorationSet.create(doc, decorations);
  }
  const kept = previous.find().filter((d) => !(isRecord(d.spec) && d.spec.kind === "invalid"));
  if (parsed.offset !== null && parsed.offset < text.length) {
    const message = parsed.diagnostics[0]?.message ?? "";
    kept.push(
      Decoration.inline(
        at(parsed.offset),
        at(text.length),
        { class: "sq-invalid", title: message },
        { kind: "invalid" },
      ),
    );
  }
  return DecorationSet.create(doc, kept);
}

function highlighter(timeZone: string) {
  return Extension.create({
    name: "searchHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: highlightKey,
          state: {
            init: (_, state) => decorate(state.doc, DecorationSet.empty, timeZone),
            apply: (tr, previous) =>
              tr.docChanged
                ? decorate(tr.doc, previous.map(tr.mapping, tr.doc), timeZone)
                : previous,
          },
          props: {
            decorations(state) {
              const base = highlightKey.getState(state) ?? DecorationSet.empty;
              const text = state.doc.textContent;
              const caret = state.selection.from - 1;
              const marks: Decoration[] = [];
              for (const at of [caret - 1, caret]) {
                const match = matchingParen(text, at);
                if (match === null) continue;
                marks.push(
                  Decoration.inline(at + 1, at + 2, {
                    class: "sq-paren-match",
                  }),
                  Decoration.inline(match + 1, match + 2, {
                    class: "sq-paren-match",
                  }),
                );
                break;
              }
              return marks.length
                ? DecorationSet.create(state.doc, [...base.find(), ...marks])
                : base;
            },
          },
        }),
      ];
    },
  });
}

export const SearchInput = forwardRef<SearchInputHandle, Props>(function SearchInput(
  { value, timeZone, placeholder, label, className, onChange, onCaret, onKey },
  ref,
) {
  const keys = useRef(onKey);
  useEffect(() => {
    keys.current = onKey;
  });

  const shortcuts = useMemo(
    () =>
      Extension.create({
        name: "searchKeys",
        addKeyboardShortcuts() {
          return {
            ArrowUp: () => keys.current("up"),
            ArrowDown: () => keys.current("down"),
            Enter: () => {
              keys.current("enter");
              return true;
            },
            "Mod-Enter": () => {
              keys.current("mod-enter");
              return true;
            },
            "Shift-Enter": () => true,
            Home: ({ editor }) => editor.commands.setTextSelection(1),
            End: ({ editor }) =>
              editor.commands.setTextSelection(editor.state.doc.content.size - 1),
            "Shift-Home": ({ editor }) =>
              editor.commands.setTextSelection({
                from: 1,
                to: editor.state.selection.to,
              }),
            "Shift-End": ({ editor }) =>
              editor.commands.setTextSelection({
                from: editor.state.selection.from,
                to: editor.state.doc.content.size - 1,
              }),
            Tab: () => keys.current("tab"),
            Escape: () => keys.current("escape"),
            ArrowRight: ({ editor }) =>
              editor.state.selection.empty &&
              editor.state.selection.from === editor.state.doc.content.size - 1
                ? keys.current("right")
                : false,
          };
        },
      }),
    [],
  );

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder }),
      shortcuts,
      highlighter(timeZone),
    ],
    [placeholder, shortcuts, timeZone],
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    autofocus: "end",
    content: value ? { type: "doc", content: [paragraph(value)] } : "",
    editorProps: {
      attributes: {
        role: "searchbox",
        "aria-label": label,
        "aria-multiline": "false",
        spellcheck: "false",
        autocapitalize: "off",
        class: "w-full py-2.5 text-[15px] leading-6 focus:outline-none",
      },
      transformPastedText: (text) => text.replace(/\s*\r?\n\s*/g, " "),
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.state.doc.textContent, instance.state.selection.from - 1);
    },
    onSelectionUpdate: ({ editor: instance }) => {
      onCaret(instance.state.selection.from - 1);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.state.doc.textContent === value) return;
    editor.commands.setContent(value ? { type: "doc", content: [paragraph(value)] } : "", {
      emitUpdate: false,
    });
    editor.commands.focus("end");
  }, [editor, value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus("end"),
      replace: (start, end, text) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContentAt({ from: start + 1, to: end + 1 }, text)
          .run();
      },
      setText: (text, select) => {
        if (!editor) return;
        editor.commands.setContent(text ? { type: "doc", content: [paragraph(text)] } : "");
        if (select && text) {
          editor.commands.setTextSelection({ from: 1, to: text.length + 1 });
          editor.commands.focus();
        } else {
          editor.commands.focus("end");
        }
      },
    }),
    [editor],
  );

  return (
    <div className={cn("search-query min-w-0 flex-1", className)}>
      <EditorContent editor={editor} />
    </div>
  );
});

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
