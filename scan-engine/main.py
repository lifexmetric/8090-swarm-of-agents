import os
import json
import shutil
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from scanner.repo import clone_repo, discover_services, read_files, repo_id_from_url
from scanner.embedder import warm, get_or_create_collection, embed_service, list_collections, _get_client
from scanner.queries import run_probes
from scanner.synthesize import synthesize
from scanner.code_graph import extract_repo_graph, extract_service_graph
from scanner.summarize import summarize_repo


# ── startup: warm the embedding model so first /scan isn't slow ───────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        warm()
        print('[startup] embedding model warmed successfully')
    except Exception as e:
        print(f'[startup] WARNING: model warm failed: {e}')
        print('[startup] /embed and /scan will fail until the model is available')
    yield


app = FastAPI(title='Scan Engine', version='2.0.0', lifespan=lifespan)

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
    anthropic_api_key: str | None = None
    branch: str | None = None
    folders: list[str] | None = None


class EmbedRequest(BaseModel):
    repo_url: str
    github_pat: str | None = None
    branch: str | None = None
    folders: list[str] | None = None


class ScanResponse(BaseModel):
    nodes: list[dict]
    links: list[dict]
    flows: list = []
    meta: dict = {}
    summary: dict = {}
    code_graph: dict = {}


# ── routes ────────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'scan-engine', 'port': 8010}


@app.get('/health/model')
def health_model():
    """Check if the embedding model is loaded and return info."""
    from scanner.embedder import _session, _tokenizer, ONNX_PATH, TOKENIZER_FILE
    return {
        'model_loaded': _session is not None,
        'onnx_path': str(ONNX_PATH),
        'onnx_exists': ONNX_PATH.exists(),
        'tokenizer_path': str(TOKENIZER_FILE),
        'tokenizer_exists': TOKENIZER_FILE.exists(),
    }


@app.get('/repos')
def list_repos():
    """List all embedded repos."""
    repos = list_collections()
    result = []
    for repo_id in repos:
        try:
            coll = get_or_create_collection(repo_id)
            result.append({
                'repo_id': repo_id,
                'chunks': coll.count(),
            })
        except Exception:
            pass
    return {'repos': result}


@app.post('/embed')
async def embed(req: EmbedRequest):
    """Embed a repo and extract its code graph. Does NOT call Claude."""
    repo_id = repo_id_from_url(req.repo_url)
    repo_dir = None
    try:
        print(f'[embed] cloning {req.repo_url} (repo_id={repo_id}) branch={req.branch or "default"}')
        repo_dir = clone_repo(req.repo_url, req.github_pat, req.branch)

        services = discover_services(repo_dir, req.folders)
        if not services:
            raise HTTPException(400, 'No services detected — no Dockerfile / go.mod / package.json found')
        print(f'[embed] found {len(services)} service(s): {[s["name"] for s in services]}')

        # Embed code into persistent ChromaDB
        collection = get_or_create_collection(repo_id)
        # If already has data, skip re-embedding
        if collection.count() > 0:
            print(f'[embed] collection already has {collection.count()} chunks, skipping embedding')
        else:
            for svc in services:
                files = read_files(svc['path'])
                print(f'[embed]   {svc["name"]}: {len(files)} files, embedding...')
                embed_service(collection, svc['name'], files)
                print(f'[embed]   {svc["name"]}: done ({collection.count()} total chunks)')
            print(f'[embed] total: {collection.count()} chunks')

        # Extract code graph with tree-sitter
        print('[embed] extracting code graph with tree-sitter...')
        code_graph = extract_repo_graph(services)

        # Generate summary
        summary = summarize_repo(services, code_graph)
        print(f'[embed] summary: {summary["total_files"]} files, {summary["total_functions"]} functions, {summary["total_classes"]} classes')

        return {
            'repo_id': repo_id,
            'summary': summary,
            'code_graph': code_graph,
        }

    except HTTPException:
        raise
    except subprocess.CalledProcessError as e:
        raise HTTPException(422, f'git clone failed: {e.stderr.decode()[:200]}')
    except (MemoryError, OSError) as e:
        print(f'[embed] OOM/error: {e}')
        raise HTTPException(500, 'Embedding failed — repo too large or insufficient memory. Try a smaller repo or increase Docker memory limit (Docker Desktop > Settings > Resources).')
    except Exception as e:
        print(f'[embed] error: {e}')
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))
    finally:
        if repo_dir:
            shutil.rmtree(repo_dir, ignore_errors=True)


@app.get('/code-graph/{repo_id}')
async def get_code_graph(repo_id: str):
    """Get the full code graph for a repo. Re-extracts from the repo on disk."""
    # For now, we re-clone and re-extract. In future, cache the code graph.
    # The caller should provide the repo_url if the repo isn't cached.
    raise HTTPException(501, 'Use GET /code-graph/{repo_id}/{service_name} for per-service graphs, or POST /embed to get the full graph.')


