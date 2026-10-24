import "server-only";
import { mergeEnvelope, type NodeHandler } from "../nodes";

export const mergeJoin: NodeHandler<"merge.join"> = (node, envelope) =>
  mergeEnvelope(node, envelope);
