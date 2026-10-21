# Whole Platport Lite · imagen de producción (Next.js standalone)
#
#   docker build -t whole-platport-lite .
#   docker run --rm -p 3000:3000 whole-platport-lite
#
# El build corre tsc y las 45 pruebas: si una PA falla, la imagen no se construye.

ARG NODE_VERSION=22-alpine
# Misma versión que "packageManager" en package.json. Se instala con npm porque
# pnpm 12 no es compatible con el Corepack que trae Node 22.
ARG PNPM_VERSION=12.3.4

# 1) Dependencias exactas según pnpm-lock.yaml
FROM node:${NODE_VERSION} AS deps
ARG PNPM_VERSION
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION}
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2) Verificación + build
FROM node:${NODE_VERSION} AS build
ARG PNPM_VERSION
WORKDIR /app
RUN npm install -g pnpm@${PNPM_VERSION}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec tsc --noEmit && pnpm test && pnpm build

# 3) Imagen final mínima, usuario sin privilegios
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
