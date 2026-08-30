# Multi-stage: build the Vite bundle, then serve the static output with nginx.
# Vite inlines VITE_* env vars at BUILD time, so the deploy-time config for the
# control-plane/orchestrator URLs and workspace domains must be passed as build
# args (--build-arg) or baked per-environment image.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_CONTROL_PLANE_URL
ARG VITE_ORCHESTRATOR_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_WORKSPACE_BASE_DOMAIN
ARG VITE_OUTPUT_BASE_DOMAIN
ENV VITE_CONTROL_PLANE_URL=$VITE_CONTROL_PLANE_URL \
    VITE_ORCHESTRATOR_URL=$VITE_ORCHESTRATOR_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_WORKSPACE_BASE_DOMAIN=$VITE_WORKSPACE_BASE_DOMAIN \
    VITE_OUTPUT_BASE_DOMAIN=$VITE_OUTPUT_BASE_DOMAIN
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
