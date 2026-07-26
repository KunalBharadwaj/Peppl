# Peppl — Resume-Readiness Improvement Plan

Tracking doc for turning this project from a working demo into a defensible,
resume-worthy system. Items are ordered by resume ROI. Check them off as we go.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Priority 1 — Blockers (do these first)

### 1. Workspace lifecycle / pod reaper `[x]` DONE
**Gap:** `orchestrator-simple` created a Deployment + Service + Ingress (+ NetworkPolicy)
per repl and nothing ever deleted them. The product is pitched as "disposable" but
nothing disposed.
**Done:**
- **Idle tracking via runner heartbeat.** While a user has ≥1 live socket, the runner
  POSTs the workspace's replId to orchestrator `/heartbeat` every 30s
  (`runner/src/heartbeat.ts`, ref-counted per socket so multiple tabs keep it alive and
  only the last disconnect lets it go idle). The orchestrator keeps an in-memory
  last-seen map (`orchestrator-simple/src/lifecycle.ts`).
- **Reaper as a K8s CronJob** (`k8s/reaper-cronjob.yaml`): every 5 min it curls
  orchestrator `POST /reap`, which deletes every workspace idle past `IDLE_TTL_MS`
  (default 30 min). Delete logic lives in the orchestrator (`deleteWorkspace()` — removes
  all 4 K8s objects, idempotent/404-tolerant) since it already holds the k8s client; the
  CronJob is just the scheduler. `/heartbeat` and `/reap` are guarded by a shared
  `INTERNAL_TOKEN` (machine-to-machine, no user JWT).
- **`DELETE /stop`** for explicit teardown — auth + ownership, tears down the 4 objects.
- **Closed the #3 ownership gap.** The orchestrator now holds a *read-only* view of the
  `repls` collection (`orchestrator-simple/src/mongo.ts`, `getReplOwner`); `/start` and
  `/stop` verify the caller owns the replId (404 if unknown, 403 if not theirs).
  init-service remains the sole writer. `/start` also seeds the idle clock so a fresh pod
  isn't reaped before the user connects.
**New env vars:** orchestrator: `MONGODB_URI`, `MONGODB_DB_NAME` (same DB as init-service),
  `IDLE_TTL_MS`, `INTERNAL_TOKEN`. runner: `ORCHESTRATOR_URL`, `HEARTBEAT_INTERVAL_MS`,
  `INTERNAL_TOKEN` (must match). Reaper CronJob expects a `peppl-internal` Secret.
**Defense:** "Runner emits a heartbeat while a session is live; a CronJob-driven sweep
  deletes the K8s objects after an idle TTL. Chose a periodic sweep over per-pod timers so
  it survives orchestrator restarts — live pods repopulate the liveness map within one
  heartbeat interval. /start and /stop are ownership-checked against the repls record."
**Caveats (honest):**
- Liveness map is in-memory. On orchestrator restart, live pods re-register within one
  heartbeat interval (so nothing live is wrongly reaped), but a pod provisioned-but-never-
  connected whose seed entry is lost to a restart can leak until manually cleaned. A
  Mongo-backed `lastActiveAt` would close this; deferred as not worth the write load yet.
- Host-derived replId means heartbeats only ever extend a pod's *own* life (ingress routes
  by Host), so a spoofed Host can't keep someone else's pod alive.

### 2. Tests + CI `[x]` DONE
**Gap:** Zero tests across all services, no `.github/workflows`.
**Done:**
- **Vitest** added to all three backend services (`yarn test` → `vitest run`).
- **Extracted trapped logic into testable units:** `applyPatch` → `runner/src/patch.ts`;
  the duplicated replId regex → `src/validation.ts` in each service (`isValidReplId`),
  now the single source of truth wired into every entry point.
- **Unit tests (28 total, all green locally):**
  - runner (13): `applyPatch` (clean apply, insertion, stale-slice rejection, range
    guards), `resolveWorkspacePath` (traversal escapes throw, absolute paths confined),
    `isValidReplId`.
  - orchestrator (7): `WorkspaceRegistry` (stale-past-TTL, exactly-TTL boundary, touch
    rescues, forget), `isValidReplId` (incl. a newline/YAML-injection case).
  - init-service (8): `isValidReplId` + the ephemeral-Mongo integration suite.
