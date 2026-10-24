import { BLOCKED_SRC_ATTR } from "./placeholder";
import type { RemoteImages } from "./types";

export const FRAME_BASE_HREF = "https://email.invalid/";

export const IMAGE_PROXY_PATH = "/api/mail/image";

export function imageProxyEndpoint(origin: string): string {
  return `${origin}${IMAGE_PROXY_PATH}`;
}

export function proxiedImageUrl(origin: string, url: string): string {
  const bytes = new TextEncoder().encode(url);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${imageProxyEndpoint(origin)}?u=${encoded}`;
}

export interface FrameDocumentOptions {
  images: RemoteImages;
  proxyEndpoint?: string | null;
  adaptive: boolean;
  theme: "light" | "dark";
  textColor?: string | null;
  title?: string;
  header?: string;
  print?: boolean;
}

const BASE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "form-action 'none'",
];

export function imageSources(images: RemoteImages, proxyEndpoint?: string | null): string {
  if (images === "load") return "https: http: data: blob:";
  if (images === "proxy" && proxyEndpoint) {
    return `data: blob: ${proxyEndpoint}`;
  }
  return "data: blob:";
}

export function frameContentSecurityPolicy(
  images: RemoteImages,
  proxyEndpoint?: string | null,
): string {
  return [...BASE_POLICY, `img-src ${imageSources(images, proxyEndpoint)}`].join("; ");
}

function escapeAttr(value: string): string {
  return value.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function frameColorScheme(
  options: Pick<FrameDocumentOptions, "adaptive" | "theme" | "print">,
): "light" | "dark" {
  return options.adaptive && !options.print ? options.theme : "light";
}

function baseStyle(options: FrameDocumentOptions): string {
  const scheme = frameColorScheme(options);
  const adaptive = options.adaptive && !options.print;
  const page = !adaptive && !options.print && options.theme === "dark";
  const color =
    adaptive && options.textColor ? `color: ${options.textColor.replace(/[;{}<>]/g, "")};` : "";
  return [
    `:root { color-scheme: ${scheme}; }`,
    `html { background: ${page || options.print ? "#fff" : "transparent"}; ${page ? "padding: 16px;" : ""} overflow-x: auto; overflow-y: hidden; }`,
    `body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; ${color} }`,
    "img { max-width: 100%; height: auto; }",
    `img[${BLOCKED_SRC_ATTR}], image[${BLOCKED_SRC_ATTR}] { cursor: pointer; }`,
    "pre { white-space: pre-wrap; }",
  ].join("\n");
}

export function buildFrameDocument(bodyHtml: string, options: FrameDocumentOptions): string {
  const csp = frameContentSecurityPolicy(options.images, options.proxyEndpoint);
  return [
    "<!doctype html>",
    "<html><head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`,
    '<meta name="referrer" content="no-referrer">',
    `<meta name="color-scheme" content="${frameColorScheme(options)}">`,
    '<meta http-equiv="x-dns-prefetch-control" content="off">',
    `<base href="${FRAME_BASE_HREF}" target="_blank">`,
    options.title ? `<title>${escapeAttr(options.title)}</title>` : "",
    `<style>${baseStyle(options)}</style>`,
    "</head><body>",
    options.header ?? "",
    bodyHtml,
    "</body></html>",
  ].join("");
}
