import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-medium transition-[background-color,border-color,color,transform] duration-300";

const TONES = {
  primary: "bg-amber-glow text-[#1b1408] hover:bg-[#d59e35]",
  ink: "bg-ink text-bg hover:bg-[#3a352d]",
  ghost: "border border-line text-ink hover:border-ink/40",
  night: "border border-white/15 text-bone hover:border-white/40",
} as const;

export function Button({
  children,
  tone = "primary",
  className = "",
  ...link
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
} & ({ href: Route; external?: false } | { href: string; external: true })) {
  const cls = `${BASE} ${TONES[tone]} ${className}`;
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={link.href} className={cls}>
      {children}
    </Link>
  );
}
