# Debian (glibc) base: onnxruntime-node and @discordjs/opus ship prebuilt binaries for it, not for Alpine.
FROM node:22-bookworm-slim AS build
# @discordjs/opus has no prebuilt binary for every Node version, so it may compile from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM build AS prune
# Kokoro runs on CPU: drop onnxruntime's GPU providers and other platforms' binaries (~500 MB).
RUN npm prune --omit=dev \
  && ort=node_modules/onnxruntime-node/bin/napi-v3 \
  && rm -rf "$ort/darwin" "$ort/win32" \
  && find "$ort/linux" -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} + \
  && rm -f "$ort"/linux/*/libonnxruntime_providers_cuda.so "$ort"/linux/*/libonnxruntime_providers_tensorrt.so

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /app/package.json ./
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/dist ./dist
# Mount points for the named volumes; created here so they belong to the unprivileged user.
RUN mkdir -p data node_modules/@huggingface/transformers/.cache \
  && chown -R node:node data node_modules/@huggingface/transformers/.cache
USER node
CMD ["node", "dist/main.js"]
