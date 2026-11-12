# HyperRx web service in one container: the web server (Node 22) and the DB search server (Python 3.13, Hyper-RAG).
# Build context is web-service/ (one folder up), because the landing page source sits there: use docker-compose.yml,
# or `docker build -f local-app/Dockerfile ..` from this folder. local-app/Dockerfile.dockerignore picks what is sent.
# No API key and no team DB are in the image. The DB is unpacked into a volume on first start (docker-start.mjs), and
# with REQUIRE_USER_KEY=1 every reader enters their own OpenAI key in 설정 › API 키.

# 1) Front end (esbuild). Only public/ is carried over.
FROM node:22-bookworm-slim AS web
WORKDIR /build/local-app
COPY local-app/package.json local-app/package-lock.json ./
RUN npm ci
COPY galYAKsi_smaller_sign.html /build/
COPY local-app/build.mjs ./
COPY local-app/src ./src
COPY local-app/public ./public
RUN npm run build

# 2) Runtime. The node binary comes from the image above (same Debian release).
FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY local-app/requirements.txt ./
RUN python -m venv .venv && .venv/bin/pip install --no-cache-dir -r requirements.txt
# The original Hyper-RAG engine at the commit this service was checked with (README, setup-windows.cmd).
ARG HYPERRAG_COMMIT=46ff126225720a145546fa012e0abbba491b9ab3
RUN git init -q vendor/Hyper-RAG \
 && git -C vendor/Hyper-RAG fetch -q --depth 1 https://github.com/iMoonLab/Hyper-RAG.git "$HYPERRAG_COMMIT" \
 && git -C vendor/Hyper-RAG checkout -q FETCH_HEAD \
 && rm -rf vendor/Hyper-RAG/.git
# tiktoken downloads its gpt-4o tokenizer on first use; fetch it now so a search needs no download.
ENV TIKTOKEN_CACHE_DIR=/app/.tiktoken
RUN .venv/bin/python -c "import tiktoken; tiktoken.encoding_for_model('gpt-4o')"
COPY local-app/ ./
COPY --from=web /build/local-app/public ./public
# The engine patch, and a user without root rights that owns only the two data folders (named volumes take this owner).
RUN .venv/bin/python patch_engine.py \
 && useradd --create-home --uid 10001 hyperrx \
 && mkdir -p data/kdb-work data/mfds-label-cache \
 && chown -R hyperrx:hyperrx data
USER hyperrx
ENV BIND_HOST=0.0.0.0 PORT=8787 HYPERRAG_URL=http://127.0.0.1:8788 REQUIRE_USER_KEY=1 DB_START_SECONDS=300 PYTHONUNBUFFERED=1
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s CMD ["node","-e","fetch('http://127.0.0.1:8787/api/status').then(r=>r.json()).then(s=>process.exit(s.db&&s.db.ready?0:1),()=>process.exit(1))"]
CMD ["node","docker-start.mjs"]
