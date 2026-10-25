"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { exhibit, live, seg } from "../engine";
import { type Fonts, makeCanvasTexture, roundRect } from "../textures";
import { findMesh, findNode, litMap } from "./shared";

const S = 12;
const PW = 1160;
const PH = 800;
const FLIP = Math.PI + (2 * (70 * Math.PI)) / 180 - (6 * Math.PI) / 180;
const DAYS = ["MON 19", "TUE 20", "WED 21", "THU 22", "FRI 23"];
const H0 = 7;
const H1 = 18;

const CAL_EVENTS = [
  { source: "Google Calendar", title: "Design review", day: 0, h: 10.5, len: 1, color: "#3a6fd8" },
  { source: "Outlook", title: "Flight to Delhi", day: 1, h: 7.25, len: 2.2, color: "#0f6cbd" },
  { source: "Zoho Calendar", title: "Payroll run", day: 2, h: 14, len: 1, color: "#c8202f" },
  { source: "CalDAV", title: "Standup", day: 3, h: 9.5, len: 0.5, color: "#5b5f66" },
];

const PRIYA = [
  { day: 0, h: 13, len: 2 },
  { day: 1, h: 9, len: 3 },
  { day: 2, h: 10, len: 1.5 },
  { day: 3, h: 11, len: 2 },
  { day: 4, h: 9, len: 4 },
];

const VISIBLE = [
  { name: "Work", source: "Google Calendar", color: "#3a6fd8" },
  { name: "Team", source: "Outlook", color: "#0f6cbd" },
  { name: "Payroll", source: "Zoho Calendar", color: "#c8202f" },
  { name: "Personal", source: "CalDAV", color: "#5b5f66" },
];

function header(ctx: CanvasRenderingContext2D, f: Fonts, kicker: string, title: string) {
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(0, 0, PW, PH);
  ctx.fillStyle = "#815b17";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillText(kicker, 60, 84);
  ctx.fillStyle = "#2a2620";
  ctx.font = `italic 500 70px ${f.display}`;
  ctx.fillText(title, 56, 156);
}

const GX = 120;
const GY = 210;
const GW = PW - GX - 50;
const GH = 500;
const colW = GW / DAYS.length;
const yOf = (h: number) => GY + ((h - H0) / (H1 - H0)) * GH;

function grid(ctx: CanvasRenderingContext2D, f: Fonts) {
  ctx.font = `500 20px ${f.mono}`;
  ctx.fillStyle = "#9a9484";
  DAYS.forEach((d, i) => ctx.fillText(d, GX + i * colW + 10, GY - 16));
  ctx.strokeStyle = "rgba(42,38,32,0.1)";
  ctx.lineWidth = 2;
  for (let h = H0; h <= H1; h += 2) {
    const y = yOf(h);
    ctx.fillText(`${String(h).padStart(2, "0")}:00`, 40, y + 7);
    ctx.beginPath();
    ctx.moveTo(GX, y);
    ctx.lineTo(GX + GW, y);
    ctx.stroke();
  }
  for (let i = 0; i <= DAYS.length; i++) {
    ctx.beginPath();
    ctx.moveTo(GX + i * colW, GY);
    ctx.lineTo(GX + i * colW, GY + GH);
    ctx.stroke();
  }
}

function block(
  ctx: CanvasRenderingContext2D,
  day: number,
  h: number,
  len: number,
  fill: string,
  inset = 6,
) {
  ctx.fillStyle = fill;
  roundRect(
    ctx,
    GX + day * colW + inset,
    yOf(h) + 3,
    colW - inset * 2,
    yOf(h + len) - yOf(h) - 6,
    10,
  );
  ctx.fill();
}

