"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { setLenis } from "@/lib/lenis";

export function SmoothScroll() {
  const lenis = useRef<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("reduced");
      return;
    }
    const instance = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.85,
      touchMultiplier: 1.4,
      autoRaf: true,
      anchors: true,
    });
    lenis.current = instance;
    setLenis(instance);
    return () => {
      instance.destroy();
      lenis.current = null;
      setLenis(null);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    lenis.current?.scrollTo(0, { immediate: true });
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (document.documentElement.classList.contains("reduced")) {
      for (const el of items) el.classList.add("revealed");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("revealed");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    for (const el of items) io.observe(el);
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
