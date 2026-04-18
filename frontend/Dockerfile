# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Optional: override API base URLs at build time (e.g. to point at a remote server).
# If not provided, the app defaults to relative /api/* paths which Nginx proxies.
ARG VITE_AUTH_SERVICE_URL
ARG VITE_PRODUCT_SERVICE_URL
ARG VITE_CART_SERVICE_URL
ARG VITE_ORDER_SERVICE_URL
ARG VITE_AI_SERVICE_URL

ENV VITE_AUTH_SERVICE_URL=${VITE_AUTH_SERVICE_URL}
ENV VITE_PRODUCT_SERVICE_URL=${VITE_PRODUCT_SERVICE_URL}
ENV VITE_CART_SERVICE_URL=${VITE_CART_SERVICE_URL}
ENV VITE_ORDER_SERVICE_URL=${VITE_ORDER_SERVICE_URL}
ENV VITE_AI_SERVICE_URL=${VITE_AI_SERVICE_URL}

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config will be mounted from nginx/nginx.conf in docker-compose
# Default fallback config for standalone use
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n\
    \n\
    location ^~ /static/products/ {\n\
    proxy_pass http://product_service:8002/static/products/;\n\
    proxy_set_header Host $host;\n\
    proxy_cache_bypass 1;\n\
    expires 30d;\n\
    add_header Cache-Control "public";\n\
    }\n\
    \n\
    location / {\n\
    try_files $uri $uri/ /index.html;\n\
    }\n\
    \n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
    }\n\
    }\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
