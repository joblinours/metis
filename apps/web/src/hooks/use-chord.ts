"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHORD_WINDOW_MS = 1500;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

export interface ChordBinding {
  label: string;
  run: () => void;
}

export type ChordBindings = Record<string, ChordBinding>;

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function hasModifier(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey;
}

export function useChord({ prefix, bindings }: { prefix: string; bindings: ChordBindings }) {
  const [armed, setArmed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const armedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setArmed(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(() => {
    armedRef.current = true;
    setArmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(disarm, CHORD_WINDOW_MS);
  }, [disarm]);

  useEffect(() => disarm, [disarm]);

  useEffect(() => {
    function consume(e: KeyboardEvent) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || hasModifier(e)) return;
      if (MODIFIER_KEYS.has(e.key)) return;

      if (e.key === "?") {
        consume(e);
        disarm();
        setHelpOpen((open) => !open);
        return;
      }

      if (!armedRef.current) {
        if (e.key === prefix) {
          consume(e);
          arm();
        }
        return;
      }

      consume(e);
      disarm();
      bindings[e.key]?.run();
    }

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [prefix, bindings, arm, disarm]);

  return { armed, helpOpen, setHelpOpen };
}
