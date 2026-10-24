import { ImageResponse } from "next/og";

import { PAGES, pageInfo } from "@/content/pages";
import { SITE_NAME } from "@/lib/site";

const INK = "#2a2620";
const BG = "#faf8f3";
const AMBER = "#815b17";
const MUTED = "#676254";
const LINE = "#e2dccb";

export const dynamicParams = false;

function toPath(slug: string[]) {
  return slug.join("/") === "home" ? "/" : `/${slug.join("/")}`;
}

export function generateStaticParams() {
  return Object.keys(PAGES).map((path) => ({
    slug: path === "/" ? ["home"] : path.slice(1).split("/"),
  }));
}

export async function GET(_req: Request, ctx: RouteContext<"/og/[...slug]">) {
  const { slug } = await ctx.params;
  const path = toPath(slug);
  const page = pageInfo(path);
  const headline = page.og ?? page.title;
  const kicker = path === "/" ? SITE_NAME : `${SITE_NAME} · ${page.label}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        padding: "72px 80px",
        fontFamily: "serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          fontSize: 24,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: AMBER,
          fontFamily: "monospace",
        }}
      >
        <svg width="46" height="46" viewBox="0 0 256 256" aria-hidden="true">
          <rect width="256" height="256" fill="black" />
          <path d="M128 127.5L49.25 193.751L49.25 61.2491L128 127.5Z" fill="white" />
          <path d="M128 127.5L206.75 61.2491V193.751L128 127.5Z" fill="white" />
        </svg>
        {kicker}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            fontSize: headline.length > 32 ? 76 : 96,
            lineHeight: 1.04,
            letterSpacing: -2,
            color: INK,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            lineHeight: 1.35,
            color: MUTED,
            maxWidth: 1000,
            fontFamily: "sans-serif",
          }}
        >
          {page.description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid ${LINE}`,
          paddingTop: 26,
          fontSize: 24,
          color: MUTED,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 26 }}>
          <span>Mail</span>
          <span>Calendar</span>
          <span>Drive</span>
          <span>Agent</span>
          <span>Workflows</span>
          <span>MCP</span>
        </div>
        <div style={{ display: "flex", color: INK, fontWeight: 600 }}>Open source · AGPL-3.0</div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
