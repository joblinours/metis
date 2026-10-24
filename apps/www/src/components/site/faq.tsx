import { Plus } from "lucide-react";
import Link from "next/link";

import { FAQ_ITEMS } from "@/lib/faq";

import { FaqJsonLd } from "../json-ld";

export function Faq() {
  return (
    <section className="relative z-[6] bg-bg px-[var(--gx)] pb-28 md:pb-40">
      <FaqJsonLd />
      <div className="mx-auto grid max-w-[1200px] gap-12 border-t border-line pt-20 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 data-reveal className="display text-[clamp(44px,5vw,80px)]">
          Questions, <em>answered.</em>
        </h2>
        <div className="border-t border-line">
          {FAQ_ITEMS.map((f) => (
            <details key={f.question} data-reveal className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[19px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                {f.question}
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line transition-transform duration-300 group-open:rotate-45">
                  <Plus className="size-4" strokeWidth={1.75} />
                </span>
              </summary>
              <p className="max-w-[60ch] pb-7 text-[16px] leading-relaxed text-ink-2">
                {f.answer}
                {f.link ? (
                  <>
                    {" "}
                    <Link
                      href={f.link.href}
                      className="font-medium text-amber-text underline-offset-2 hover:underline"
                    >
                      {f.link.label}
                    </Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
