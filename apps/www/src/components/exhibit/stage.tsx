"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { live, smooth } from "./engine";
import { CabinetModel } from "./models/cabinet";
import { CalendarModel } from "./models/calendar";
import { EnvelopeModel } from "./models/envelope";
import { GeartrainModel } from "./models/geartrain";
import { LaptopModel } from "./models/laptop";
import { PadlockModel } from "./models/padlock";
import { PatchboardModel } from "./models/patchboard";
import { ServerModel } from "./models/server";
import { TypewriterModel } from "./models/typewriter";
import { overlay } from "./overlay";
import type { ModelKey, Pose } from "./types";

const MODELS: Record<ModelKey, () => React.JSX.Element> = {
  envelope: EnvelopeModel,
  calendar: CalendarModel,
  cabinet: CabinetModel,
  typewriter: TypewriterModel,
  padlock: PadlockModel,
  server: ServerModel,
  patchboard: PatchboardModel,
  geartrain: GeartrainModel,
  laptop: LaptopModel,
};

THREE.setConsoleFunction((type, message, ...params) => {
  if (message.startsWith("THREE.Clock:")) return;
  const log = params[0];
  if (
    message.startsWith("THREE.WebGLProgram: Program Info Log") &&
    typeof log === "string" &&
    log
      .split("\n")
      .filter((line) => line.trim() !== "")
      .every((line) => line.includes("warning X4122"))
  )
    return;
  const out = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  const traced = stackTraceError(params[0], message);
  if (traced) out(traced);
  else out(message, ...params);
});

function stackTraceError(trace: unknown, message: string): Error | null {
  if (typeof trace !== "object" || trace === null) return null;
  if (!("isStackTrace" in trace) || trace.isStackTrace !== true) return null;
  if (!("getError" in trace) || typeof trace.getError !== "function") {
    return null;
  }
  const error: unknown = trace.getError(message);
  return error instanceof Error ? error : null;
}

const D2R = Math.PI / 180;

const box = new THREE.Box3();
const part = new THREE.Box3();

function visibleRadius(root: THREE.Object3D, t: THREE.Vector3) {
  box.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverseVisible((m) => {
    if (!(m instanceof THREE.Mesh)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    if (!m.geometry.boundingBox) return;
    part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
    box.union(part);
  });
  if (box.isEmpty()) return 0;
  return Math.max(
    Math.abs(box.min.x - t.x),
    Math.abs(box.max.x - t.x),
    Math.abs(box.min.z - t.z) * 0.7,
    Math.abs(box.max.z - t.z) * 0.7,
  );
}

function Rig({ poses, model }: { poses: Pose[]; model: React.RefObject<THREE.Group | null> }) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3());
  const fit = useRef({ r: 0, d: 0, n: 0 });
  useFrame((_, dt) => {
    const ps = Math.min(poses.length - 1, Math.max(0, live.ps));
    const i = Math.min(poses.length - 2, Math.floor(ps));
    const a = poses[Math.max(0, i)];
    const b = poses[Math.min(poses.length - 1, i + 1)];
    if (!a || !b) return;
    const f = poses.length === 1 ? 0 : smooth(ps - i);
    const narrow = size.width / size.height < 0.9;
    const yaw = (a.yaw + (b.yaw - a.yaw) * f + live.sx * 3.2) * D2R;
    const pitch = (a.pitch + (b.pitch - a.pitch) * f - live.sy * 1.8) * D2R;
    let dist = (a.dist + (b.dist - a.dist) * f) * (narrow ? 1.25 : 1);
    target.current.set(
      a.target[0] + (b.target[0] - a.target[0]) * f,
      a.target[1] + (b.target[1] - a.target[1]) * f - (narrow ? dist * 0.04 : 0),
      a.target[2] + (b.target[2] - a.target[2]) * f,
    );
    if (narrow && model.current) {
      if (fit.current.n++ % 6 === 0) fit.current.r = visibleRadius(model.current, target.current);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 28;
      const half = Math.tan((fov * D2R) / 2) * (size.width / size.height);
      const need = fit.current.r / (half * 0.86) + fit.current.r * 1.1;
      fit.current.d =
        fit.current.d === 0
          ? need
          : fit.current.d + (need - fit.current.d) * (1 - Math.exp(-dt * 3));
      dist = Math.max(dist, fit.current.d);
    }
    camera.position.set(
      target.current.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.current.y + dist * Math.sin(pitch),
      target.current.z + dist * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(target.current);
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

export default function Stage({ model, poses }: { model: ModelKey; poses: Pose[] }) {
  const Model = MODELS[model];
  const [ready, setReady] = useState(false);
  const group = useRef<THREE.Group>(null);
  return (
    <div
      className={`relative h-full w-full transition-opacity duration-[1200ms] ease-out ${ready ? "opacity-100" : "opacity-0"}`}
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 28, near: 0.4, far: 60, position: [0, 1.5, 7] }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Rig poses={poses} model={group} />
        <ambientLight intensity={0.15} />
        <directionalLight position={[3.5, 6, 4]} intensity={1.3} color="#fff6e8" />
        <directionalLight position={[-5, 2.5, -2]} intensity={0.35} color="#e8eeff" />
        <Suspense fallback={null}>
          <Environment
            files="/hdri/studio.hdr"
            environmentIntensity={0.9}
            environmentRotation={[0, 0, 0]}
          />
          <group ref={group}>
            <Model />
          </group>
          <ContactShadows
            position={[0, 0, 0]}
            scale={9}
            blur={2.6}
            far={3.2}
            opacity={0.42}
            resolution={512}
            color="#3a2f1c"
          />
          <Ready onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <div
        ref={(el) => {
          if (el) overlay.current = el;
        }}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </div>
  );
}
