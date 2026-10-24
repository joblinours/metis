import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_BUILD_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  outputFileTracingRoot: path.join(__dirname, "../.."),
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
      { hostname: "graph.microsoft.com" },
      { hostname: "*.googleusercontent.com" },
    ],
  },
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/libsql",
    "@mastra/memory",
    "@libsql/client",
    "libsql",
    "ssh2",
    "ssh2-sftp-client",
  ],
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.bun/libsql@*/node_modules/**/*",
      "../../node_modules/.bun/@libsql+*/node_modules/**/*",
    ],
  },
  typedRoutes: true,
};

export default nextConfig;
