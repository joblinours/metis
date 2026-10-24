import { net, type Session } from "electron";
import { z } from "zod";

export interface JsonResponse {
  status: number;
  json: unknown;
}

export function requestJson(
  session: Session,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method,
      url,
      session,
      credentials: "include",
      origin: new URL(url).origin,
      redirect: "error",
    });
    request.setHeader("Accept", "application/json");
    if (body !== undefined) {
      request.setHeader("Content-Type", "application/json");
    }

    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        resolve({ status: response.statusCode, json });
      });
    });
    request.on("error", reject);

    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
  });
}

const errorSchema = z.object({ message: z.string() });

export function errorMessage(response: JsonResponse, fallback: string): string {
  return errorSchema.safeParse(response.json).data?.message ?? fallback;
}