function drawWeek(ctx: CanvasRenderingContext2D, f: Fonts, pick: number | null) {
  header(ctx, f, "OCTOBER 2026  ·  ALL CALENDARS", "Week 43");
  grid(ctx, f);
  CAL_EVENTS.forEach((e, i) => {
    ctx.globalAlpha = pick === null || pick === i ? 1 : 0.22;
    block(ctx, e.day, e.h, e.len, e.color);
    ctx.fillStyle = "#faf8f3";
    ctx.font = `500 22px ${f.sans}`;
    ctx.fillText(e.title, GX + e.day * colW + 18, yOf(e.h) + 32);
    ctx.globalAlpha = 1;
  });
  let x = GX;
  ctx.font = `500 20px ${f.mono}`;
  CAL_EVENTS.forEach((e, i) => {
    ctx.globalAlpha = pick === null || pick === i ? 1 : 0.35;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(x + 8, PH - 44, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a443a";
    const label = e.source.toUpperCase();
    ctx.fillText(label, x + 24, PH - 37);
    x += ctx.measureText(label).width + 60;
    ctx.globalAlpha = 1;
  });
}

function drawFind(ctx: CanvasRenderingContext2D, f: Fonts) {
  header(ctx, f, "FIND TIME  ·  NEXT WEEK", "45 min with Priya");
  grid(ctx, f);
  for (const e of CAL_EVENTS) block(ctx, e.day, e.h, e.len, "rgba(42,38,32,0.16)");
  for (const b of PRIYA) block(ctx, b.day, b.h, b.len, "rgba(176,125,31,0.16)", 14);
  block(ctx, 3, 15, 0.75, "#b07d1f", 2);
  ctx.fillStyle = "#faf8f3";
  ctx.font = `600 22px ${f.sans}`;
  ctx.fillText("15:00", GX + 3 * colW + 16, yOf(15) + 30);
  ctx.fillStyle = "#2a2620";
  roundRect(ctx, GX + 3 * colW - 40, yOf(16) + 18, 300, 56, 28);
  ctx.fill();
  ctx.fillStyle = "#faf8f3";
  ctx.font = `500 24px ${f.sans}`;
  ctx.fillText("Free for both", GX + 3 * colW - 8, yOf(16) + 54);
}

function drawVisibility(ctx: CanvasRenderingContext2D, f: Fonts, hidden: boolean) {
  header(ctx, f, "WORKSPACE  ·  STUDIO NINE", "Calendars it can see");
  VISIBLE.forEach((c, i) => {
    const y = 250 + i * 120;
    const off = hidden && i === 3;
    ctx.globalAlpha = off ? 0.4 : 1;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(80, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2620";
    ctx.font = `500 40px ${f.sans}`;
    ctx.fillText(c.name, 116, y + 14);
    ctx.fillStyle = "#7a7263";
    ctx.font = `500 22px ${f.mono}`;
    ctx.fillText(c.source.toUpperCase(), 330, y + 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = off ? "#d9d2c2" : "#2a2620";
    roundRect(ctx, PW - 200, y - 26, 104, 52, 26);
    ctx.fill();
    ctx.fillStyle = "#faf8f3";
    ctx.beginPath();
    ctx.arc(off ? PW - 174 : PW - 122, y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(42,38,32,0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, y + 60);
    ctx.lineTo(PW - 60, y + 60);
    ctx.stroke();
  });
  ctx.fillStyle = "#9a9484";
  ctx.font = `400 26px ${f.sans}`;
  ctx.fillText(
    hidden ? "Personal stays out of views, the agent and MCP." : "Every calendar is visible.",
    60,
    PH - 50,
  );
}

function drawMonth(ctx: CanvasRenderingContext2D, f: Fonts) {
  header(ctx, f, "NOVEMBER 2026", "Month ahead");
  ctx.strokeStyle = "rgba(42,38,32,0.12)";
  ctx.lineWidth = 2;
  ctx.font = `500 22px ${f.mono}`;
  ctx.fillStyle = "#9a9484";
  for (let d = 0; d < 35; d++) {
    const x = 60 + (d % 7) * 150;
    const y = 220 + Math.floor(d / 7) * 105;
    ctx.strokeRect(x, y, 150, 105);
    if (d < 30) ctx.fillText(String(d + 1), x + 12, y + 32);
  }
}

function drawNotes(ctx: CanvasRenderingContext2D, f: Fonts) {
  header(ctx, f, "NOTES", "");
  ctx.strokeStyle = "rgba(42,38,32,0.12)";
  ctx.lineWidth = 2;
  for (let y = 220; y < PH - 40; y += 64) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(PW - 60, y);
    ctx.stroke();
  }
}

export function CalendarModel() {
  const { scene } = useGLTF("/models/calendar.glb");

  const pages = useMemo(() => {
    const view = { pick: null as number | null, hidden: false };
    return {
      view,
      week: makeCanvasTexture(PW, PH, (ctx, f) => drawWeek(ctx, f, view.pick)),
      find: makeCanvasTexture(PW, PH, drawFind),
      vis: makeCanvasTexture(PW, PH, (ctx, f) => drawVisibility(ctx, f, view.hidden)),
      month: makeCanvasTexture(PW, PH, drawMonth),
      notes: makeCanvasTexture(PW, PH, drawNotes),
    };
  }, []);

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);
    [pages.week, pages.find, pages.vis, pages.month, pages.notes].forEach((p, i) =>
      litMap(findMesh(model, `face${i}`), p.tex),
    );
    const leaves = [0, 1, 2, 3].map((i) => findNode(model, `leaf${i}`));
    return { root, leaves };
  }, [scene, pages]);

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      for (const p of [pages.week, pages.find, pages.vis, pages.month, pages.notes]) p.paint();
    });
  }, [pages]);

  useFrame((s) => {
    const p = live.ps;
    const { plate, pick } = exhibit.get();
    const want = plate === 1 ? pick : null;
    if (want !== pages.view.pick) {
      pages.view.pick = want;
      pages.week.paint();
    }
    const hidden = p > 2.75;
    if (hidden !== pages.view.hidden) {
      pages.view.hidden = hidden;
      pages.vis.paint();
    }
    const flips = [seg(p, 1.55, 1.95), seg(p, 2.5, 2.9), 0, 0];
    built.leaves.forEach((leaf, i) => {
      if (leaf) leaf.rotation.x = -(flips[i] ?? 0) * FLIP;
    });
    built.root.rotation.y = Math.sin(s.clock.elapsedTime * 0.35) * 0.025;
  });

  return <primitive object={built.root} />;
}
