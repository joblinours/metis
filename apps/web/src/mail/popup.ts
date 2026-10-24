import { orpc } from "@/lib/orpc";
import type { MailboxScope } from "@/server/schema";
import type { Email } from "@/types/mail";

import { buildFrameDocument } from "./render/frame";
import type { RemoteImages } from "./render/types";

const ESC_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
};

function escapeHtml(s: string): string {
  return s.replace(/[<>&]/g, (c) => ESC_MAP[c] ?? c);
}

export function printEmail(
  email: Email,
  renderedHtml: string,
  remote: { images: RemoteImages; proxyEndpoint: string | null },
): void {
  if (typeof window === "undefined") return;

  const subject = email.subject || "(no subject)";
  const safeSubject = escapeHtml(subject);
  const safeFrom = escapeHtml(email.fromName ? `${email.fromName} <${email.from}>` : email.from);
  const safeTo = escapeHtml(email.to.join(", "));
  const dateStr = escapeHtml(new Date(email.date).toLocaleString());

  const header = `<div style="font-family:system-ui,sans-serif;color:#111;border-bottom:1px solid #e5e5e5;padding-bottom:16px;margin-bottom:24px">
      <h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 12px">${safeSubject}</h1>
      <div style="font-size:12px;color:#555;margin:2px 0"><strong>From:</strong> ${safeFrom}</div>
      ${safeTo ? `<div style="font-size:12px;color:#555;margin:2px 0"><strong>To:</strong> ${safeTo}</div>` : ""}
      <div style="font-size:12px;color:#555;margin:2px 0"><strong>Date:</strong> ${dateStr}</div>
    </div>`;

  const html = buildFrameDocument(
    `<div style="padding:0 40px 40px">${renderedHtml || "<em>No content</em>"}</div>`,
    {
      images: remote.images,
      proxyEndpoint: remote.proxyEndpoint,
      adaptive: false,
      theme: "light",
      print: true,
      title: subject,
      header: `<div style="padding:40px 40px 0">${header}</div>`,
    },
  );

  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) {
    window.alert("Allow pop-ups for this site to print.");
    return;
  }
  w.document.write(html);
  w.document.close();
  const print = () => setTimeout(() => w.print(), 200);
  if (w.document.readyState === "complete") print();
  else w.addEventListener("load", print, { once: true });
}

export async function viewOriginalEmail(email: Email, scope: MailboxScope): Promise<void> {
  if (typeof window === "undefined") return;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    window.alert("Allow pop-ups for this site to view the original message.");
    return;
  }
  w.document.write(
    `<!doctype html><html><body style="font-family:monospace;padding:20px;color:#333;"><p>Loading raw message…</p></body></html>`,
  );
  w.document.close();

  try {
    const { raw: text } = await orpc.mail.messages.getRaw({
      ...scope,
      id: email.id,
    });
    const escaped = escapeHtml(text);
    w.document.body.innerHTML = `<pre style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:#222;margin:0;padding:24px;">${escaped}</pre>`;
    w.document.title = `Original — ${email.subject || "(no subject)"}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load raw message";
    w.document.body.innerHTML = `<div style="font-family:ui-sans-serif;color:#c00;padding:20px;">Could not load the raw message: ${msg}</div>`;
  }
}
