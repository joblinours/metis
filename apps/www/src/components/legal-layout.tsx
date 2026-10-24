import type { ReactNode } from "react";

import { PageJsonLd } from "./json-ld";

export function LegalLayout({
  path,
  title,
  lastUpdated,
  intro,
  children,
}: {
  path: string;
  title: string;
  lastUpdated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[760px] px-[var(--gx)] pb-28 pt-[calc(var(--nav)+72px)]">
      <PageJsonLd path={path} />
      <h1 className="display text-[clamp(44px,6vw,76px)]">{title}</h1>
      <p className="label mt-5 text-ink-3">Last updated: {lastUpdated}</p>
      <p className="prose-lede mt-8">{intro}</p>
      <div className="mt-10 flex flex-col gap-4 text-[16px] leading-[1.75] text-ink-2 [&_a]:text-amber-text [&_a]:underline [&_h2]:mt-8 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-[30px] [&_h2]:font-medium [&_h2]:leading-tight [&_h2]:text-ink [&_h3]:mt-2 [&_h3]:font-medium [&_h3]:text-ink [&_li]:mb-2 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
