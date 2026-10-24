import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import { strToU8, zipSync } from "fflate";

import { randomBytes } from "./rng";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function png(width: number, height: number, mode: "solid" | "noise", seed = 1): Buffer {
  const channels = mode === "noise" ? 3 : 1;
  const stride = width * channels + 1;
  const raw =
    mode === "noise" ? randomBytes(stride * height, seed) : Buffer.alloc(stride * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * stride] = 0;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pdfEscape(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

const PDF_PASSWORD_PAD = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);
const PDF_PERMISSIONS = -4;

function md5(...parts: Buffer[]): Buffer {
  const hash = createHash("md5");
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function rc4(key: Buffer, data: Buffer): Buffer {
  const state = Uint8Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + (state[i] ?? 0) + (key[i % key.length] ?? 0)) & 0xff;
    [state[i], state[j]] = [state[j] ?? 0, state[i] ?? 0];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff;
    j = (j + (state[i] ?? 0)) & 0xff;
    [state[i], state[j]] = [state[j] ?? 0, state[i] ?? 0];
    const k = state[((state[i] ?? 0) + (state[j] ?? 0)) & 0xff] ?? 0;
    out[n] = (data[n] ?? 0) ^ k;
  }
  return out;
}

function pdfSecurity(password: string, fileId: Buffer) {
  const padded = Buffer.concat([Buffer.from(password, "latin1"), PDF_PASSWORD_PAD]).subarray(0, 32);
  const owner = rc4(md5(padded).subarray(0, 5), padded);
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(PDF_PERMISSIONS);
  const key = md5(padded, owner, permissions, fileId).subarray(0, 5);
  return { key, owner, user: rc4(key, PDF_PASSWORD_PAD) };
}

function pdfObjectKey(key: Buffer, objectId: number): Buffer {
  const suffix = Buffer.alloc(5);
  suffix.writeUIntLE(objectId, 0, 3);
  return md5(key, suffix).subarray(0, 10);
}

export function pdf(
  pages: string[],
  options: { script?: string; password?: string; padding?: number } = {},
): Buffer {
  const fileId = md5(Buffer.from(pages.join("\n"), "latin1"));
  const security = options.password ? pdfSecurity(options.password, fileId) : null;
  const seal = (objectId: number, value: string): string =>
    security
      ? rc4(pdfObjectKey(security.key, objectId), Buffer.from(value, "latin1")).toString("latin1")
      : value;
  const literal = (objectId: number, value: string): string =>
    security
      ? `<${Buffer.from(seal(objectId, value), "latin1").toString("hex")}>`
      : `(${pdfEscape(value)})`;

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let next = 4;
  if (options.script) {
    const actionId = next++;
    objects[actionId] =
      `<< /Type /Action /S /JavaScript /JS ${literal(actionId, options.script)} >>`;
    objects[1] = `<< /Type /Catalog /Pages 2 0 R /OpenAction ${actionId} 0 R /Names << /JavaScript << /Names [${literal(1, "open")} ${actionId} 0 R] >> >> >>`;
  }
  for (const [index, text] of pages.entries()) {
    const padding = index === 0 && options.padding ? `\n%${"x".repeat(options.padding)}` : "";
    const contentId = next++;
    const pageId = next++;
    const stream = seal(contentId, `BT /F1 12 Tf 50 750 Td (${pdfEscape(text)}) Tj ET${padding}`);
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    pageIds.push(pageId);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let trailerExtra = "";
  if (security) {
    const encryptId = next++;
    objects[encryptId] =
      `<< /Filter /Standard /V 1 /R 2 /O <${security.owner.toString("hex")}> /U <${security.user.toString("hex")}> /P ${PDF_PERMISSIONS} >>`;
    const id = fileId.toString("hex");
    trailerExtra = ` /Encrypt ${encryptId} 0 R /ID [<${id}> <${id}>]`;
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(out, "latin1");
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const ZIP_MTIME = new Date(Date.UTC(2026, 0, 1));

export function zip(entries: Record<string, string | Uint8Array>, level: 0 | 9 = 9): Buffer {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries)) {
    files[name] = typeof value === "string" ? strToU8(value) : value;
  }
  return Buffer.from(zipSync(files, { level, mtime: ZIP_MTIME }));
}

export function wav(seconds: number, frequency: number): Buffer {
  const rate = 22_050;
  const samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 2000, (samples - i) / 2000);
    const value = Math.sin((2 * Math.PI * frequency * i) / rate) * fade;
    data.writeInt16LE(Math.round(value * 12_000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function truncate(buffer: Buffer, fraction: number): Buffer {
  return buffer.subarray(0, Math.max(1, Math.floor(buffer.length * fraction)));
}
