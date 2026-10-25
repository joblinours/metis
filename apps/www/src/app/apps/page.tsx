import { ArrowUpRight, Download } from "lucide-react";

import { PageJsonLd } from "@/components/json-ld";
import { Button } from "@/components/site/button";
import { FeatureArea } from "@/components/site/feature-area";
import { PageHead } from "@/components/site/page-head";
import { CHECKSUMS, DOWNLOADS, latestUrl } from "@/content/downloads";
import { pageMetadata } from "@/lib/metadata";
import { DOCS_URL } from "@/lib/site";

export const metadata = pageMetadata("/apps");

const INSTALL_URL = `${DOCS_URL}/guide/apps/download`;

export default function AppsPage() {
  return (
    <>
      <PageJsonLd path="/apps" />
      <PageHead
        kicker="Apps"
        title={
          <>
            Desktop and Android, <em>one suite.</em>
          </>
        }
        text="Use Metis Suite in its own window on macOS, Windows and Linux, or on your Android phone. Every app works with any Metis Suite server: enter its address the first time you open it, then sign in through your browser."
      >
        <Button href="#downloads" kind="internal">
          Download the apps
        </Button>
        <Button href={INSTALL_URL} tone="ghost" kind="external">
          Install guide
        </Button>
      </PageHead>
      <FeatureArea area="apps" link={false} />
      <section
        id="downloads"
        className="relative z-[6] scroll-mt-[var(--nav)] border-t border-line bg-bg px-[var(--gx)] py-24 md:py-32"
      >
        <div className="mx-auto max-w-[1280px]">
          <h2 className="display max-w-[18ch] text-[clamp(40px,4.6vw,72px)]">
            Download <em>the apps.</em>
          </h2>
          <p className="prose-lede mt-5 max-w-[40rem]">
            Free for everyone. Every link gives the newest release, so pick your system, download,
            and open the app.
          </p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[22px] border border-line bg-line md:grid-cols-2">
            {DOWNLOADS.map((platform) => (
              <div key={platform.name} className="flex flex-col bg-bg p-6 sm:p-8">
                <h3 className="display text-[36px]">{platform.name}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{platform.note}</p>
                <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                  {platform.files.map((d) => (
                    <li key={d.file}>
                      <a
                        href={latestUrl(platform.app, d.file)}
                        download
                        className="group flex h-12 items-center justify-between gap-3 rounded-full border border-line px-5 text-[15px] transition-colors hover:border-ink/40"
                      >
                        <span className="font-medium text-ink">
                          {d.label} <span className="font-normal text-ink-2">{d.format}</span>
                        </span>
                        <Download
                          className="size-4 text-amber-text transition-transform group-hover:translate-y-0.5"
                          strokeWidth={2}
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[15px]">
            <a
              href={INSTALL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 font-medium text-amber-text"
            >
              How to install
              <ArrowUpRight
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </a>
            {CHECKSUMS.map((c) => (
              <a
                key={c.app}
                href={latestUrl(c.app, "SHA256SUMS")}
                className="group inline-flex items-center gap-1 font-medium text-amber-text"
              >
                {c.label}
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