@app.get('/code-graph/{repo_id}/{service_name}')
async def get_service_code_graph(repo_id: str, service_name: str):
    """Get the code graph for a specific service in an embedded repo.

    Since we don't store the repo on disk after embedding, this requires
    the repo to be bind-mounted. For the local banking-system, the repo
    is available at /repo.
    """
    repo_root = os.environ.get('REPO_ROOT', '/repo')

    # Try to find the service folder in the mounted repo
    from scanner.repo import discover_services, SERVICE_MARKERS
    from pathlib import Path

    root_path = Path(repo_root)
    if not root_path.exists():
        raise HTTPException(404, f'Repo root not found at {repo_root}')

    services = discover_services(repo_root)
    svc = next((s for s in services if s['name'] == service_name), None)
    if not svc:
        raise HTTPException(404, f'Service {service_name} not found in repo')

    graph = extract_service_graph(service_name, svc['path'])
    return graph


@app.post('/scan')
async def scan(req: ScanRequest):
    api_key = req.anthropic_api_key or os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise HTTPException(400, 'anthropic_api_key required (body or ANTHROPIC_API_KEY env var)')

    repo_id = repo_id_from_url(req.repo_url)

    def sse(obj):
        return f'data: {json.dumps(obj)}\n\n'

    def generate():
        repo_dir = None
        try:
            # 1. Clone
            branch_label = f' branch={req.branch}' if req.branch else ''
            folders_label = f' folders={req.folders}' if req.folders else ''
            yield sse({'type': 'progress', 'step': 'cloning', 'message': f'Cloning {req.repo_url}{branch_label}{folders_label}...'})
            print(f'[scan] cloning {req.repo_url} (repo_id={repo_id}){branch_label}{folders_label}')
            repo_dir = clone_repo(req.repo_url, req.github_pat, req.branch)

            # 2. Discover services
            services = discover_services(repo_dir, req.folders)
            if not services:
                yield sse({'type': 'error', 'message': 'No services detected — no Dockerfile / go.mod / package.json found'})
                return
            print(f'[scan] found {len(services)} service(s): {[s["name"] for s in services]}')
            yield sse({'type': 'progress', 'step': 'discovering', 'message': f'Found {len(services)} services: {", ".join(s["name"] for s in services[:5])}'})

            # 3. Embed (reuse if already embedded)
            collection = get_or_create_collection(repo_id)
            if collection.count() > 0:
                print(f'[scan] reusing existing {collection.count()} chunks')
                yield sse({'type': 'progress', 'step': 'embedding', 'message': f'Reusing {collection.count()} existing chunks'})
            else:
                for svc in services:
                    files = read_files(svc['path'])
                    yield sse({'type': 'progress', 'step': 'embedding', 'message': f'Embedding {svc["name"]}: {len(files)} files...'})
                    print(f'[scan]   {svc["name"]}: {len(files)} files, embedding...')
                    embed_service(collection, svc['name'], files)
                    print(f'[scan]   {svc["name"]}: done ({collection.count()} total chunks)')
                    yield sse({'type': 'progress', 'step': 'embedding', 'message': f'{svc["name"]}: done ({collection.count()} total chunks)'})
                print(f'[scan] total: {collection.count()} chunks')

            # 4. Extract code graph
            yield sse({'type': 'progress', 'step': 'code_graph', 'message': 'Extracting code graph with tree-sitter...'})
            print('[scan] extracting code graph...')
            code_graph = extract_repo_graph(services)
            summary = summarize_repo(services, code_graph)
            yield sse({'type': 'progress', 'step': 'code_graph', 'message': f'Code graph: {summary["total_files"]} files, {summary["total_functions"]} functions, {summary["total_classes"]} classes'})

            # 5. Semantic probes per service
            yield sse({'type': 'progress', 'step': 'probing', 'message': 'Running semantic probes...'})
            evidence: dict[str, dict] = {}
            for svc in services:
                evidence[svc['name']] = run_probes(collection, svc['name'])

            # 6. Claude synthesises the architecture graph
            yield sse({'type': 'progress', 'step': 'synthesizing', 'message': 'Asking Claude to synthesise architecture...'})
            print('[scan] synthesising architecture graph with Claude...')
            graph = synthesize(api_key, services, evidence)

            result = {
                'nodes': graph.get('nodes', []),
                'links': graph.get('links', []),
                'flows': [],
                'meta': {
                    'repo': req.repo_url,
                    'repo_id': repo_id,
                    'services_found': len(services),
                    'nodes': len(graph.get('nodes', [])),
                    'links': len(graph.get('links', [])),
                },
                'summary': summary,
                'code_graph': code_graph,
            }
            yield sse({'type': 'result', 'data': result})

        except subprocess.CalledProcessError as e:
            yield sse({'type': 'error', 'message': f'git clone failed: {e.stderr.decode()[:200]}'})
        except (MemoryError, OSError) as e:
            print(f'[scan] OOM/error: {e}')
            yield sse({'type': 'error', 'message': 'Embedding failed — repo too large or insufficient memory. Try a smaller repo or increase Docker memory limit.'})
        except Exception as e:
            print(f'[scan] error: {e}')
            import traceback
            traceback.print_exc()
            yield sse({'type': 'error', 'message': str(e)})
        finally:
            if repo_dir:
                shutil.rmtree(repo_dir, ignore_errors=True)

    return StreamingResponse(generate(), media_type='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })
