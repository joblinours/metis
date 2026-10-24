import type { MetadataRoute } from "next";

import { PAGES } from "@/content/pages";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(PAGES).map(([path, page]) => ({
    url: absoluteUrl(path),
    lastModified: page.updated,
  }));
}
