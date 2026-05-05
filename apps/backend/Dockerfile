# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
RUN apk add --no-cache openssl \
    && npm install --workspace=apps/backend --include-workspace-root

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/
COPY tsconfig.base.json ./
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate \
    && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl wget tini \
    && addgroup -S app && adduser -S app -G app \
    && mkdir -p /data/uploads /data/uploads/avatars \
    && chown -R app:app /data
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY apps/backend/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
USER app
WORKDIR /app/apps/backend
EXPOSE 4000
ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]
