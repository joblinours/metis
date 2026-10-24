"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";

export function useImages(urls: string[]) {
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>(() => urls.map(() => null));
  const key = urls.join("|");
  useEffect(() => {
    let alive = true;
    const list = key.split("|");
    void Promise.all(
      list.map(
        (u) =>
          new Promise<HTMLImageElement | null>((resolve) => {
            const img = new Image();
            img.addEventListener("load", () => resolve(img));
            img.addEventListener("error", () => resolve(null));
            img.src = u;
          }),
      ),
    ).then((r) => alive && setImgs(r));
    return () => {
      alive = false;
    };
  }, [key]);
  return imgs;
}

export function findMesh(root: THREE.Object3D, name: string) {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && o.name === name && o instanceof THREE.Mesh) found = o;
  });
  if (!found) {
    root.traverse((o) => {
      if (!found && o.name === name) {
        o.traverse((c) => {
          if (!found && c instanceof THREE.Mesh) found = c;
        });
      }
    });
  }
  return found as THREE.Mesh | null;
}

export function findNode(root: THREE.Object3D, name: string) {
  return root.getObjectByName(name) ?? null;
}

export function findByMaterial(root: THREE.Object3D, name: string) {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (
      !found &&
      o instanceof THREE.Mesh &&
      o.material instanceof THREE.Material &&
      o.material.name === name
    )
      found = o;
  });
  return found as THREE.Mesh | null;
}

export function basicMaterial(mesh: THREE.Mesh | null, params: THREE.MeshBasicMaterialParameters) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, ...params });
  if (mesh) mesh.material = m;
  return m;
}

export function litMap(mesh: THREE.Mesh | null, tex: THREE.Texture) {
  setMap(ownMaterial(mesh), tex);
}

export function ownMaterial(mesh: THREE.Mesh | null) {
  if (!(mesh?.material instanceof THREE.MeshStandardMaterial)) return null;
  const m = mesh.material.clone();
  mesh.material = m;
  return m;
}

export function setMap(mat: THREE.MeshStandardMaterial | null, tex: THREE.Texture | null) {
  if (!mat) return;
  mat.map = tex;
  mat.color.set("#ffffff");
  mat.needsUpdate = true;
}

export function shadowsOn(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}
