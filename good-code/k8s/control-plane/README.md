# Control-plane deployment (Kubernetes)

Manifests for the long-lived services — the per-repl **workspace** pods are
created dynamically by the orchestrator from `orchestrator-simple/service.yaml`,
not from here.

| File | What it creates |
|------|-----------------|
| `secrets.example.yaml` | `peppl-control`, `peppl-workspace`, `peppl-internal` secrets (copy → `secrets.yaml`, fill in) |
| `init-service.yaml` | init-service Deployment + Service (`:3001`) |
| `orchestrator.yaml` | orchestrator ServiceAccount + RBAC + Deployment + Service (`orchestrator-simple:3002`) |
| `frontend.yaml` | nginx Deployment + Service (`:80`) |
| `ingress.yaml` | control-plane ingress (frontend + both APIs) |
| `../reaper-cronjob.yaml` | idle-workspace reaper (every 5 min) |
| `../ingress-controller.yaml` | vendored ingress-nginx install |

## Prerequisites

- A cluster with a **NetworkPolicy-enforcing CNI** (Calico / Cilium / GKE Dataplane V2).
  On a plain CNI the per-repl egress policy is a silent no-op.
- **ingress-nginx** installed (`kubectl apply -f ../ingress-controller.yaml`).
- A **container registry** holding the four images (see below).
- **MongoDB** reachable from the cluster (e.g. Atlas).
- **S3** (or MinIO) with the `base/<lang>/` templates seeded — see `/templates/README.md`.
- Two DNS names: a **wildcard** `*.<WORKSPACE_BASE_DOMAIN>` → the ingress LB (for
  workspace pods), and control-plane hosts (see `ingress.yaml`). Wildcard TLS
  matters because workspace sockets use `wss`.

## Build & push images

From each service dir (tag with your registry):

```bash
docker build -t ghcr.io/OWNER/peppl-init-service:latest good-code/init-service
docker build -t ghcr.io/OWNER/peppl-orchestrator:latest good-code/orchestrator-simple
docker build -t ghcr.io/OWNER/peppl-runner:latest       good-code/runner
docker build -t ghcr.io/OWNER/peppl-frontend:latest \
  --build-arg VITE_CONTROL_PLANE_URL=https://api.peppl.app \
  --build-arg VITE_ORCHESTRATOR_URL=https://orchestrator.peppl.app \
  --build-arg VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com \
  --build-arg VITE_WORKSPACE_BASE_DOMAIN=peetcode.com \
  --build-arg VITE_OUTPUT_BASE_DOMAIN=autogpt-cloud.com \
  good-code/frontend
docker push ghcr.io/OWNER/peppl-*        # push all four
```

Then set the four `image:` fields (and `RUNNER_IMAGE` in `orchestrator.yaml`) to
your pushed tags.

## Apply

```bash
kubectl apply -f ../ingress-controller.yaml         # once
cp secrets.example.yaml secrets.yaml                 # then edit real values
kubectl apply -f secrets.yaml
kubectl apply -f init-service.yaml -f orchestrator.yaml -f frontend.yaml
kubectl apply -f ingress.yaml
kubectl apply -f ../reaper-cronjob.yaml
```

## Wiring notes (things that must line up)

- The orchestrator Service is **`orchestrator-simple:3002`** — the reaper, the
  runner heartbeat (`WORKSPACE_ORCHESTRATOR_URL`), and the per-repl NetworkPolicy
  (`podSelector app=orchestrator-simple`) all depend on that exact name/port.
- `JWT_SECRET`, `WORKSPACE_TOKEN_SECRET`, and the internal token must be
  **identical** across the secrets that share them (see `secrets.example.yaml`).
- `WORKSPACE_BASE_DOMAIN` / `OUTPUT_BASE_DOMAIN` set on the orchestrator (server
  render) must match the frontend's `VITE_WORKSPACE_BASE_DOMAIN` /
  `VITE_OUTPUT_BASE_DOMAIN` (client), or the browser dials a host the ingress
  doesn't route.
- `RUNNER_IMAGE` on the orchestrator is what actually runs user code — point it at
  your pushed runner image, not the upstream `100xdevs/runner`.
