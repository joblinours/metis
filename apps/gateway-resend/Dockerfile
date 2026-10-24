FROM oven/bun:1-alpine AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/gateway-resend --docker

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/gateway-resend
EXPOSE 8787
CMD ["sh", "-c", "bun run scripts/apply-schema.ts && bun run src/server.ts"]
