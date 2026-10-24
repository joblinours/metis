import type { Metadata } from "next";

import { fullTitle, ogPath, pageInfo } from "@/content/pages";

import { ORG_X_HANDLE, SITE_NAME } from "./site";

export function pageMetadata(path: string): Metadata {
  const page = pageInfo(path);
  const title = fullTitle(page);
  const image = { url: ogPath(path), width: 1200, height: 630, alt: title };
  return {
    title: page.absolute ? { absolute: page.title } : page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title,
      description: page.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: ORG_X_HANDLE,
      title,
      description: page.description,
      images: [image],
    },
  };
}
