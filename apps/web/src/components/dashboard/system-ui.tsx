import { Badge } from "@metis/ui/components/badge";
import { cn } from "@metis/ui/lib/utils";

import type { DashboardSecret, SystemTone } from "@/server/schema";

export function SystemPageHeader({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="text-[11px] font-medium tracking-wide text-faint uppercase">{eyebrow}</p>
      )}
      <h1 className="flex items-center gap-2.5 font-serif text-[28px] font-medium tracking-tight text-foreground">
        {icon}
        {title}
      </h1>
      <p className="mt-1 text-[13px] text-faint">{description}</p>
    </div>
  );
}

export function Section({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-faint">{description}</p>}
        </div>
        {badge}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Sections({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[13px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] text-foreground">{children}</span>
    </div>
  );
}

export function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[12px]">{children}</span>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] text-faint">{children}</p>;
}

export function NotSet() {
  return <Badge variant="outline">Not set</Badge>;
}

export function Secret({ secret }: { secret: DashboardSecret }) {
  if (!secret.set) return <NotSet />;
  return (
    <span className="inline-flex items-center gap-2">
      <ToneBadge tone="ok">Set</ToneBadge>
      {secret.hint && <Mono>…{secret.hint}</Mono>}
    </span>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return value ? <Badge variant="secondary">Yes</Badge> : <Badge variant="outline">No</Badge>;
}

const TONE_CLASS: Record<SystemTone, string> = {
  ok: "border-status-success/30 text-status-success",
  neutral: "",
  warning: "border-brand/30 bg-brand-soft text-brand-text",
  danger: "",
  off: "text-faint",
};

export function ToneBadge({ tone, children }: { tone: SystemTone; children: React.ReactNode }) {
  return (
    <Badge variant={tone === "danger" ? "destructive" : "outline"} className={cn(TONE_CLASS[tone])}>
      {children}
    </Badge>
  );
}

export function Count({
  value,
  singular,
  plural,
}: {
  value: number;
  singular: string;
  plural: string;
}) {
  return (
    <Badge variant="outline">
      {value} {value === 1 ? singular : plural}
    </Badge>
  );
}

export function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-[12px] underline-offset-4 hover:underline"
    >
      {href}
    </a>
  );
}
