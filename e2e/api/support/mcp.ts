import type { Client } from "@modelcontextprotocol/client";
import { z } from "zod";

import { harness } from "../../clients/harness";
import { connect, MODERN, toolText } from "../../clients/mcp";
import type { OwnerClient } from "../../lib/mcp-clients";

const REQUESTS_PER_MINUTE = 50;
const WINDOW_MS = 60_000;

export interface ToolResult {
  isError: boolean;
  text: string;
  json: Record<string, unknown>;
}

export interface ListedTool {
  name: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
}

export interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minLength?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  pattern?: string;
  default?: unknown;
}

const jsonSchemaSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    type: z.union([z.string(), z.array(z.string())]).optional(),
    enum: z.array(z.unknown()).optional(),
    const: z.unknown().optional(),
    format: z.string().optional(),
    minLength: z.number().optional(),
    minimum: z.number().optional(),
    exclusiveMinimum: z.number().optional(),
    minItems: z.number().optional(),
    items: jsonSchemaSchema.optional(),
    properties: z.record(z.string(), jsonSchemaSchema).optional(),
    required: z.array(z.string()).optional(),
    anyOf: z.array(jsonSchemaSchema).optional(),
    oneOf: z.array(jsonSchemaSchema).optional(),
    pattern: z.string().optional(),
    default: z.unknown().optional(),
  }),
);

const listedToolsSchema = z.array(
  z.object({
    name: z.string(),
    inputSchema: z.object({
      type: z.string().optional(),
      properties: z.record(z.string(), jsonSchemaSchema).optional(),
      required: z.array(z.string()).optional(),
    }),
  }),
);

class Pace {
  private sent: number[] = [];

  async take(count = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      for (;;) {
        const now = Date.now();
        this.sent = this.sent.filter((at) => now - at < WINDOW_MS);
        if (this.sent.length < REQUESTS_PER_MINUTE) break;
        const oldest = this.sent[0] ?? now;
        await new Promise((resolve) => setTimeout(resolve, WINDOW_MS - (now - oldest) + 50));
      }
      this.sent.push(Date.now());
    }
  }
}

const paces = new Map<string, Pace>();

function paceFor(token: string): Pace {
  let pace = paces.get(token);
  if (!pace) {
    pace = new Pace();
    paces.set(token, pace);
  }
  return pace;
}

function parsed(text: string): Record<string, unknown> {
  try {
    return z.record(z.string(), z.unknown()).catch({}).parse(JSON.parse(text));
  } catch {
    return {};
  }
}

export class McpSession {
  private constructor(
    private readonly client: Client,
    private readonly pace: Pace,
  ) {}

  static async open(token: string): Promise<McpSession> {
    const pace = paceFor(token);
    await pace.take(2);
    return new McpSession(await connect(token, MODERN), pace);
  }

  async tools(): Promise<ListedTool[]> {
    await this.pace.take();
    return listedToolsSchema.parse((await this.client.listTools()).tools);
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    await this.pace.take();
    const result = await this.client.callTool({ name, arguments: args });
    const text = toolText(result);
    return { isError: result.isError === true, text, json: parsed(text) };
  }

  async ok<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await this.call(name, args);
    if (result.isError || result.json.error !== undefined) {
      throw new Error(`${name}: ${result.text}`);
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- black-box client: the calling test names the tool result shape it expects and asserts on the values
    return result.json as T;
  }

  async refused(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.call(name, args);
    if (result.isError) throw new Error(`${name}: ${result.text}`);
    const error = result.json.error;
    if (typeof error !== "string") {
      throw new Error(`${name} should refuse: ${result.text}`);
    }
    return error;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export async function seededToken(name: OwnerClient): Promise<string> {
  return (await harness.account()).mcpClients[name].token;
}

export async function memberToken(): Promise<string> {
  return (await harness.account()).member.mcpClient.token;
}

export async function session(name: OwnerClient): Promise<McpSession> {
  return McpSession.open(await seededToken(name));
}
