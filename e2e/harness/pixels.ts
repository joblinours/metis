const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) =>
  c.charCodeAt(0),
);

interface PixelHit {
  path: string;
  at: string;
  referer: string | null;
  userAgent: string | null;
}

const hits: PixelHit[] = [];

export function pixelRoutes() {
  return {
    "/pixel/*": (req: Request) => {
      const url = new URL(req.url);
      hits.push({
        path: `${url.pathname.slice("/pixel".length)}${url.search}`,
        at: new Date().toISOString(),
        referer: req.headers.get("referer"),
        userAgent: req.headers.get("user-agent"),
      });
      return new Response(GIF, {
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" },
      });
    },
    "/pixel-hits": {
      GET: () => Response.json(hits),
      DELETE: () => {
        hits.length = 0;
        return new Response(null, { status: 204 });
      },
    },
  };
}
