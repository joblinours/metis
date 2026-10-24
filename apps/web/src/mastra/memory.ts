import "server-only";
import { convertMessages, type MastraDBMessage } from "@mastra/core/agent/message-list";
import type { StorageThreadType } from "@mastra/core/memory";
import { Memory } from "@mastra/memory";

import { getLlm } from "@/services/llm";

import { storage } from "./storage";

export const workspaceMemory = new Memory({
  storage,
  options: {
    generateTitle: {
      model: () => getLlm().summary,
      instructions:
        "Write a title of at most six words naming what the user is trying to do. No quotes, no trailing punctuation, no prefix like 'Title:'.",
    },
  },
});

export async function createAssistantThread(
  owner: { userId: string; workspaceId: string },
  title?: string,
): Promise<StorageThreadType> {
  const draftTitle = title?.trim().slice(0, 80);
  return workspaceMemory.createThread({
    resourceId: owner.userId,
    metadata: draftTitle
      ? { workspaceId: owner.workspaceId, draftTitle }
      : { workspaceId: owner.workspaceId },
  });
}

export function assistantThreadTitle(thread: {
  title?: string;
  metadata?: Record<string, unknown>;
}): string {
  const draftTitle = thread.metadata?.draftTitle;
  return (
    thread.title?.trim() || (typeof draftTitle === "string" ? draftTitle.trim() : "") || "New chat"
  );
}

export async function listAssistantThreads(owner: {
  userId: string;
  workspaceId: string;
}): Promise<StorageThreadType[]> {
  const result = await workspaceMemory.listThreads({
    filter: {
      resourceId: owner.userId,
      metadata: { workspaceId: owner.workspaceId },
    },
    perPage: false,
  });
  return result.threads;
}

export async function assistantThreadTexts(
  userId: string,
  threadIds: string[],
): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  if (threadIds.length === 0) return texts;
  const memory = await storage.getStore("memory");
  if (!memory) return texts;
  const { messages } = await memory.listMessages({
    threadId: threadIds,
    resourceId: userId,
    perPage: false,
  });
  for (const message of messages) {
    if (!message.threadId) continue;
    const text = message.content.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join(" ");
    if (!text) continue;
    texts.set(message.threadId, `${texts.get(message.threadId) ?? ""} ${text}`.trim());
  }
  return texts;
}

export interface ExportedAssistantThread {
  thread: StorageThreadType;
  messages: unknown[];
}

export async function exportAssistantThreads(userId: string): Promise<ExportedAssistantThread[]> {
  const { threads } = await workspaceMemory.listThreads({
    filter: { resourceId: userId },
    perPage: false,
  });
  if (threads.length === 0) return [];
  const memory = await storage.getStore("memory");
  const byThread = new Map<string, MastraDBMessage[]>();
  if (memory) {
    const { messages } = await memory.listMessages({
      threadId: threads.map((thread) => thread.id),
      resourceId: userId,
      perPage: false,
      orderBy: { field: "createdAt", direction: "ASC" },
    });
    for (const message of messages) {
      if (!message.threadId) continue;
      const list = byThread.get(message.threadId) ?? [];
      list.push(message);
      byThread.set(message.threadId, list);
    }
  }
  return threads.map((thread) => ({
    thread,
    messages: convertMessages(byThread.get(thread.id) ?? []).to("AIV6.UI"),
  }));
}

export function ownsThread(
  thread: StorageThreadType,
  userId: string,
  workspaceId: string,
): boolean {
  return thread.resourceId === userId && thread.metadata?.workspaceId === workspaceId;
}

export async function deleteAssistantThreads(filter: {
  resourceId?: string;
  metadata?: { workspaceId: string };
}): Promise<void> {
  const { threads } = await workspaceMemory.listThreads({
    filter,
    perPage: false,
  });
  await Promise.all(threads.map((thread) => workspaceMemory.deleteThread(thread.id)));
}
