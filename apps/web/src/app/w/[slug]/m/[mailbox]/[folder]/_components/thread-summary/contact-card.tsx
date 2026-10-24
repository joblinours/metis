"use client";

import { Download, Globe, Mail, MapPin, Phone, StickyNote, UserRound } from "lucide-react";

import type { SummaryCardProps } from "@/mail/summary-catalog";

import {
  Actions,
  CardAction,
  CardLink,
  CardShell,
  CopyButton,
  Detail,
  Details,
  Title,
} from "./card-parts";
import { directionsUrl } from "./format";

type ContactProps = SummaryCardProps<"Contact">;

function escapeVcard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toVcard(props: ContactProps): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcard(props.name)}`];
  if (props.organization) lines.push(`ORG:${escapeVcard(props.organization)}`);
  if (props.title) lines.push(`TITLE:${escapeVcard(props.title)}`);
  for (const email of props.emails) lines.push(`EMAIL:${escapeVcard(email)}`);
  for (const phone of props.phones) lines.push(`TEL:${escapeVcard(phone)}`);
  for (const address of props.addresses) {
    lines.push(`ADR:;;${escapeVcard(address)};;;;`);
  }
  if (props.websiteUrl) lines.push(`URL:${props.websiteUrl}`);
  if (props.note) lines.push(`NOTE:${escapeVcard(props.note)}`);
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

function downloadVcard(props: ContactProps) {
  const blob = new Blob([toVcard(props)], { type: "text/vcard" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${props.name.replace(/[^\w .-]+/g, "").trim() || "contact"}.vcf`;
  link.click();
  URL.revokeObjectURL(href);
}

export function ContactCard({ props }: { props: ContactProps }) {
  const role = [props.title, props.organization].filter(Boolean).join(" · ");
  const [email] = props.emails;
  const [phone] = props.phones;
  const directions = directionsUrl(props.addresses[0]);
  return (
    <CardShell icon={UserRound} label="Contact">
      <Title>{props.name}</Title>
      {role && <p className="text-[12px] text-muted-foreground">{role}</p>}
      <Details columns="two">
        {props.emails.length > 0 && (
          <Detail icon={Mail} label="Email">
            {props.emails.join(", ")}
          </Detail>
        )}
        {props.phones.length > 0 && (
          <Detail icon={Phone} label="Phone">
            {props.phones.join(", ")}
          </Detail>
        )}
        {props.addresses.map((address) => (
          <Detail key={address} icon={MapPin} label="Address" wide>
            {address}
          </Detail>
        ))}
        {props.note && (
          <Detail icon={StickyNote} label="Note" wide>
            {props.note}
          </Detail>
        )}
      </Details>
      <Actions>
        <CardAction intent="primary" icon={Download} onClick={() => downloadVcard(props)}>
          Save contact
        </CardAction>
        {email && (
          <CardLink href={`mailto:${email}`} icon={Mail}>
            Email
          </CardLink>
        )}
        {email && <CopyButton text={email} label="Copy email" />}
        {phone && (
          <CardLink href={`tel:${phone.replace(/[^\d+]/g, "")}`} icon={Phone}>
            Call
          </CardLink>
        )}
        {props.websiteUrl && (
          <CardLink href={props.websiteUrl} icon={Globe}>
            Website
          </CardLink>
        )}
        {directions && (
          <CardLink href={directions} icon={MapPin}>
            Directions
          </CardLink>
        )}
      </Actions>
    </CardShell>
  );
}
