# Debian (glibc) base: onnxruntime-node and @discordjs/opus ship prebuilt binaries for it, not for Alpine.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM build AS prune
RUN npm prune --omit=dev

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
