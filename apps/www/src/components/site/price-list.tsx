import { ArrowUpRight, Check } from "lucide-react";

import { PLANS } from "@/content/pricing";
import { DOCS_URL } from "@/lib/site";

import { Button } from "./button";

export function PriceList() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] pb-24 pt-[calc(var(--nav)+72px)] md:pb-32">
      <div className="mx-auto max-w-[1200px]">
        <h1 data-reveal className="display max-w-[14ch] text-[clamp(52px,7vw,116px)]">
          Free on yours. <em>Fair on ours.</em>
        </h1>
        <p data-reveal className="prose-lede mt-6 max-w-[36rem]">
          Self-hosting costs nothing and never will. Metis Cloud runs the same release in an
          isolated instance for each customer, so you get the whole suite without running a server.
        </p>

        <div className="mt-16 grid border-t border-line lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <article
              key={p.id}
              data-reveal
              className={`flex flex-col border-b border-line py-10 lg:border-b-0 lg:px-10 lg:py-12 ${i > 0 ? "lg:border-l" : "lg:pl-0"} ${i === PLANS.length - 1 ? "lg:pr-0" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="label text-ink-2">{p.audience}</p>
                {p.featured ? (
                  <span className="label rounded-full bg-amber-soft px-2.5 py-1 !text-[10.5px] text-amber-text">
                    Available now
                  </span>
                ) : null}
              </div>
              <h2 className="display mt-6 text-[44px]">{p.name}</h2>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="display text-[76px] leading-none">{p.price}</span>
                <span className="text-[14px] text-ink-2">{p.unit}</span>
              </div>
              {p.billing ? <p className="mt-3 text-[14px] text-ink-2">{p.billing}</p> : null}
              <p className="mt-3 text-[14px] text-ink-3">{p.note}</p>
              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[15.5px] text-ink">
                    <Check
                      className="mt-0.5 size-[18px] shrink-0 text-amber-text"
                      strokeWidth={2}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-10">
                <Button href={p.cta.href} tone={p.featured ? "primary" : "ghost"} external>
                  {p.cta.label}
                </Button>
              </div>
            </article>
          ))}
        </div>

        <div
          data-reveal
          className="mt-6 flex flex-col items-start gap-6 rounded-[28px] bg-panel p-8 md:flex-row md:items-center md:justify-between md:p-10"
        >
          <div>
            <h2 className="display text-[34px]">
              Self-host, <em>free forever.</em>
            </h2>
            <p className="mt-2 max-w-[42rem] text-[15.5px] text-ink-2">
              Every tool in the suite, the agent included, on a server you own. AGPL-3.0, with
              unlimited workspaces and mailboxes and your own model.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Button href="/self-host" tone="ghost">
              Self-host it
            </Button>
            <a
              href={`${DOCS_URL}/self-hosting`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1 px-2 text-[16px] font-medium text-amber-text"
            >
              Read the docs
              <ArrowUpRight
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
