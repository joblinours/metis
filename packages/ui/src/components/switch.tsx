"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@metis/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const switchVariants = cva(
  "peer inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-5 w-9",
        md: "h-7 w-[3.25rem]",
      },
      tone: {
        brand: "data-checked:bg-primary data-unchecked:bg-border",
        success: "data-checked:bg-status-success/25 data-unchecked:bg-border",
      },
    },
    defaultVariants: { size: "default", tone: "brand" },
  },
);

const thumbVariants = cva(
  "pointer-events-none flex items-center justify-center rounded-full shadow-sm ring-0 transition-all duration-200 ease-out",
  {
    variants: {
      size: {
        default: "size-4 data-checked:translate-x-4 data-unchecked:translate-x-0.5",
        md: "size-6 data-checked:translate-x-6 data-unchecked:translate-x-0.5",
      },
      tone: {
        brand: "bg-background",
        success:
          "data-checked:bg-status-success data-checked:text-background data-unchecked:bg-surface data-unchecked:text-faint",
      },
    },
    defaultVariants: { size: "default", tone: "brand" },
  },
);

function Switch({
  className,
  size,
  tone,
  children,
  ...props
}: SwitchPrimitive.Root.Props & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(switchVariants({ size, tone, className }))}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className={cn(thumbVariants({ size, tone }))}>
        {children}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
