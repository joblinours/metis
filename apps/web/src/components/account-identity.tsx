import { cva, type VariantProps } from "class-variance-authority";

import { providerLine } from "@/components/provider-meta";

const emailVariants = cva("truncate", {
  variants: {
    size: {
      row: "text-[13px] font-medium text-foreground",
      trigger: "text-[12px] font-medium text-foreground",
      compact: "text-[12px]",
    },
  },
  defaultVariants: { size: "row" },
});

const lineVariants = cva("truncate text-faint", {
  variants: {
    size: {
      row: "text-[11px]",
      trigger: "text-[10px]",
      compact: "text-[10px]",
    },
  },
  defaultVariants: { size: "row" },
});

export function AccountIdentity({
  email,
  label,
  server,
  detail,
  size,
}: VariantProps<typeof emailVariants> & {
  email: string;
  label: string;
  server: string | null;
  detail?: string;
}) {
  const line = providerLine(label, server);
  return (
    <div className="min-w-0 flex-1">
      <div className={emailVariants({ size })}>{email}</div>
      <div className={lineVariants({ size })}>{detail ? `${line} · ${detail}` : line}</div>
    </div>
  );
}
