import type { FitViewOptions } from "@xyflow/react";

const MOBILE_FIT_ZOOM = 0.6;

export function graphFitOptions(
  mobile: boolean,
  nodes: readonly { id: string }[],
  edges: readonly { target: string }[],
): FitViewOptions {
  if (!mobile) return { padding: 0.2, maxZoom: 1, minZoom: 0.2 };
  const targets = new Set(edges.map((edge) => edge.target));
  const roots = nodes.filter((node) => !targets.has(node.id)).map((node) => ({ id: node.id }));
  return {
    padding: 0.2,
    minZoom: MOBILE_FIT_ZOOM,
    maxZoom: MOBILE_FIT_ZOOM,
    nodes: roots.length > 0 ? roots : undefined,
  };
}
