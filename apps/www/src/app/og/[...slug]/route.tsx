import { ImageResponse } from "next/og";

import { PAGES, pageInfo } from "@/content/pages";
import { SITE_NAME } from "@/lib/site";

const INK = "#2a2620";
const BG = "#faf8f3";
const AMBER = "#815b17";
const MUTED = "#676254";
const LINE = "#e2dccb";

const NAV = ["Mail", "Calendar", "Drive", "Agent", "Workflows", "MCP"];
const LICENSE_LINE = "Open source · AGPL-3.0";

export const dynamicParams = false;

async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
  if (!src) throw new Error(`[og] no font file for ${family} ${weight}`);
  return (await fetch(src)).arrayBuffer();
}

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
  const [display, sans, sansBold, mono] = await Promise.all([
    googleFont("Cormorant Garamond", 500, headline),
    googleFont("DM Sans", 400, `${page.description}${NAV.join("")}`),
    googleFont("DM Sans", 600, LICENSE_LINE),
    googleFont("DM Mono", 400, kicker.toUpperCase()),
  ]);

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
        fontFamily: "Cormorant Garamond",
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
          fontFamily: "DM Mono",
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
            fontWeight: 500,
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
            fontFamily: "DM Sans",
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
          fontFamily: "DM Sans",
        }}
      >
        <div style={{ display: "flex", gap: 26 }}>
          {NAV.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div style={{ display: "flex", color: INK, fontWeight: 600 }}>{LICENSE_LINE}</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Cormorant Garamond", data: display, weight: 500, style: "normal" },
        { name: "DM Sans", data: sans, weight: 400, style: "normal" },
        { name: "DM Sans", data: sansBold, weight: 600, style: "normal" },
        { name: "DM Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
