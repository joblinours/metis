import { getProtectedResourceMetadata } from "@/auth/oauth-resource-client";
import { MCP_AUDIENCE, MCP_ISSUER } from "@/mcp/auth";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">,
) {
  const { path } = await params;
  const resource = new URL(`/${(path ?? []).join("/")}`, MCP_AUDIENCE).toString();

  if (resource !== MCP_AUDIENCE) {
    return Response.json({ error: "unknown resource" }, { status: 404 });
  }

  const protectedResourceMetadata = await getProtectedResourceMetadata({
    resource,
    authorization_servers: [MCP_ISSUER],
  });

  return Response.json(protectedResourceMetadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
