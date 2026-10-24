import "server-only";
import { mergeEnvelope, type NodeHandler } from "../nodes";

export const mergeAppend: NodeHandler<"merge.append"> = (node, envelope) =>
  mergeEnvelope(node, envelope);
