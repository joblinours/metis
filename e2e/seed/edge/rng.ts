export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBytes(size: number, seed: number): Buffer {
  const next = rng(seed);
  const out = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i++) out[i] = Math.floor(next() * 256);
  return out;
}

export function words(count: number, seed: number): string {
  const vocabulary = [
    "invoice",
    "meeting",
    "deadline",
    "package",
    "review",
    "budget",
    "launch",
    "draft",
    "contract",
    "shipment",
    "quarterly",
    "follow-up",
  ];
  const next = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(vocabulary[Math.floor(next() * vocabulary.length)] ?? "x");
  }
  return out.join(" ");
}
