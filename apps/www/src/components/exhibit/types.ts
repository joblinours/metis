export type ModelKey =
  | "envelope"
  | "calendar"
  | "cabinet"
  | "typewriter"
  | "padlock"
  | "server"
  | "patchboard"
  | "geartrain"
  | "laptop";

export type Pose = {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
};
