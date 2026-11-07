# Production frontend image: static SPA behind the compose reverse proxy.
# VITE_API_URL is baked at build time — the browser calls same-origin
# /api/v1, which the reverse proxy forwards to the API.

FROM oven/bun:1.4.2 AS build
WORKDIR /app

# Dependency layer first so source edits do not reinstall packages.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN bun run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
