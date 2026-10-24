"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Button } from "@metis/ui/components/button";
import { ComboboxChip } from "@metis/ui/components/combobox";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

export function RemovableChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ComboboxChip showRemove={false}>
      {children}
      <ComboboxPrimitive.ChipRemove
        aria-label={`Remove ${label}`}
        render={<Button variant="ghost" size="icon-xs" />}
        className="-ml-1 opacity-50 hover:opacity-100"
        data-slot="combobox-chip-remove"
      >
        <XIcon className="pointer-events-none" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxChip>
  );
}
