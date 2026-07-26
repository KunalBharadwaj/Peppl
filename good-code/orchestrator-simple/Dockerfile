# Multi-stage: compile with dev deps, ship a slim runtime with prod deps only.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN yarn build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean
COPY --from=build /app/dist ./dist
# The service reads service.yaml at runtime (path.join(__dirname, "../service.yaml")).
COPY service.yaml ./service.yaml
EXPOSE 3002
USER node
CMD ["node", "dist/index.js"]
