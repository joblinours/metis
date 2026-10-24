"use client";

import { Mention, type MentionOptions } from "@tiptap/extension-mention";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import {
  isReferenceType,
  REFERENCE_TYPE_NOUN,
  type ReferenceType,
  type ResolvedReference,
  serializeReference,
} from "@/ai/references";

import { ReferenceChip } from "./reference-chip";

export const REFERENCE_NODE_NAME = "agentReference";

export interface ReferenceNodeAttrs {
  type: ReferenceType;
  id: string;
  label: string;
  detail: string | null;
}

export type AgentReferenceOptions = MentionOptions<ResolvedReference, ReferenceNodeAttrs>;

export function toReferenceAttrs(ref: ResolvedReference): ReferenceNodeAttrs {
  return {
    type: ref.type,
    id: ref.id,
    label: ref.label,
    detail: ref.detail ?? null,
  };
}

function attrsOf(raw: Record<string, unknown>): ReferenceNodeAttrs | null {
  const { type, id, label, detail } = raw;
  if (typeof type !== "string" || !isReferenceType(type)) return null;
  if (typeof id !== "string" || id.length === 0) return null;
  return {
    type,
    id,
    label: typeof label === "string" ? label : REFERENCE_TYPE_NOUN[type],
    detail: typeof detail === "string" ? detail : null,
  };
}

function ReferenceNodeView({ node, selected }: NodeViewProps) {
  const attrs = attrsOf(node.attrs);
  if (!attrs) return <NodeViewWrapper as="span" />;

  return (
    <NodeViewWrapper as="span" className="inline">
      <ReferenceChip
        className={selected ? "ring-2 ring-ring/50" : undefined}
        label={attrs.label}
        title={attrs.detail ?? undefined}
        type={attrs.type}
      />
    </NodeViewWrapper>
  );
}

function dataAttribute(name: string) {
  return {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(`data-reference-${name}`),
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[name];
      return typeof value === "string" ? { [`data-reference-${name}`]: value } : {};
    },
  };
}

export const AgentReferenceNode = Mention.extend<AgentReferenceOptions>({
  name: REFERENCE_NODE_NAME,

  addAttributes() {
    return {
      ...this.parent?.(),
      type: dataAttribute("type"),
      id: dataAttribute("id"),
      label: dataAttribute("label"),
      detail: dataAttribute("detail"),
    };
  },

  renderText({ node }) {
    const attrs = attrsOf(node.attrs);
    return attrs ? serializeReference(attrs) : "";
  },

  renderHTML({ node }) {
    const attrs = attrsOf(node.attrs);
    if (!attrs) return ["span", {}, ""];
    return [
      "span",
      {
        "data-reference-type": attrs.type,
        "data-reference-id": attrs.id,
        "data-reference-label": attrs.label,
      },
      attrs.label,
    ];
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Delete: () =>
        this.editor.commands.command(({ tr, state }) => {
          const { empty, anchor } = state.selection;
          if (!empty) return false;

          let target: { pos: number; size: number } | null = null;
          state.doc.nodesBetween(anchor, anchor + 1, (node, pos) => {
            if (node.type.name !== this.name) return true;
            target = { pos, size: node.nodeSize };
            return false;
          });

          if (!target) return false;
          const { pos, size } = target;
          tr.delete(pos, pos + size);
          return true;
        }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceNodeView);
  },
});
