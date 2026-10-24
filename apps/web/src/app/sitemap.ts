import type { MetadataRoute } from "next";

import { config } from "@/config";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${config.auth.url}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${config.auth.url}/forgot-password`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
