# FleetFlow — production image (API + built frontend)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_STATIC=1
ENV API_PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx@4.19.4 --no-save

COPY server ./server
COPY utils ./utils
COPY taxiTypes.ts ./
COPY --from=build /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["npx", "tsx", "server/index.js"]
