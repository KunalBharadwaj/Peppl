# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Peppl — a disposable, browser-based coding workspace (repl.it clone). Users pick a
workspace ID + language on a landing page, get a Kubernetes pod seeded from an S3 template,
and edit/run code in-browser via Monaco + an xterm.js terminal over Socket.IO.

The microservice architecture lives under `good-code/`: `init-service`, `orchestrator-simple`,
`runner`, `frontend`, and static k8s manifests. Each service is an independent Node/TypeScript
project with its own `package.json`, `tsconfig.json`, and `.env` — there is no root-level
workspace/monorepo tooling (no root `package.json`, no shared lockfile). `cd` into a service
directory before running its scripts.

## Commands

Run per-service, from within that service's directory (`good-code/<service>/`).

### frontend (Vite + React + TS)
Standard Vite scripts — see `package.json`.

### init-service, orchestrator-simple, runner (Node + Express + TS)
`yarn dev` runs `nodemon` on the TS source with no compile step; `yarn build` (`tsc -b`) must precede `yarn start`, which runs `dist/index.js`.

There is no test suite/runner configured in any package.json — don't assume `yarn test` exists.

### Environment
Each backend service reads its own `.env` (see `src/.env.example` per service):
- `init-service`: `MONGODB_URI`, `MONGODB_DB_NAME` (default `repl`), `S3_BUCKET`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`
- `orchestrator-simple`: S3 vars (unused by `/start` itself, but present in `.env.example`) plus an
  active kubeconfig (`KubeConfig().loadFromDefault()` — needs a real/local cluster context)
- `runner`: S3 vars, optional `RUNNER_AUTH_TOKEN` (socket handshake auth), `MAX_FILE_BYTES`
  (default 1MB), `S3_THROTTLE_MS` (default 900ms), `CORS_ORIGIN`
- `frontend`: `VITE_CONTROL_PLANE_URL` (init-service, default `http://localhost:3001`),
  `VITE_ORCHESTRATOR_URL` (orchestrator-simple, default `http://localhost:3002`),
  `VITE_OUTPUT_BASE_DOMAIN` (default `autogpt-cloud.com`)

## Architecture (`good-code/`)

Four independent services + static k8s manifests, wired together by workspace ID (`replId`) and
subdomain-based routing — not by direct service-to-service calls.

```
Landing (frontend) --POST /project--> init-service --> Mongo (repl status) + S3 copy (base/<lang> -> code/<replId>)
CodingPage (frontend) --POST /start--> orchestrator-simple --> creates k8s Deployment/Service/Ingress for <replId>
                                                                   pod's initContainer pulls code/<replId> from S3 into /workspace
frontend socket.io client --ws://<replId>.<domain>--> runner pod (routed by Ingress host rule) --> pty + fs + S3 writeback
```

1. **`frontend`** — React Router app with two routes: `/` (`Landing.tsx`, create a repl) and
   `/coding` (`CodingPage.tsx`, the workspace). `CodingPage` first POSTs to orchestrator's `/start`
   to (re)provision the pod, then opens a Socket.IO connection directly to
   `ws://<replId>.peetcode.com` (note: this host is hardcoded in `CodingPage.tsx`'s `useSocket`,
   independent of `CONFIG.outputBaseDomain` in `config.ts`, which only drives the *output preview*
   iframe domain — check both if changing domains). File tree/editor (`Editor.tsx`,
   `components/external/editor/**`) and `Terminal.tsx` talk to the runner purely over socket
   events (`fetchDir`, `fetchContent`, `updateContent`, `requestTerminal`, `terminalData`).

2. **`init-service`** (`POST /project`) — validates `replId`/`language` (only `node-js` and
   `python` are supported), inserts a Mongo `repls` doc with status `creating`, then copies the
   S3 template folder `base/<language>/` to `code/<replId>/` and flips status to `ready`/`failed`.
   This is the only service that touches Mongo; it does not talk to Kubernetes.

3. **`orchestrator-simple`** (`POST /start`) — reads `service.yaml` (a single multi-doc YAML with
   Deployment/Service/Ingress templates using the literal placeholder string `service_name`),
   string-replaces `service_name` with the given `replId`, and creates the three k8s resources via
   `@kubernetes/client-node`. It has both a compiled `.js` (checked-in build artifact — `aws.js`,
   `index.js`) and the `.ts` source; edit the `.ts` and rebuild rather than hand-editing the `.js`.
   The Deployment's `initContainer` runs `aws s3 cp s3://.../code/<replId>/ /workspace/` to seed the
   pod before the `runner` container starts.

4. **`runner`** — runs inside each workspace pod. On socket connect it derives `replId` from the
   request's `Host` header subdomain (`host.split('.')[0]`), so it must be reached through the
   wildcard-host Ingress, not called directly by IP/localhost with a different host. Optional
   bearer-style auth via `RUNNER_AUTH_TOKEN` (checked against `socket.handshake.auth.token` or the
   `x-runner-token` header). `pty.ts` spawns one `bash` PTY per socket id (`TerminalManager`);
   `fs.ts` reads/writes under `/workspace`; `ws.ts` also supports patch-based edits
   (`updateContent` with `{start,end,text,expected}`, verified against a slice of current content
   before applying) in addition to full-content writes, and throttles/coalesces S3 writeback per
   file (`S3_THROTTLE_MS`) via `saveToS3`.

5. **`good-code/k8s/`** — static reference manifests, not applied automatically by any service:
   `ingress-controller.yaml` is a vendored ingress-nginx install; `orchestrator-simple/service.yaml`
   is the per-repl template described above.

Cross-cutting: `replId` is the single join key across Mongo (`init-service`), S3 key prefixes
(`code/<replId>/`), k8s object names (`orchestrator-simple`), and the Ingress host / Socket.IO
subdomain (`runner`) — when tracing a bug, follow this ID across services rather than assuming any
direct RPC link between them.
