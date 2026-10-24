"use client";

import { Alert, AlertDescription, AlertTitle } from "@metis/ui/components/alert";
import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmailFrame } from "@/components/email-frame";
import type { MessageBody } from "@/hooks/use-email-detail";
import type { RenderedEmail } from "@/mail/render/pipeline";
import type { RemoteImages } from "@/mail/render/types";
import type { RemoteAllowInput } from "@/server/schema";
import { senderDomain, useMailPrivacyStore } from "@/store/mail-privacy-store";

function RemoteContentBanner({
  count,
  sender,
  messageId,
  proxied,
}: {
  count: number;
  sender: string;
  messageId: string;
  proxied: boolean;
}) {
  const loadOnce = useMailPrivacyStore((s) => s.loadOnce);
  const allowRemote = useMailPrivacyStore((s) => s.allowRemote);
  const [busy, setBusy] = useState(false);
  const address = sender.trim().toLowerCase();
  const domain = senderDomain(address);

  async function trust(input: RemoteAllowInput) {
    setBusy(true);
    try {
      await allowRemote(input);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that choice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert className="mb-3 bg-surface">
      <ImageOff />
      <AlertTitle className="text-[13px]">
        {count} remote {count === 1 ? "image" : "images"} blocked
      </AlertTitle>
      <AlertDescription className="text-[12px]">
        <p>
          Remote images can tell the sender when and where you opened this message.
          {proxied &&
            " They load through this server, which hides your address but not the open itself."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" disabled={busy} onClick={() => loadOnce(messageId)}>
            Load images
          </Button>
          {address.includes("@") && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => trust({ kind: "address", value: address })}
            >
              Always from {address}
            </Button>
          )}
          {domain && (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={() => trust({ kind: "domain", value: domain })}
            >
              Always from {domain}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function MessageContent({
  body,
  rendered,
  images,
  proxyEndpoint,
  sender,
  messageId,
  title,
  className,
  frameClassName,
  textClassName,
}: {
  body: MessageBody | null;
  rendered: RenderedEmail | null;
  images: RemoteImages;
  proxyEndpoint: string | null;
  sender: string;
  messageId: string;
  title?: string;
  className?: string;
  frameClassName?: string;
  textClassName?: string;
}) {
  const [blocked, setBlocked] = useState(0);
  const countKey = `${messageId} ${images}`;
  const [countFor, setCountFor] = useState(countKey);
  const loadOnce = useMailPrivacyStore((s) => s.loadOnce);

  if (countFor !== countKey) {
    setCountFor(countKey);
    setBlocked(0);
  }

  if (!body) return null;
  if (body.kind === "error") {
    return <p className="text-sm italic text-faint">Could not load this message.</p>;
  }
  if (body.kind === "empty") {
    return <p className="text-sm italic text-faint">No content</p>;
  }
  if (body.kind === "text") {
    return (
      <div
        className={cn("whitespace-pre-wrap wrap-break-word text-muted-foreground", textClassName)}
      >
        {body.text}
      </div>
    );
  }
  if (!rendered) {
    return (
      <div className={cn("space-y-3", frameClassName)}>
        {[90, 75, 82].map((w) => (
          <div key={w} className="h-4 animate-pulse rounded bg-hover" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  const blockedCount = rendered.remoteImages + blocked;
  return (
    <div className={className}>
      {images === "block" && blockedCount > 0 && (
        <RemoteContentBanner
          count={blockedCount}
          sender={sender}
          messageId={messageId}
          proxied={proxyEndpoint !== null}
        />
      )}
      <EmailFrame
        key={messageId}
        title={title}
        html={rendered.html}
        images={images}
        proxyEndpoint={proxyEndpoint}
        adaptive={rendered.adaptive}
        className={frameClassName}
        onBlockedImages={images === "block" ? (urls) => setBlocked(urls.size) : undefined}
        onLoadImages={images === "block" ? () => loadOnce(messageId) : undefined}
      />
    </div>
  );
}
