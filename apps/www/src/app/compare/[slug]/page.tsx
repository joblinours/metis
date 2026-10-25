import { ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";

import { PageJsonLd } from "@/components/json-ld";
import { Button } from "@/components/site/button";
import { PageHead } from "@/components/site/page-head";
import { StartActions } from "@/components/site/start-actions";
import { type Cell, COMPETITORS, METIS, ROWS } from "@/content/compare";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT_EMAIL } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata(props: PageProps<"/compare/[slug]">) {
  const { slug } = await props.params;
  return pageMetadata(`/compare/${slug}`);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function CellText({ cell }: { cell: Cell }) {
  return (
    <>
      {cell.text}
      {cell.source ? (
        <>
          {" "}
          <a
            href={cell.source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-[13px] text-amber-text underline-offset-2 hover:underline"
          >
            Source
            <ArrowUpRight className="size-3" strokeWidth={2} />
          </a>
        </>
      ) : null}
    </>
  );
}

export default async function CompareCompetitorPage(props: PageProps<"/compare/[slug]">) {
  const { slug } = await props.params;
  const c = COMPETITORS.find((x) => x.slug === slug);
  if (!c) notFound();
  const checked = formatDate(c.checked);

  return (
    <>
      <PageJsonLd path={`/compare/${c.slug}`} />
      <PageHead
        kicker="Compare"
        title={
          <>
            Metis Suite <em>vs {c.name}</em>
          </>
        }
        text={c.answer}
      >
        <StartActions />
      </PageHead>

      <section className="px-[var(--gx)] pb-20">
        <div className="mx-auto max-w-[1280px]">
          <p className="label text-ink-3">
            {c.name} facts checked on {checked}
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-t border-line text-left md:min-w-[720px]">
              <caption className="sr-only">Metis Suite compared with {c.name}</caption>
              <thead className="max-md:sr-only">
                <tr className="border-b border-line">
                  <th scope="col" className="w-[18%] py-5">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="display w-[41%] py-5 pr-6 text-[28px]">
                    Metis Suite
                  </th>
                  <th scope="col" className="display py-5 text-[28px]">
                    {c.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className="grid grid-cols-2 gap-x-4 border-b border-line py-5 align-top md:table-row md:py-0"
                  >
                    <th
                      scope="row"
                      className="col-span-2 pb-3 text-[15px] font-medium text-ink md:table-cell md:py-5 md:pr-6"
                    >
                      {row.label}
                    </th>
                    <td className="text-[15px] leading-relaxed text-ink md:table-cell md:py-5 md:pr-6">
                      <span className="label mb-1.5 block text-ink-3 md:hidden">Metis Suite</span>
                      <CellText cell={METIS[row.key]} />
                    </td>
                    <td className="text-[15px] leading-relaxed text-ink-2 md:table-cell md:py-5">
                      <span className="label mb-1.5 block text-ink-3 md:hidden">{c.name}</span>
                      <CellText cell={c.cells[row.key]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-2">
            <div>
              <h2 className="display text-[34px]">
                Choose <em>{c.name}</em> if
              </h2>
              <p className="mt-3 max-w-[36rem] text-[16px] leading-relaxed text-ink-2">
                {c.pickThem}
              </p>
            </div>
            <div>
              <h2 className="display text-[34px]">
                Choose <em>Metis Suite</em> if
              </h2>
              <p className="mt-3 max-w-[36rem] text-[16px] leading-relaxed text-ink-2">
                {c.pickUs}
              </p>
            </div>
          </div>

          <p className="mt-14 max-w-[48rem] text-[14px] leading-relaxed text-ink-3">
            {c.name} is made by {c.maker}. Every fact about it on this page comes from its own
            website, documentation or source code, as linked, and was checked on {checked}. Products
            change: if something here is out of date, write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and we will correct it. All trademarks belong to their owners.
          </p>
          <div className="mt-8">
            <Button href="/compare" tone="ghost" kind="internal">
              All comparisons
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
