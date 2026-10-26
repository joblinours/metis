FROM oven/bun:1-alpine AS pruner
WORKDIR /app
COPY . .
RUN bunx turbo@2.11.7 prune @metis/web --docker

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
WORKDIR /app/apps/web
RUN bun build scripts/preflight.ts --target=node --conditions=react-server --external libsql --external cpu-features --outfile preflight.mjs

FROM oven/bun:1-alpine AS modules
WORKDIR /modules
COPY --from=pruner /app/out/json/bun.lock /tmp/bun.lock
RUN version=$(sed -n 's/^    "libsql": \["libsql@\([^"]*\)".*/\1/p' /tmp/bun.lock) \
 && test -n "$version" \
 && printf '{"private":true,"dependencies":{"libsql":"%s"}}' "$version" > package.json \
 && bun install --production --ignore-scripts --linker hoisted \
 && rm -rf node_modules/@libsql/*-gnu* package.json bun.lock

FROM node:26-alpine AS preflight
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=modules /modules/node_modules /app/node_modules
COPY --from=build /app/apps/web/preflight.mjs ./preflight.mjs
COPY --from=build /app/apps/web/migrations ./migrations
CMD ["node", "preflight.mjs"]
