export const CRLF = "\r\n";

export type Header = [string, string];

export interface Part {
  headers: Header[];
  body: string | Buffer;
}

export function base64Lines(data: Buffer | string, width = 76): string {
  const encoded = Buffer.from(data).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += width) {
    lines.push(encoded.slice(i, i + width));
  }
  return lines.join(CRLF);
}

export function headerBlock(headers: Header[]): string {
  return headers.map(([name, value]) => `${name}: ${value}`).join(CRLF);
}

export function entity(headers: Header[], body: string | Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${headerBlock(headers)}${CRLF}${CRLF}`, "utf8"),
    Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8"),
  ]);
}

export function multipartBody(boundary: string, parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}${CRLF}`));
    chunks.push(entity(part.headers, part.body));
    chunks.push(Buffer.from(CRLF));
  }
  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
  return Buffer.concat(chunks);
}

export function textPart(text: string, type = "text/plain"): Part {
  return {
    headers: [["Content-Type", `${type}; charset=utf-8`]],
    body: text,
  };
}

export function attachment(
  filename: string | null,
  mimeType: string,
  data: Buffer | string,
  extra: Header[] = [],
): Part {
  const disposition =
    filename === null ? "attachment" : `attachment; filename="${filename.replace(/"/g, '\\"')}"`;
  return {
    headers: [
      ["Content-Type", mimeType],
      ["Content-Transfer-Encoding", "base64"],
      ["Content-Disposition", disposition],
      ...extra,
    ],
    body: base64Lines(data),
  };
}

export function inlineImage(cid: string, mimeType: string, data: Buffer): Part {
  return {
    headers: [
      ["Content-Type", mimeType],
      ["Content-Transfer-Encoding", "base64"],
      ["Content-ID", `<${cid}>`],
      ["Content-Disposition", "inline"],
    ],
    body: base64Lines(data),
  };
}