- **Integration test against ephemeral Mongo** (`mongodb-memory-server`) for the repl
  repository: `countActiveByOwner` (failed frees a slot), the unique-replId 11000 conflict,
  ownership-scoped `claimForRetry` (wrong owner can't hijack; fresh-creating not reclaimed;
  stale-creating reclaimed), and `failStaleCreating`. Skips gracefully (not fails) if mongod
  can't start (no network / too little free disk); CI runs it for real.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): a matrix over the three backend
  services runs install + build + test; a frontend job runs install + lint + build. On
  every push to main and every PR.
**Defense:** "Green CI on every PR: pure logic (patch application, path confinement,
  id validation, the reaper's idle math) is unit-tested, and the init flow's repository is
  integration-tested against an ephemeral MongoDB with real indexes and the unique
  constraint."
**Note:** `tsc -b` builds are now scoped to `src` (tests run under vitest/esbuild, not the
  typed build). Frontend has no unit tests yet — CI gates it on strict lint + typecheck+build.

### 3. Auth + rate limiting on the control plane `[x]` DONE
**Gap:** `POST /start` (orchestrator) and `POST /project` (init) had no auth and no
limits — anyone could spawn unlimited pods (cost/DoS bomb). Only runner had an optional token.
**Done:**
- Google OAuth2 (GIS ID-token flow): frontend `GoogleLogin` button -> `credential`
  -> `POST /auth/google` on init-service, which verifies it with `google-auth-library`,
  upserts a `users` doc, and issues our own JWT (`init-service/src/auth/auth.ts`).
- JWT (bearer) session: stored in `localStorage`, sent as `Authorization: Bearer`.
  Both init-service and orchestrator verify it statelessly with a shared `JWT_SECRET`
  (`orchestrator-simple/src/auth.ts`) — no new cross-service call.
- `POST /project` and `POST /start` now require a valid token.
- Per-IP rate limiting via `express-rate-limit` (auth: 30/15min, project+start: 20/min).
- Per-user cap of `MAX_REPLS_PER_USER` (default 5): repls doc gained `ownerId`;
  `countActiveByOwner` gates creation -> `429` when exceeded. `claimForRetry` is now
  ownership-scoped so a user can't hijack another user's replId slug.
