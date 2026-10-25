"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { damp, exhibit, lerp, live, seg } from "../engine";
import { type Fonts, makeCanvasTexture, roundRect, wrapText } from "../textures";
import { findMesh, findNode, ownMaterial, setMap, useImages } from "./shared";

const S = 8;
const W = 0.229;
const H = 0.162;
const LH = 0.148;
const PAPER = "#efe7d4";

export type Sender = {
  logo: string;
  from: string;
  org: string;
  subject: string;
  tint: string;
};

export const SENDERS: Sender[] = [
  {
    logo: "/nodes/gmail.svg",
    from: "Meera Iyer",
    org: "Harbour Legal",
    subject: "Renewal: final redlines",
    tint: "#c5221f",
  },
  {
    logo: "/nodes/outlook.svg",
    from: "IndiGo",
    org: "Bookings",
    subject: "BLR to DEL, confirmed",
    tint: "#0f6cbd",
  },
  {
    logo: "/nodes/zoho-mail.svg",
    from: "Northwind Billing",
    org: "Accounts",
    subject: "Invoice INV-2291",
    tint: "#c8202f",
  },
  {
    logo: "/nodes/imap.svg",
    from: "Kabir Shah",
    org: "Studio Nine",
    subject: "Standup moved to 10:30",
    tint: "#5b5f66",
  },
];

export const MAIL_LABELS = [
  { name: "Action required", color: "#d1453b" },
  { name: "Work", color: "#3a6fd8" },
  { name: "Transactions", color: "#2f8a57" },
  { name: "Newsletter", color: "#8a857a" },
];

