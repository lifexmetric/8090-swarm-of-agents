# Atlas

Atlas is a hackathon prototype for understanding inherited codebases before you change them.

Paste a GitHub repo URL and Atlas turns the system into a navigable 3D graph: services, modules, databases, queues, auth layers, config surfaces, and external APIs. The goal is to help engineers build a mental model quickly, then export the same structured context for AI agents.

The current demo uses a fictional `acme/payments-platform` bank payments system to show the intended product flow.

## What It Does

Atlas is built around one scan and two outputs:

- A human-readable 3D system map for exploration.
- An agent-ready context package with markdown files for every node, link, and system brief.

The graph is not just a dependency chart. Nodes explain what each part owns, why it exists, how confident the scan is, and where the risk is. Edges are first-class too: clicking a connection shows the code path, contract, failure behavior, criticality, confidence, and "before you change this" notes.

## Product Flow

1. Paste a GitHub repository URL on the landing page.
2. Atlas runs a scan that looks for structure, imports, service calls, API contracts, queues, config, environment references, and external dependencies.
3. The app opens a 3D graph clustered by domain.
4. Filter by node type, search by keyword, or focus on high-risk areas.
5. Click a node to inspect ownership, dependencies, dependents, confidence, and risk flags.
6. Click an edge to inspect the actual connection between two parts of the system.
7. Export the generated context package for agents or future handoff.

## Demo Pages

- `/` is the landing page with the repo input and scan animation.
- `/explore` is the interactive 3D graph for the sample payments platform.
- `/export` previews and downloads generated markdown context files.

## Why It Exists

Large inherited systems are hard because the important knowledge is spread across code, docs, config, queues, third-party APIs, and tribal memory. Atlas tries to make that shape visible. It shows what talks to what, which links are risky, and which conclusions are confirmed versus inferred.

The same scan powers both the visual map and the markdown export, so humans and agents work from the same model instead of separate guesses.

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Three.js / `react-force-graph-3d`
- `react-markdown` for context previews

## Run Locally

### Frontend

```bash
cd web
npm install
npm run dev
```

Then open the local Next.js URL shown in the terminal.

### Backend

The backend is a separate Fastify service under `api/`. It clones public
GitHub repositories, runs deterministic JS/TS scanners, sends compact scan
artifacts to Backboard, stores Backboard assistant/thread metadata, and
persists evidence-backed graph data in SQLite.

```bash
cp .env.example .env
# Fill BACKBOARD_API_KEY in .env. Do not commit .env.

cd api
npm install
npm run migrate
npm run dev
```

The default API URL is `http://127.0.0.1:3001`. SQLite is stored at
`.atlas/atlas.db` from `DATABASE_URL=file:./.atlas/atlas.db`.

### Required API Endpoints

- `POST /api/scans`
- `GET /api/scans/:scanId`
- `GET /api/scans/:scanId/events`
- `GET /api/scans/:scanId/graph`
- `GET /api/workspaces/:workspaceId/graph`
- `GET /api/repositories`
- `GET /api/nodes/:nodeId`
- `GET /api/edges/:edgeId`
- `GET /api/scans/:scanId/context`
- `GET /api/scans/:scanId/export`

### Verification

Backend checks:

```bash
cd api
npm run typecheck
npm test
```

Frontend checks:

```bash
cd web
npm run lint
npm run build
```

Real Backboard verification requires the local `.env` to include
`BACKBOARD_API_KEY`. Start the backend, then run:

```bash
cd api
npm run verify:public
```

The verification script scans:

- `https://github.com/fastify/fastify-plugin`
- `https://github.com/fastify/fastify-autoload`

Those repos are small public JS/TS repositories with a package-level
relationship: `fastify-autoload` depends on the `fastify-plugin` package
produced by `fastify-plugin`. Atlas uses that dependency declaration as
evidence for a supported cross-repo workspace graph connection.
