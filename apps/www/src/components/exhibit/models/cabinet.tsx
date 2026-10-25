"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { damp, exhibit, lerp, live, seg } from "../engine";
import { type Fonts, makeCanvasTexture, roundRect } from "../textures";
import { findMesh, findNode, litMap } from "./shared";

const S = 5;
const DRIVE_SOURCES = ["Google Drive", "OneDrive", "S3", "WebDAV", "FTP", "SFTP"];
const TARGET = 1;
const OPEN = 0.16;
const DOC_W = 0.056;
const DOC_H = 0.075;
const FLOOR = -0.039;
const PREVIEW = 2.8;

function drawLabel(ctx: CanvasRenderingContext2D, f: Fonts, text: string) {
  ctx.fillStyle = "#f1e8d2";
  ctx.fillRect(0, 0, 512, 198);
  ctx.fillStyle = "#2a2620";
  ctx.font = `600 ${text.length > 8 ? 58 : 70}px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), 256, 104);
}

function drawInvoice(ctx: CanvasRenderingContext2D, f: Fonts) {
  const w = 800;
  const h = 1080;
  ctx.fillStyle = "#fdfbf6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a2620";
  ctx.font = `italic 500 64px ${f.display}`;
  ctx.fillText("Northwind Billing", 60, 120);
  ctx.fillStyle = "#7a7263";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillText("INVOICE INV-2291  ·  OCTOBER", 62, 172);
  ctx.strokeStyle = "rgba(42,38,32,0.18)";
  ctx.lineWidth = 2;
  const rows = [
    ["Hosting, October", "1,980.00"],
    ["Support plan", "1,250.00"],
    ["Storage, 4 TB", "640.00"],
    ["Bandwidth", "410.00"],
  ];
  let y = 270;
  ctx.font = `400 32px ${f.sans}`;
  for (const [a, b] of rows) {
    ctx.fillStyle = "#2a2620";
    ctx.fillText(a ?? "", 62, y);
    ctx.textAlign = "right";
    ctx.fillText(b ?? "", w - 62, y);
    ctx.textAlign = "left";
    ctx.beginPath();
    ctx.moveTo(62, y + 30);
    ctx.lineTo(w - 62, y + 30);
    ctx.stroke();
    y += 84;
  }
  ctx.fillStyle = "rgba(176,125,31,0.14)";
  roundRect(ctx, 50, y + 10, w - 100, 120, 18);
  ctx.fill();
  ctx.fillStyle = "#815b17";
  ctx.font = `500 26px ${f.mono}`;
  ctx.fillText("TOTAL DUE BY 30 OCT", 82, y + 82);
  ctx.fillStyle = "#2a2620";
  ctx.font = `600 44px ${f.sans}`;
  ctx.textAlign = "right";
  ctx.fillText("4,280.00 USD", w - 82, y + 86);
  ctx.textAlign = "left";
  ctx.fillStyle = "#9a9484";
  ctx.font = `400 26px ${f.sans}`;
  ctx.fillText("Previewed in the browser. Nothing downloaded.", 62, h - 70);
}

type Drawer = {
  node: THREE.Object3D;
  base: THREE.Vector3;
  top: number;
  bottom: number;
  open: number;
};

export function CabinetModel() {
  const { scene } = useGLTF("/models/cabinet.glb");
  const env = useGLTF("/models/envelope.glb");

  const labels = useMemo(
    () => DRIVE_SOURCES.map((s) => makeCanvasTexture(512, 198, (ctx, f) => drawLabel(ctx, f, s))),
    [],
  );
  const invoice = useMemo(() => makeCanvasTexture(800, 1080, drawInvoice, false), []);

  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = scene.clone(true);
    root.add(model);
    root.updateMatrixWorld(true);
    const drawers: Drawer[] = [];
    DRIVE_SOURCES.forEach((_, i) => {
      const node = findNode(model, `drawer${i}`);
      const label = labels[i];
      if (label) litMap(findMesh(model, `label${i}`), label.tex);
      if (!node) return;
      const box = new THREE.Box3().setFromObject(node);
      drawers.push({
        node,
        base: node.position.clone(),
        top: box.max.y,
        bottom: box.min.y,
        open: 0,
      });
    });
    const cabinet = findNode(model, "cabinet");
    const top = cabinet ? new THREE.Box3().setFromObject(cabinet).max.y : 0.365;
    root.scale.setScalar(S);
    const paper = new THREE.MeshStandardMaterial({ color: "#f6f1e6", roughness: 0.85 });
    const doc = new THREE.Mesh(new THREE.BoxGeometry(DOC_W, DOC_H, 0.0006), [
      paper,
      paper,
      paper,
      paper,
      new THREE.MeshStandardMaterial({ map: invoice.tex, roughness: 0.85 }),
      paper,
    ]);
    root.add(doc);
    const letter = env.scene.clone(true);
    letter.traverse((o) => {
      if (o.name === "letter") o.visible = false;
    });
    const envGroup = new THREE.Group();
    envGroup.add(letter);
    envGroup.scale.setScalar(0.9);
    root.add(envGroup);
    return { root, drawers, doc, envGroup, top, flap: findNode(letter, "flap") };
  }, [scene, env.scene, labels, invoice]);

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      for (const l of labels) l.paint();
      invoice.paint();
    });
  }, [labels, invoice]);

  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((s, dt) => {
    const p = live.ps;
    const { pick, plate } = exhibit.get();
    const t = s.clock.elapsedTime;
    const pv = seg(p, 2.55, 2.95);

    built.drawers.forEach((d, i) => {
      let want = 0;
      if (plate === 1 && pick === i) want = 0.13;
      if (i === TARGET) want = Math.max(want, seg(p, 1.62, 1.76) * OPEN);
      d.open = damp(d.open, want, 6, dt);
      d.node.position.set(d.base.x, d.base.y, d.base.z + d.open);
    });

    const g = built.envGroup;
    const inE = seg(p, 1.5, 1.68);
    g.position.set(
      lerp(0.36, 0.05, inE),
      built.top + 0.003 + lerp(0.08, 0, inE),
      lerp(0.05, -0.02, inE),
    );
    g.rotation.set(0, lerp(0.5, -0.12, inE), 0);
    g.visible = inE > 0.01 && p < 2.6;
    if (built.flap) built.flap.rotation.x = -seg(p, 1.62, 1.74) * Math.PI * 0.94;

    const d0 = built.drawers[TARGET];
    if (!d0) return;
    const doc = built.doc;
    const up = seg(p, 1.72, 1.82);
    const fly = seg(p, 1.82, 1.94);
    const drop = seg(p, 1.93, 2.02);
    const front = d0.base.z + d0.open;
    const filed = tmp.c.set(d0.base.x, d0.base.y + FLOOR + DOC_H / 2, front - 0.022);
    const pos = tmp.a.set(g.position.x, g.position.y + 0.004 + up * 0.06, g.position.z - 0.01);
    pos.lerp(tmp.b.set(d0.base.x, d0.top + 0.06, filed.z), fly);
    pos.lerp(filed, drop);
    let rx = lerp(-Math.PI / 2, -0.25, up);
    rx = lerp(rx, 0, fly);
    const lift = seg(p, 2.55, 2.7);
    pos.y += lift * (d0.top - filed.y + DOC_H * 0.6);
    pos.lerp(tmp.d.set(d0.base.x, d0.top + 0.1, front + 0.1), seg(p, 2.68, 2.95));
    rx = lerp(rx, -0.04, pv);
    doc.position.copy(pos);
    doc.position.y += Math.sin(t * 0.8) * 0.001 * pv;
    doc.rotation.set(rx, 0, 0);
    doc.scale.setScalar(lerp(1, PREVIEW, seg(p, 2.68, 2.95)));
    doc.visible = p > 1.7;
  });

  return <primitive object={built.root} />;
}
