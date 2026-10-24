"use client";

import { isToolUIPart, type UIMessage } from "ai";
import { CalendarDays, Mail } from "lucide-react";

import { hasReferences } from "@/ai/references";
import { TURN_PART_TYPE, turnEnvelopeSchema } from "@/ai/turn";

import { Message, MessageContent, MessageResponse } from "../ai-elements/message";
import { AgentToolCall, type ApprovalResponder } from "./agent-tool-call";
import { ReferenceText } from "./references/reference-text";
import { AttachmentChips } from "./turn-attachments";

function turnChips(data: unknown) {
  const envelope = turnEnvelopeSchema.safeParse(data).data;
  if (envelope?.kind === "mail" && envelope.emails.length > 0) {
    return {
      icon: Mail,
      chips: envelope.emails.map((e) => ({
        id: e.id,
        title: e.subject,
        subtitle: e.from,
      })),
    };
  }
  if (envelope?.kind === "calendar" && envelope.events.length > 0) {
    return {
      icon: CalendarDays,
      chips: envelope.events.map((e) => ({
        id: e.id,
        title: e.title,
        subtitle: e.calendarName,
      })),
    };
  }
  return null;
}

export function AgentChatMessage({
  message,
  onApproval,
}: {
  message: UIMessage;
  onApproval: ApprovalResponder;
}) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === TURN_PART_TYPE) {
            const turn = turnChips("data" in part ? part.data : undefined);
            if (!turn) return null;
            return (
              <AttachmentChips
                chips={turn.chips}
                className="mb-1.5"
                icon={turn.icon}
                // oxlint-disable-next-line react/no-array-index-key --message parts are append-only and stable in order
                key={`${message.id}-turn${index}`}
                variant="transcript"
              />
            );
          }
          if (part.type === "text") {
            if (message.role === "user" && hasReferences(part.text)) {
              return (
                <ReferenceText
                  // oxlint-disable-next-line react/no-array-index-key --message parts are append-only and stable in order
                  key={`${message.id}-t${index}`}
                  text={part.text}
                />
              );
            }
            return (
              // oxlint-disable-next-line react/no-array-index-key --message parts are append-only and stable in order
              <MessageResponse key={`${message.id}-t${index}`}>{part.text}</MessageResponse>
            );
          }
          if (isToolUIPart(part)) {
            return <AgentToolCall key={part.toolCallId} onApproval={onApproval} part={part} />;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