export function drawAddress(ctx: CanvasRenderingContext2D, f: Fonts, s: Sender) {
  const w = 1040;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, 500);
  ctx.fillStyle = "#7a7263";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillText(`FROM  ${s.from.toUpperCase()}, ${s.org.toUpperCase()}`, 40, 62);
  ctx.fillStyle = "#2a2620";
  ctx.font = `italic 500 100px ${f.display}`;
  ctx.fillText("Aanya Rao", 40, 238);
  ctx.font = `400 38px ${f.sans}`;
  ctx.fillStyle = "#4a443a";
  ctx.fillText(s.subject, 42, 314);
  ctx.fillStyle = "#8a8272";
  ctx.font = `400 30px ${f.sans}`;
  ctx.fillText("Metis workspace, all inboxes", 42, 368);
  ctx.strokeStyle = "rgba(42,38,32,0.16)";
  ctx.lineWidth = 2;
  for (const y of [404, 444]) {
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(w - 60, y);
    ctx.stroke();
  }
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  f: Fonts,
  s: Sender,
  img: HTMLImageElement | null,
) {
  const w = 400;
  const h = 480;
  ctx.fillStyle = "#fbf8f1";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = s.tint;
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, w - 60, h - 60);
  ctx.fillStyle = "#f3eee2";
  ctx.fillRect(42, 42, w - 84, h - 84);
  if (img) ctx.drawImage(img, 60, 64, 280, 280);
  ctx.fillStyle = "#2a2620";
  ctx.font = `500 32px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.fillText("METIS POST", w / 2, 396);
  ctx.textAlign = "left";
  ctx.strokeStyle = "rgba(30,26,20,0.5)";
  ctx.lineWidth = 5;
  for (const r of [130, 102]) {
    ctx.beginPath();
    ctx.arc(64, 430, r, -1.4, 0.1);
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    for (let x = 170; x <= 400; x += 8) {
      const y = 250 + i * 26 + Math.sin(x / 22) * 7;
      if (x === 170) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawLetter(ctx: CanvasRenderingContext2D, f: Fonts) {
  const w = 1060;
  ctx.fillStyle = "#fbf9f4";
  ctx.fillRect(0, 0, w, 740);
  ctx.fillStyle = "#2a2620";
  ctx.font = `italic 500 66px ${f.display}`;
  ctx.fillText("Renewal: final redlines", 56, 104);
  ctx.fillStyle = "#7a7263";
  ctx.font = `400 26px ${f.mono}`;
  ctx.fillText("MEERA IYER  ·  HARBOUR LEGAL  ·  9:42", 58, 150);
  ctx.fillStyle = "rgba(176,125,31,0.13)";
  roundRect(ctx, 50, 186, w - 100, 300, 22);
  ctx.fill();
  ctx.fillStyle = "#815b17";
  ctx.font = `500 25px ${f.mono}`;
  ctx.fillText("SUMMARY", 84, 236);
  ctx.fillStyle = "#2a2620";
  ctx.font = `400 36px ${f.sans}`;
  wrapText(
    ctx,
    "Meera accepted the renewal at the current rate. Two edits remain in clause 7: notice moves to 60 days and liability is capped at twelve months.",
    84,
    290,
    w - 168,
    50,
  );
  let x = 56;
  ctx.font = `500 30px ${f.sans}`;
  for (const c of ["Confirm 60-day notice", "Sign by Fri, 24 Oct"]) {
    const tw = ctx.measureText(c).width + 52;
    ctx.fillStyle = "#2a2620";
    roundRect(ctx, x, 528, tw, 64, 32);
    ctx.fill();
    ctx.fillStyle = "#faf8f3";
    ctx.fillText(c, x + 26, 571);
    x += tw + 16;
  }
  ctx.fillStyle = "#7a7263";
  ctx.font = `400 28px ${f.sans}`;
  ctx.fillText("Reply drafts:  Both edits work for us.   ·   Can we keep 30 days?", 58, 668);
}

type Env = {
  root: THREE.Group;
  flap: THREE.Object3D | null;
  pivot: THREE.Group;
  band: THREE.Mesh;
  addressMat: THREE.MeshStandardMaterial | null;
  stampMat: THREE.MeshStandardMaterial | null;
  addr: ReturnType<typeof makeCanvasTexture>;
  lift: number;
  slide: number;
};

export function EnvelopeModel() {
  const { scene } = useGLTF("/models/envelope.glb");
  const logos = useImages(SENDERS.map((s) => s.logo));

  const letter = useMemo(() => makeCanvasTexture(1060, 740, drawLetter), []);
  const envs = useMemo<Env[]>(() => {
    return SENDERS.map((s, i) => {
      const root = new THREE.Group();
      const model = scene.clone(true);
      root.add(model);
      root.scale.setScalar(S);
      const addressMat = ownMaterial(findMesh(model, "address"));
      const stampMat = ownMaterial(findMesh(model, "stamp"));
      const letterMat = ownMaterial(findMesh(model, "letter"));
      const addr = makeCanvasTexture(1040, 500, (ctx, f) => drawAddress(ctx, f, s));
      setMap(addressMat, addr.tex);
      if (i === 0) setMap(letterMat, letter.tex);
      const letterNode = findNode(model, "letter");
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.00035, LH / 2);
      model.add(pivot);
      if (letterNode) {
        letterNode.removeFromParent();
        letterNode.position.set(0, 0, -LH / 2);
        pivot.add(letterNode);
        letterNode.visible = i === 0;
      }
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.0046, H * 1.02),
        new THREE.MeshStandardMaterial({
          color: MAIL_LABELS[i]?.color ?? "#888",
          roughness: 0.62,
        }),
      );
      band.position.set(-W / 2 + 0.028, 0, 0);
      model.add(band);
      return {
        root,
        flap: findNode(model, "flap"),
        pivot,
        band,
        addressMat,
        stampMat,
        addr,
        lift: 0,
        slide: 0,
      };
    });
  }, [scene, letter]);

  useEffect(() => {
    const repaint = () => {
      for (const e of envs) e.addr.paint();
      letter.paint();
    };
    void document.fonts?.ready.then(repaint);
  }, [envs, letter]);

  useEffect(() => {
    const made: THREE.Texture[] = [];
    envs.forEach((e, i) => {
      const s = SENDERS[i];
      if (!s) return;
      const t = makeCanvasTexture(400, 480, (ctx, f) => drawStamp(ctx, f, s, logos[i] ?? null));
      setMap(e.stampMat, t.tex);
      made.push(t.tex);
    });
    return () => {
      for (const t of made) t.dispose();
    };
  }, [envs, logos]);

  const euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useFrame((state, dt) => {
    const p = live.ps;
    const { pick, plate } = exhibit.get();
    const fan = seg(p, 0.45, 0.95) * (1 - seg(p, 1.5, 1.72));
    const flip = seg(p, 1.55, 1.82) * (1 - seg(p, 2.5, 2.72));
    const open = seg(p, 1.72, 1.86) * (1 - seg(p, 2.42, 2.55));
    const slideOut = seg(p, 1.8, 1.93) * (1 - seg(p, 2.36, 2.48));
    const stand = seg(p, 1.9, 2.0) * (1 - seg(p, 2.3, 2.38));
    const sort = seg(p, 2.6, 2.95);
    const t = state.clock.elapsedTime;

    envs.forEach((e, i) => {
      const k = i - 1.5;
      let x = 0;
      let y = (3 - i) * 0.03;
      let z = 0;
      let yaw = [0.05, -0.05, 0.08, -0.07][i] ?? 0;
      let tilt = 0;
      let flipZ = Math.PI;

      x = lerp(x, k * 1.9, fan);
      z = lerp(z, Math.abs(k) * 0.4 - 0.25, fan);
      y = lerp(y, 0.01, fan);
      yaw = lerp(yaw, -k * 0.15, fan);

      e.lift = damp(e.lift, plate === 1 && pick === i ? 1 : 0, 7, dt);
      y += e.lift * 0.3 * fan;
      tilt += e.lift * 0.35 * fan;

      if (i === 0) {
        y += Math.sin(flip * Math.PI) * 0.7 + flip * 0.25;
        z += flip * 0.25;
        flipZ = lerp(Math.PI, 0, flip);
        yaw = lerp(yaw, 0, flip);
      }

      x = lerp(x, -0.3 + k * 0.1, sort);
      z = lerp(z, k * 0.5, sort);
      y = lerp(y, 0.02 + (3 - i) * 0.045, sort);
      yaw = lerp(yaw, 0.03 * k, sort);
      e.slide = damp(e.slide, plate === 3 && pick === i ? 1 : 0, 7, dt);
      x += e.slide * 0.8 * sort;

      y += Math.sin(t * 0.7 + i * 1.3) * 0.008;
      e.root.position.set(x, y, z);
      euler.set(tilt, yaw, flipZ, "YXZ");
      e.root.rotation.copy(euler);

      if (e.flap) e.flap.rotation.x = -open * Math.PI * 0.94;
      if (i === 0) {
        e.pivot.position.z = lerp(LH / 2, -H / 2 + 0.014, slideOut);
        e.pivot.rotation.x = stand * 1.42;
      }

      const b = seg(p, 2.75, 2.98);
      e.band.scale.set(1, 1, Math.max(0.001, b));
      e.band.visible = b > 0.01;
    });
  });

  return (
    <group>
      {envs.map((e, i) => (
        <primitive key={SENDERS[i]?.from} object={e.root} />
      ))}
    </group>
  );
}
