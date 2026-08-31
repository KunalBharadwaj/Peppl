# Multi-stage. node-pty is a native addon: it needs a compiler at build time and
# libstdc++ at runtime. The runner is also where user code executes (via the bash
# PTY), so the runtime image ships bash + python3 + node so both supported
# workspace languages (node-js, python) can actually run.
FROM node:20-alpine AS build
WORKDIR /app
# Toolchain for compiling node-pty's native binding.
RUN apk add --no-cache python3 make g++
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN yarn build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# bash: the PTY shell. python3: the `python` workspace runtime. libstdc++:
# node-pty's runtime dependency. Node is already in the base image.
RUN apk add --no-cache bash python3 libstdc++
# Copy the already-built dependency tree (includes node-pty's compiled binding)
# so we don't need the toolchain in the runtime image.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# runner/ws binds 3001 (control/socket); 3000 is the user program's output port.
EXPOSE 3001 3000
USER node
CMD ["node", "dist/index.js"]
