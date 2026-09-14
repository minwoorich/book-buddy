# ── build stage ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 네이티브 빌드용 툴체인 (prebuild 미제공/다운로드 실패 시 소스 컴파일)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
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

# 데이터 디렉토리(.data)는 실행 환경에서 마운트한다:
# 로컬 docker run은 -v 플래그(README 참고), Railway는 서비스 볼륨(/app/.data).
# (Dockerfile의 VOLUME 명령은 Railway 빌드 검증에서 거부되므로 사용하지 않음)
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