**New env vars:** init-service: `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
  `MAX_REPLS_PER_USER`. orchestrator: `JWT_SECRET` (must match). frontend:
  `VITE_GOOGLE_CLIENT_ID`.
**Defense:** "Both control-plane endpoints require a Google-issued identity, verified
  once and exchanged for a short-lived JWT that every service checks with a shared
  secret. `/start` is rate-limited and each user is capped at 5 workspaces, so a caller
  can't exhaust the cluster."
**Deferred caveat — NOW CLOSED (in #1):** orchestrator previously authenticated the caller
  but did not verify replId *ownership*. Closed by giving orchestrator a read-only
  `getReplOwner` lookup against the `repls` collection; `/start` and `/stop` now 403 a
  caller who doesn't own the workspace.

### 4. Runner / workspace security hardening `[x]` DONE
**Gap:**
- Path traversal: `fs.ts` and `ws.ts` built `/workspace/${filePath}` with no
  normalization — `../../` escaped the workspace.
- `replId` was never charset-validated before hitting S3 keys, K8s object names,
  and YAML (`orchestrator-simple/src/index.ts` raw string-replace = manifest injection).
- No network isolation; container ran as root. (Resource limits were already present.)
**Done:**
- `resolveWorkspacePath()` in `runner/src/fs.ts` confines every client path under
  `/workspace` (strips leading slashes, normalizes, prefix-checks). Wired into
  `fetchDir`/`fetchContent`/`updateContent` in `ws.ts`; escapes now reveal nothing.
  Verified: `../etc/passwd`, `foo/../../bar` blocked; legit paths pass.
- `replId` validated against `^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$` (RFC1123-style)
  at all three entry points: init-service `/project`, orchestrator `/start`
  (before YAML substitution), and runner (Host-subdomain derivation).
- `service.yaml`: pod-level `securityContext` (runAsNonRoot, shared UID 1000 +
  fsGroup so seeded files stay writable, seccomp RuntimeDefault); per-container
  `allowPrivilegeEscalation: false` + `capabilities: drop [ALL]`; a per-repl
  `NetworkPolicy` (Egress-only) allowing DNS + public internet but blocking
  cluster-internal ranges and the cloud metadata IP (SSRF / IAM-theft defense).
  Added a `NetworkPolicy` case to the orchestrator's manifest switch so it's
  actually created.
**Defense:** "Each workspace is one ephemeral pod: CPU/mem/storage-limited,
  non-root with all capabilities dropped, file access confined to /workspace, and
  an egress NetworkPolicy that blocks the metadata endpoint and cluster-internal
  network so compromised user code can't steal IAM creds or move laterally."
**Caveats to validate on a real cluster (can't test here):**
- runAsNonRoot/UID 1000 assumes the `100xdevs/runner` and `amazon/aws-cli` images
  tolerate a non-root UID; verify the S3 seed still writes and the runner can
  read/write /workspace (fsGroup should cover it; HOME=/tmp set for aws-cli).
- NetworkPolicy needs a CNI that enforces it (Calico/Cilium); on a plain CNI it's
  a no-op. If `S3_ENDPOINT` is a private/VPC endpoint, add an explicit allow rule.
- `readOnlyRootFilesystem` intentionally NOT set (node/npm/tmp scratch); could be
  added later with tmpfs mounts for /tmp.

---

## Priority 2 — Production polish

### 5. Health/readiness endpoints + observability `[x]` DONE
**Gap:** `console.log` only; no `/healthz`, so K8s liveness/readiness probes couldn't work.
**Done:**
- **`/healthz` (liveness) + `/readyz` (readiness) on all three backend services.**
  `readyz` is dependency-aware: init-service & orchestrator round-trip a `ping` to
  Mongo (`pingMongo`) and return 503 until it answers; the runner's `readyz` checks the
  seeded `/workspace` volume is accessible (so a pod stays out of rotation until its
  initContainer has populated it).
- **K8s probes wired in** (`service.yaml`): the runner container gets a `livenessProbe`
  on `/healthz` and a `readinessProbe` on `/readyz` (port 3001).
- **Structured JSON logging** via a zero-dep `logger.ts` in each service: one JSON object
  per line (`ts, level, service, msg, ...`), level filtering via `LOG_LEVEL`, and
  `logger.child({ replId, ... })` so every line for a workspace is tagged with the join
  key. Converted the hot-path `console.*` calls (create/start/stop/reap, socket
  connect/disconnect, heartbeat, bootstrap) to carry `replId`, so one workspace can be
  grepped across init-service → orchestrator → runner.
**Defense:** "Liveness/readiness probes gate traffic — readiness actually checks Mongo /
  the seeded volume, not just process-up — and logs are structured JSON keyed by replId,
  so I can trace a single workspace across all three services."
**Note:** metrics endpoint (Prometheus) intentionally deferred — logs + probes cover the
  operational basics; a `/metrics` counter set would be the next stretch.

### 6. Deployment story `[ ]`
**Gap:** Only `runner` has a Dockerfile. Build artifacts (`aws.js`, `index.js`,
`tsbuildinfo`) are checked in. Hardcoded `peetcode.com` in `CodingPage.tsx`.
**Add:**
- Dockerfiles for `init-service` and `orchestrator-simple`.
- `docker-compose` for local dev (optionally against LocalStack/minikube).
- `.gitignore` the build artifacts; remove checked-in `.js`/`.tsbuildinfo`.
- Move hardcoded domain to config/env.
**Defense:** "compose up brings the whole plane up locally."

### 7. README + demo `[x]` DONE
**Gap:** README was 6 lines; no diagram, setup, screenshot, or live link.
**Done:**
- Full README: overview, CI badge, **Mermaid architecture diagram + request-lifecycle
  sequence diagram** (render natively on GitHub), a services table, a
  security & lifecycle design table (the defensible parts), tech stack, per-service
  local setup with env-var tables, a testing section, repo layout, and a roadmap.
**Still needs a human touch (can't generate here):**
- A screenshot/GIF of the workspace (placeholder + commented `docs/demo.gif` left in).
- A live demo link (depends on #6 deployment).
**Defense:** the diagrams show you can communicate a system, not just build one.

---

## Suggested sequencing
Max payoff for min time: **#4 → #1 → #2 → #7**, then #3, #5, #6.
Done so far: #3, #4, #1, #2, #7, #5. Remaining: **#6 only** (deployment: Dockerfiles for
init/orchestrator + docker-compose, de-hardcode the workspace domain, gitignore the
checked-in build artifacts).

## Target resume bullet (defensible once #1, #2, #4, #5 land)
> Built a Kubernetes-native disposable code-workspace platform (4 microservices,
> pod-per-session with idle-reaping, S3-seeded templates, Socket.IO+PTY streaming);
> containerized, CI-tested, with per-workspace resource limits and network isolation.
