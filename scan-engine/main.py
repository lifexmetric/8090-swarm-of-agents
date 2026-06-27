import os
import shutil
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scanner.repo import clone_repo, discover_services, read_files
from scanner.embedder import make_collection, embed_service
from scanner.queries import run_probes
from scanner.synthesize import synthesize


# ── startup: warm the embedding model so first /scan isn't slow ───────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    from scanner.embedder import warm
    warm()
    yield


app = FastAPI(title='Scan Engine', version='1.0.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


# ── models ────────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    repo_url: str
    github_pat: str | None = None
    # If omitted, falls back to ANTHROPIC_API_KEY env var
    anthropic_api_key: str | None = None


class ScanResponse(BaseModel):
    nodes: list[dict]
    links: list[dict]
    flows: list = []
    meta: dict = {}


# ── routes ────────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'scan-engine', 'port': 8010}


@app.post('/scan', response_model=ScanResponse)
async def scan(req: ScanRequest):
    api_key = req.anthropic_api_key or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise HTTPException(400, 'anthropic_api_key required (body or ANTHROPIC_API_KEY env var)')

    repo_dir = None
    try:
        # 1. Clone
        print(f'[scan] cloning {req.repo_url}')
        repo_dir = clone_repo(req.repo_url, req.github_pat)

        # 2. Discover services
        services = discover_services(repo_dir)
        if not services:
            raise HTTPException(400, 'No services detected — no Dockerfile / go.mod / package.json found')
        print(f'[scan] found {len(services)} service(s): {[s["name"] for s in services]}')

        # 3. Embed all files into one shared in-memory collection
        collection = make_collection()
        for svc in services:
            files = read_files(svc['path'])
            print(f'[scan]   {svc["name"]}: {len(files)} files')
            embed_service(collection, svc['name'], files)

        # 4. Semantic probes per service
        evidence: dict[str, dict] = {}
        for svc in services:
            evidence[svc['name']] = run_probes(collection, svc['name'])

        # 5. Claude synthesises the graph
        print('[scan] synthesising graph with Claude...')
        graph = synthesize(api_key, services, evidence)

        return ScanResponse(
            nodes=graph.get('nodes', []),
            links=graph.get('links', []),
            flows=[],
            meta={
                'repo': req.repo_url,
                'services_found': len(services),
                'nodes': len(graph.get('nodes', [])),
                'links': len(graph.get('links', [])),
            },
        )

    except HTTPException:
        raise
    except subprocess.CalledProcessError as e:
        raise HTTPException(422, f'git clone failed: {e.stderr.decode()[:200]}')
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        if repo_dir:
            shutil.rmtree(repo_dir, ignore_errors=True)
