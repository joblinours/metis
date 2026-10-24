import type { ReactNode } from "react";

export function PageHead({
  kicker,
  title,
  text,
  children,
}: {
  kicker: string;
  title: ReactNode;
  text: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="px-[var(--gx)] pb-10 pt-[calc(var(--nav)+72px)]">
      <div className="mx-auto max-w-[1280px]">
        <p className="label text-ink-2">{kicker}</p>
        <h1 className="display mt-5 max-w-[15ch] text-[clamp(52px,7vw,112px)]">{title}</h1>
        <p className="prose-lede mt-6 max-w-[38rem]">{text}</p>
        {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}
