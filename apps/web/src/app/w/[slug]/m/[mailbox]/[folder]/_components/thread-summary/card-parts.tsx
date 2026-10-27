"use client";

import { Button, buttonVariants } from "@metis/ui/components/button";
import { Spinner } from "@metis/ui/components/spinner";
import { cn } from "@metis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Copy, ExternalLink, type LucideIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { toast } from "sonner";

export function CardShell({
  icon: Icon,
  label,
  aside,
  children,
}: {
  icon: LucideIcon;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="@container rounded-lg border border-primary/22 bg-primary/8 px-3.5 py-3 wrap-anywhere">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="size-3.5 text-primary" />
        <span className="text-[10px] font-medium uppercase tracking-[1.5px] text-primary">
          {label}
        </span>
        {aside && <div className="ml-auto flex items-center">{aside}</div>}
      </div>
      {children}
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-medium leading-relaxed text-foreground">{children}</p>;
}

const detailsVariants = cva("mt-2 grid grid-cols-1 gap-x-4 gap-y-2", {
  variants: {
    columns: {
      one: "",
      two: "@md:grid-cols-2",
    },
  },
  defaultVariants: { columns: "one" },
});

export function Details({
  columns,
  children,
}: VariantProps<typeof detailsVariants> & { children: ReactNode }) {
  return <div className={detailsVariants({ columns })}>{children}</div>;
}

export function Detail({
  icon: Icon,
  label,
  wide,
  children,
}: {
  icon: LucideIcon;
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 gap-2", wide && "@md:col-span-2")}>
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary/80" />
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-[1px] text-faint">{label}</div>
        <div className="break-words text-[12px] leading-snug text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

const INTENT_VARIANTS = {
  primary: "default",
  secondary: "tinted",
  quiet: "ghost",
} as const;

export type CardActionIntent = keyof typeof INTENT_VARIANTS;

export const cardLabelClassName = buttonVariants({
  variant: INTENT_VARIANTS.secondary,
  size: "sm",
});

export function CardAction({
  intent = "secondary",
  icon: Icon,
  loading = false,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  intent?: CardActionIntent;
  icon?: LucideIcon;
  loading?: boolean;
}) {
  return (
    <Button {...props} disabled={disabled || loading} variant={INTENT_VARIANTS[intent]} size="sm">
      {loading ? <Spinner /> : Icon && <Icon />}
      {children}
    </Button>
  );
}

export function CardLink({
  href,
  intent,
  icon = ExternalLink,
  children,
}: {
  href: string;
  intent?: CardActionIntent;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const external = /^https?:/i.test(href);
  return (
    <CardAction
      intent={intent}
      icon={icon}
      nativeButton={false}
      render={
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- Base UI renders the CardAction children inside this anchor
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        />
      }
    >
      {children}
    </CardAction>
  );
}

export function CopyButton({
  text,
  label,
  intent,
}: {
  text: string;
  label: string;
  intent?: CardActionIntent;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <CardAction
      intent={intent}
      icon={copied ? Check : Copy}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Couldn't copy to the clipboard"),
        );
      }}
    >
      {copied ? "Copied" : label}
    </CardAction>
  );
}
