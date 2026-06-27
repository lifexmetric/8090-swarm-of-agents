# Codebase Visualizer

A 3D architecture explorer with live health monitoring and an embedded Claude agent that diagnoses incidents and opens GitHub PRs to fix them.

```
banking-system/   demo fixture — 8 microservices, docker-compose, CALM 1.2 architecture doc
platform/         backend — evidence collection, Claude agent sessions, encrypted key storage
scan-engine/      Python FastAPI — embed any GitHub repo with nomic-embed-code → Claude graph
visualizer/       frontend — 3D graph, live health overlay, evidence panel, agent panel
```

---

## Prerequisites

**Docker & Docker Compose.** That's it — everything runs in containers.

---

## Setup (first time)

### 1. Start the banking system

```bash
cd banking-system
cp .env.example .env
docker compose up -d
```

The `.env.example` already has working mock values — no edits needed.

Wait ~20 s for Postgres, Kafka, and the eight services to initialise. Check http://localhost:3000/dashboard — all rows should show **UP** before continuing.

### 2. Start the visualizer stack

From the **repo root**:

```bash
cp .env.example .env
# optional: set ANTHROPIC_API_KEY=sk-ant-... in .env (only needed for Scan Repo)
docker compose up -d --build
```

This builds and starts **platform** (3001), **scan-engine** (8010), and **visualizer** (5173).

**First run:** the scan-engine downloads `nomic-embed-code` int8 ONNX (~120 MB) into `scan-engine/models/`. Subsequent starts load it from disk in a few seconds.

Open **http://localhost:5173** — you should see the 3D graph of the banking system.

---

## Demo: break → diagnose → fix

### Step 1 — Break the system

Open a terminal in `banking-system/` and run:

```bash
make break-swift
```

This flips the SWIFT endpoint in the payments service from `/v2/transfers` to `/v3/transfers`, commits it to git, and rebuilds the container.

**In the visualizer within ~5 seconds:** the `payments-service` node turns **red** and its edges to the SWIFT rail pulse.

### Step 2 — Collect evidence

1. Click the red **payments-service** node → the node panel opens on the right
2. Click **Collect Evidence**
3. The **Logs** tab shows live 500 errors from the container
4. Switch to the **Commits** tab — the breaking commit is at the top with the diff:
   ```diff
   - url := baseURL + "/v2/transfers"
   + url := baseURL + "/v3/transfers"
   ```
5. Click **Send to Agent →**

### Step 3 — Configure keys (first time only)

The agent panel opens. Click the **gear icon** to enter your keys:

| Field | Value |
|---|---|
| Anthropic API Key | From https://console.anthropic.com |
| GitHub PAT | GitHub → Settings → Developer settings → Personal access tokens → `repo` scope |
| GitHub Repo | `owner/repo` — the repo you want the fix PR opened against |

Keys are AES-256-GCM encrypted and stored in `platform/data/platform.db`. They never leave your machine.

### Step 4 — Diagnose

Click **Diagnose with Claude**. Claude streams its reasoning in the panel, then surfaces:

- **Root cause** — the `/v3/transfers` endpoint doesn't exist on the SWIFT rail
- **File to fix** — the exact Go file path
- **Explanation** — what changed and why it broke

### Step 5 — Create the PR

Click **Create PR**. The platform calls the GitHub API to:

1. Create branch `fix/payments-swift-endpoint`
2. Commit the corrected file
3. Open a PR with Claude's diagnosis in the body

A link to the PR appears in the panel.

### Step 6 — Restore

```bash
make fix-swift
```

This reverts the endpoint change and rebuilds the container. The `payments-service` node turns green within 5 seconds.

---

## Scan any repo (optional)

Click **Scan Repo** in the top bar, paste any GitHub URL, and enter your Anthropic API key. The scan engine clones the repo, embeds all code files with `nomic-embed-code`, runs semantic probes for HTTP clients / DB connections / queues / auth, and asks Claude to extract the architecture. The graph replaces the banking-system view.

Private repos: add a GitHub PAT with `repo` scope in the scan modal.

---

## Teardown

```bash
# stop banking system
cd banking-system && docker compose down

# stop visualizer stack (from repo root)
docker compose down

# remove volumes too (deletes encrypted key store + downloaded model)
docker compose down -v
cd banking-system && docker compose down -v
```

---

## Ports

| Port | Service |
|---|---|
| 3000 | API Gateway (banking system) |
| 3001 | Platform (evidence + agent) |
| 5173 | Visualizer |
| 8010 | Scan engine |
| 5432 | Postgres — auth |
| 5433 | Postgres — bank |
| 6379 | Redis |
| 9092 | Kafka |
| 9999 | Mock SWIFT rail |

---

## Security notes

- `platform/data/` is gitignored — holds the AES-256-GCM encrypted key store
- `.env` is gitignored — only `.env.example` with placeholder values is committed
- `scan-engine/models/` is gitignored — model weights stay on disk, not in git
- Banking-system credentials in `.env.example` are mock values for local Docker only
