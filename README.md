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

The backend is a Fastify service under `api/`. It clones public GitHub repositories,
runs deterministic JS/TS scanners, persists graph/context data in SQLite, and can
use Backboard for synthesis when `BACKBOARD_API_KEY` is configured.

```bash
cp .env.example .env
# Fill BACKBOARD_API_KEY in .env for real agent-backed scans.

cd api
npm install
npm run migrate
npm run dev
```

The default API URL is `http://localhost:3001`. The frontend reads it from
`NEXT_PUBLIC_ATLAS_API_URL`.

### Verification

```bash
cd api
npm run typecheck
npm test
npm run build

cd ../web
npm run lint
npm run build
```
