# syntax=docker/dockerfile:1
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS builder
WORKDIR /workspace
RUN npm install --global pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/prettier-config/package.json ./packages/prettier-config/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://build_only:nonconnecting@127.0.0.1:1/build_only?schema=public \
    ORIENTAL_DEPLOYMENT_BUILD=standalone \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    pnpm build --env-mode=loose && pnpm verify:build-output
RUN find apps/api/dist packages/contracts/dist packages/database/dist -type f -name '*.map' -delete \
    && find apps/web/.next/standalone/apps/web/.next apps/web/.next/static -type f -name '*.map' -delete

FROM ${NODE_IMAGE} AS runtime
RUN npm install --global pnpm@11.17.0
WORKDIR /workspace
ARG RELEASE_REVISION
LABEL org.opencontainers.image.revision=${RELEASE_REVISION}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /workspace/package.json /workspace/pnpm-workspace.yaml /workspace/pnpm-lock.yaml ./
COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /workspace/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder --chown=node:node /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=builder --chown=node:node /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder --chown=node:node /workspace/packages/database/package.json /workspace/packages/database/prisma.config.ts ./packages/database/
COPY --from=builder --chown=node:node /workspace/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /workspace/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /workspace/packages/database/prisma/schema.prisma ./packages/database/prisma/schema.prisma
COPY --from=builder --chown=node:node /workspace/packages/database/prisma/migrations ./packages/database/prisma/migrations
COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./web
COPY --from=builder --chown=node:node /workspace/apps/web/public ./web/apps/web/public
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./web/apps/web/.next/static
RUN chown node:node /workspace
USER node
CMD ["node", "apps/api/dist/server.js"]
