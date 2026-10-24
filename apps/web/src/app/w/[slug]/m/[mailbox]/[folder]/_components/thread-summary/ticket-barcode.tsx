"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import { CopyButton } from "./card-parts";

type Barcode = NonNullable<SummaryCardProps<"Reservation">["barcode"]>;

export function TicketBarcode({ barcode }: { barcode: Barcode }) {
  const [qr, setQr] = useState<{ value: string; url: string } | null>(null);
  const isQr = barcode.format === "qr";
  const dataUrl = isQr && qr?.value === barcode.value ? qr.url : null;

  useEffect(() => {
    if (!isQr) return;
    QRCode.toDataURL(barcode.value, { width: 176, margin: 1 }).then(
      (url) => setQr({ value: barcode.value, url }),
      () => setQr(null),
    );
  }, [isQr, barcode.value]);

  if (isQr && dataUrl) {
    return (
      <div className="mt-2.5 inline-flex rounded-md bg-white p-1.5">
        {/* oxlint-disable-next-line nextjs/no-img-element --qr code is a data URL; next/image adds no value here */}
        <img src={dataUrl} alt="Ticket QR code" className="size-44" />
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
        {barcode.format.toUpperCase()} · {barcode.value}
      </span>
      <CopyButton text={barcode.value} label="Copy ticket code" />
    </div>
  );
}
