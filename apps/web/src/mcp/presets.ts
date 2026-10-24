export const MCP_PRESET_IDS = [
  "claude-code",
  "claude-desktop",
  "codex",
  "cursor-desktop",
  "cursor-web",
  "vscode",
  "custom",
] as const;

export type McpPresetId = (typeof MCP_PRESET_IDS)[number];

type RedirectInput = { port?: number; callbackId: string; origin: string };

export type McpPreset = {
  id: McpPresetId;
  label: string;
  clientType: "native" | "web";
  needsPinnedPort: boolean;
  defaultPort?: number;
  hint: string;
  redirectUris: (input: RedirectInput) => string[];
  instructions: (input: { clientId: string; port?: number; mcpUrl: string }) => string;
  removal: string;
};

export const MCP_PRESETS: Record<McpPresetId, McpPreset> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    clientType: "native",
    needsPinnedPort: true,
    defaultPort: 8791,
    hint: "Claude Code needs a fixed port number so it can receive the sign-in response.",
    redirectUris: ({ port }) => [`http://localhost:${port}/callback`, "http://127.0.0.1/callback"],
    instructions: ({ clientId, port, mcpUrl }) =>
      `claude mcp add --transport http \\\n  --client-id ${clientId} \\\n  --callback-port ${port} \\\n  metis-suite ${mcpUrl}`,
    removal: "claude mcp remove metis-suite",
  },
  "claude-desktop": {
    id: "claude-desktop",
    label: "Claude Desktop / claude.ai",
    clientType: "web",
    needsPinnedPort: false,
    hint: "Add a custom connector, then open Advanced settings and paste the client ID.",
    redirectUris: () => [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ],
    instructions: ({ clientId, mcpUrl }) =>
      `Settings → Connectors → Add custom connector\nURL: ${mcpUrl}\nAdvanced settings → OAuth Client ID: ${clientId}\nLeave the client secret empty.`,
    removal: "Settings → Connectors → remove the Metis Suite connector",
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    clientType: "native",
    needsPinnedPort: false,
    hint: "Codex handles sign-in automatically — nothing to configure here.",
    redirectUris: ({ callbackId }) => [`http://127.0.0.1/callback/${callbackId}`],
    instructions: ({ clientId, mcpUrl }) =>
      `codex mcp add metis-suite \\\n  --url ${mcpUrl} \\\n  --oauth-client-id ${clientId}`,
    removal: "codex mcp remove metis-suite",
  },
  "cursor-desktop": {
    id: "cursor-desktop",
    label: "Cursor (desktop)",
    clientType: "native",
    needsPinnedPort: false,
    hint: "Cursor handles sign-in automatically — nothing to configure here.",
    redirectUris: () => ["http://localhost:8787/callback"],
    instructions: ({ clientId, mcpUrl }) =>
      `Add to mcp.json:\n{\n  "mcpServers": {\n    "metis-suite": {\n      "url": "${mcpUrl}",\n      "auth": { "CLIENT_ID": "${clientId}" }\n    }\n  }\n}`,
    removal: 'Remove the "metis-suite" entry from Cursor\'s mcp.json',
  },
  "cursor-web": {
    id: "cursor-web",
    label: "Cursor (web / cloud agents)",
    clientType: "web",
    needsPinnedPort: false,
    hint: "Add this alongside the desktop client if you sign in from both.",
    redirectUris: () => ["https://www.cursor.com/agents/mcp/oauth/callback"],
    instructions: ({ clientId, mcpUrl }) =>
      `Add to mcp.json:\n{\n  "mcpServers": {\n    "metis-suite": {\n      "url": "${mcpUrl}",\n      "auth": { "CLIENT_ID": "${clientId}" }\n    }\n  }\n}`,
    removal: 'Remove the "metis-suite" entry from Cursor\'s mcp.json',
  },
  vscode: {
    id: "vscode",
    label: "VS Code / Copilot",
    clientType: "web",
    needsPinnedPort: false,
    hint: "VS Code handles sign-in automatically — nothing to configure here.",
    redirectUris: () => ["https://vscode.dev/redirect"],
    instructions: ({ clientId, mcpUrl }) =>
      `Add to mcp.json:\n{\n  "servers": {\n    "metis-suite": {\n      "type": "http",\n      "url": "${mcpUrl}",\n      "oauth": { "clientId": "${clientId}" }\n    }\n  }\n}`,
    removal: 'Remove the "metis-suite" entry from VS Code\'s mcp.json',
  },
  custom: {
    id: "custom",
    label: "Other client",
    clientType: "native",
    needsPinnedPort: false,
    hint: "Enter the exact URL your client returns to after sign-in — check its docs if you're unsure.",
    redirectUris: () => [],
    instructions: ({ clientId, mcpUrl }) =>
      `Server URL: ${mcpUrl}\nClient ID: ${clientId}\nThere is no secret key — the client ID is all you need.`,
    removal: "Remove the Metis Suite server from your client's MCP config",
  },
};

export const MCP_PRESET_LIST = MCP_PRESET_IDS.map((id) => MCP_PRESETS[id]);

export const SELF_REGISTERED_LABEL = "Self-identified client";
export const SELF_REGISTERED_REMOVAL =
  "Remove the Metis Suite server from your client's MCP config";
