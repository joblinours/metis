import type { MetadataRoute } from "next";

import { config } from "@/config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/forgot-password"],
      disallow: [
        "/w",
        "/settings",
        "/dashboard",
        "/api",
        "/rpc",
        "/2fa",
        "/invite",
        "/reset-password",
      ],
    },
    sitemap: `${config.auth.url}/sitemap.xml`,
  };
}
