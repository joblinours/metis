import type Lenis from "lenis";

let current: Lenis | null = null;

export function setLenis(instance: Lenis | null) {
  current = instance;
}

export function scrollToY(y: number, duration = 1.6) {
  if (current) {
    current.scrollTo(y, { duration });
    return;
  }
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
}
