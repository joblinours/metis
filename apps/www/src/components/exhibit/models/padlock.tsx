"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { lerp, live, seg } from "../engine";
import { type Fonts, makeCanvasTexture, roundRect } from "../textures";
import { findByMaterial, findNode, litMap } from "./shared";

const S = 34;
const D = 0.019;
const KZ = 0.017;

function drawTag(ctx: CanvasRenderingContext2D, f: Fonts) {
  const w = 480;
  const h = 650;
  ctx.fillStyle = "#efe7d4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#815b17";
  ctx.font = `500 34px ${f.mono}`;
  ctx.textAlign = "center";
  ctx.fillText("SIGN-IN CODE", w / 2, 250);
  ctx.fillStyle = "#2a2620";
  ctx.font = `500 92px ${f.mono}`;
  ctx.fillText("482", w / 2, 370);
  ctx.fillText("913", w / 2, 470);
  ctx.strokeStyle = "rgba(42,38,32,0.25)";
  ctx.lineWidth = 3;
  roundRect(ctx, 40, 180, w - 80, 340, 18);
  ctx.stroke();
  ctx.textAlign = "left";
}

export function PadlockModel() {
  const lock = useGLTF("/models/padlock.glb");
  const tag = useMemo(() => makeCanvasTexture(480, 650, drawTag), []);
  const built = useMemo(() => {
    const root = new THREE.Group();
    const model = lock.scene.clone(true);
    root.add(model);
    root.scale.setScalar(S);
    litMap(findByMaterial(model, "tag"), tag.tex);
    const key = findNode(model, "key");
    const tagNode = findNode(model, "tag");
    const tagPivot = new THREE.Group();
    if (key && tagNode) {
      tagPivot.position.set(0, -0.0032, 0.0398);
      key.add(tagPivot);
      tagNode.removeFromParent();
      tagNode.position.set(0, 0.0032, -0.0398);
      tagPivot.add(tagNode);
    }

    return {
      root,
      key,
      tagPivot,
      shackle: findNode(model, "shackle"),
    };
  }, [lock.scene, tag]);

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      tag.paint();
    });
  }, [tag]);

  useFrame((s) => {
    const p = live.ps;
    const t = s.clock.elapsedTime;
    const arrive = seg(p, 0.5, 0.7);
    const insert = seg(p, 0.7, 0.84);
    const turn = seg(p, 0.84, 0.94) * (1 - seg(p, 1.5, 1.6));
    const pop = seg(p, 0.92, 0.99) * (1 - seg(p, 1.7, 1.78));
    const withdraw = seg(p, 1.6, 1.78);
    const swing = seg(p, 0.96, 1.04) * (1 - seg(p, 1.56, 1.68));

    if (built.key) {
      const front = D / 2 + 0.0005;
      let x = lerp(0.07, 0, arrive);
      let y = lerp(0.002, KZ, arrive);
      let z = lerp(0.065, front + 0.03, arrive);
      z = lerp(z, front - 0.016, insert);
      z = lerp(z, front + 0.045, withdraw);
      x = lerp(x, 0.2, seg(p, 1.78, 1.96));
      y = lerp(y, 0.002, seg(p, 1.78, 1.96));
      built.key.position.set(x, y, z);
      const flat = (1 - arrive) * (Math.PI / 2) + seg(p, 1.78, 1.96) * (Math.PI / 2);
      built.key.rotation.set(0, (1 - arrive) * 0.5, flat - turn * (Math.PI / 2));
      built.key.visible = p > 0.45 && p < 1.95;
      built.tagPivot.rotation.z = turn * (Math.PI / 2) - flat + Math.sin(t * 1.6) * 0.04 * arrive;
    }
    if (built.shackle) {
      built.shackle.position.y = 0.042 + pop * 0.012;
      built.shackle.rotation.y = swing * 0.3;
    }

    built.root.rotation.y = Math.sin(t * 0.4) * 0.03;
  });

  return <primitive object={built.root} />;
}

useGLTF.preload("/models/padlock.glb");
