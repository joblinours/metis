import { z } from "zod";

export interface JsonResponse {
  status: number;
  json: unknown;
}

export async function requestJson(
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<JsonResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: new URL(url).origin,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method,
    headers,
    credentials: "include",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const errorSchema = z.object({ message: z.string() });

export function errorMessage(response: JsonResponse, fallback: string): string {
  return errorSchema.safeParse(response.json).data?.message ?? fallback;
}
