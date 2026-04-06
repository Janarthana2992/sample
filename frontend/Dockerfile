# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Receive Vite build-time env vars as Docker build args (must match docker-compose args)
ARG VITE_AUTH_SERVICE_URL
ARG VITE_PRODUCT_SERVICE_URL
ARG VITE_CART_SERVICE_URL
ARG VITE_ORDER_SERVICE_URL
ARG VITE_AI_SERVICE_URL
ARG VITE_MAPBOX_TOKEN

ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL
ENV VITE_PRODUCT_SERVICE_URL=$VITE_PRODUCT_SERVICE_URL
ENV VITE_CART_SERVICE_URL=$VITE_CART_SERVICE_URL
ENV VITE_ORDER_SERVICE_URL=$VITE_ORDER_SERVICE_URL
ENV VITE_AI_SERVICE_URL=$VITE_AI_SERVICE_URL
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config: serve SPA, proxy nothing (all APIs hit backend directly from browser)
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    gzip on;\n\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;\n\
    \n\
    # Proxy uploaded product images from the product service.\n\
    # Use ^~ to prevent the regex location below from overriding this.\n\
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
    # Cache static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
    }\n\
    }\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
