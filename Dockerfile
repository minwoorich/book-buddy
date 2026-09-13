# ── build stage ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── runtime stage ───────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app

# better-sqlite3 is a native module; npm ci below rebuilds it from source
# for this stage's platform, so build tools are needed here too.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm i -D tsx

VOLUME /app/.data
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
