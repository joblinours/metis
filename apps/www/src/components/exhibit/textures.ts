"use client";

import * as THREE from "three";

export type Fonts = { sans: string; display: string; mono: string };

export function fonts(): Fonts {
  if (typeof document === "undefined")
    return { sans: "sans-serif", display: "serif", mono: "monospace" };
  const root = getComputedStyle(document.documentElement);
  const pick = (v: string, fb: string) => root.getPropertyValue(v).trim() || fb;
  return {
    sans: pick("--font-dm-sans", "sans-serif"),
    display: pick("--font-cormorant", "serif"),
    mono: pick("--font-dm-mono", "monospace"),
  };
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, f: Fonts) => void,
  gltf = true,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.flipY = !gltf;
  const paint = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    draw(ctx, fonts());
    tex.needsUpdate = true;
  };
  paint();
  return { tex, paint };
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}
