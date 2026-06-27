import os
from pathlib import Path
from typing import List

import numpy as np
import chromadb
from chromadb import EmbeddingFunction, Documents, Embeddings

MODELS_DIR     = Path(os.environ.get('MODELS_DIR', str(Path(__file__).parent.parent / 'models')))
ONNX_PATH      = MODELS_DIR / 'onnx' / 'model_quantized.onnx'
TOKENIZER_FILE = MODELS_DIR / 'tokenizer' / 'tokenizer.json'

# Jina needs no task prefixes — keep empty so queries.py import works unchanged
QUERY_PREFIX = ''
DOC_PREFIX   = ''

_session   = None
_tokenizer = None


def warm():
    _load()


def _load():
    global _session, _tokenizer
    if _session is not None:
        return

    from tokenizers import Tokenizer
    import onnxruntime as ort

    if not ONNX_PATH.exists():
        raise RuntimeError(
            f'ONNX model not found at {ONNX_PATH}. '
            'Rebuild the Docker image: docker compose build scan-engine'
        )

    print(f'[embedder] loading tokenizer from {TOKENIZER_FILE}')
    tok = Tokenizer.from_file(str(TOKENIZER_FILE))
    tok.enable_padding(pad_id=0, pad_token='[PAD]')
    tok.enable_truncation(max_length=8192)
    _tokenizer = tok

    print(f'[embedder] loading {ONNX_PATH.name} via onnxruntime (int8)')
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = os.cpu_count() or 4
    _session = ort.InferenceSession(
        str(ONNX_PATH),
        sess_options=opts,
        providers=['CPUExecutionProvider'],
    )
    print('[embedder] ready')


def _embed(texts: list[str]) -> np.ndarray:
    _load()

    micro_batch = int(os.environ.get('EMBED_MICRO_BATCH', '8'))
    results = []

    for i in range(0, len(texts), micro_batch):
        sub = texts[i: i + micro_batch]
        encodings = _tokenizer.encode_batch(sub)
        input_ids      = np.array([e.ids            for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask  for e in encodings], dtype=np.int64)

        input_names = {inp.name for inp in _session.get_inputs()}
        feed: dict = {'input_ids': input_ids, 'attention_mask': attention_mask}
        if 'token_type_ids' in input_names:
            feed['token_type_ids'] = np.array([e.type_ids for e in encodings], dtype=np.int64)

        token_embeds = _session.run(None, feed)[0].astype(np.float32)  # [B, seq, dim]

        mask   = attention_mask[..., np.newaxis].astype(np.float32)
        pooled = (token_embeds * mask).sum(axis=1) / mask.sum(axis=1).clip(min=1e-9)
        norms  = np.linalg.norm(pooled, axis=1, keepdims=True).clip(min=1e-9)
        results.append(pooled / norms)

    return np.concatenate(results, axis=0).astype(np.float32)


class JinaCodeEmbedding(EmbeddingFunction):
    """ChromaDB EmbeddingFunction — jinaai/jina-embeddings-v2-base-code, ONNX int8."""

    def __call__(self, docs: Documents) -> Embeddings:
        return _embed(list(docs)).tolist()


_chroma_client = None


def _get_client() -> chromadb.ClientAPI:
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client
    chroma_path = os.environ.get('CHROMA_PATH', '/app/data/chroma')
    os.makedirs(chroma_path, exist_ok=True)
    print(f'[embedder] initialising persistent ChromaDB at {chroma_path}')
    _chroma_client = chromadb.PersistentClient(path=chroma_path)
    return _chroma_client


def get_or_create_collection(repo_id: str) -> chromadb.Collection:
    """Get an existing collection or create a new one for this repo."""
    client = _get_client()
    coll = client.get_or_create_collection(
        name=f'repo_{repo_id}',
        embedding_function=JinaCodeEmbedding(),
        metadata={'repo_id': repo_id},
    )
    print(f'[embedder] collection repo_{repo_id}: {coll.count()} chunks')
    return coll


def list_collections() -> list[str]:
    """List all embedded repo IDs."""
    client = _get_client()
    names = [c.name for c in client.list_collections()]
    return [n.replace('repo_', '', 1) for n in names if n.startswith('repo_')]


def delete_collection(repo_id: str):
    """Delete a repo's collection."""
    client = _get_client()
    try:
        client.delete_collection(name=f'repo_{repo_id}')
        print(f'[embedder] deleted collection repo_{repo_id}')
    except Exception:
        pass


def make_collection(name: str = 'repo') -> chromadb.Collection:
    """Legacy: create a fresh ephemeral collection. Use get_or_create_collection instead."""
    return get_or_create_collection(name.replace('repo_', '', 1) if name.startswith('repo_') else name)


# ── chunking ──────────────────────────────────────────────────────────────────

CHUNK_LINES = 40


def _chunks(rel_path: str, content: str) -> List[dict]:
    lines = content.split('\n')
    result = []
    for i in range(0, len(lines), CHUNK_LINES):
        body = '\n'.join(lines[i: i + CHUNK_LINES]).strip()
        if body:
            result.append({
                'id':   f'{rel_path}::L{i + 1}',
                'doc':  body,
                'meta': {'file': rel_path, 'line': i + 1},
            })
    return result


def embed_service(collection: chromadb.Collection, service_name: str, files: list[dict], on_progress=None):
    ids, docs, metas = [], [], []

    for f in files:
        for chunk in _chunks(f['rel_path'], f['content']):
            ids.append(f"{service_name}::{chunk['id']}")
            docs.append(chunk['doc'])
            metas.append({'service': service_name, **chunk['meta']})

    if not ids:
        return

    batch = 32
    total_batches = (len(ids) + batch - 1) // batch
    print(f'[embedder] embedding {len(ids)} chunks in {total_batches} batches (micro_batch={os.environ.get("EMBED_MICRO_BATCH", "8")})')

    for i in range(0, len(ids), batch):
        batch_num = i // batch + 1
        if batch_num % 5 == 0 or batch_num == total_batches:
            print(f'[embedder]   batch {batch_num}/{total_batches}')
        if on_progress:
            on_progress(batch_num, total_batches, service_name)
        collection.add(
            ids=ids[i: i + batch],
            documents=docs[i: i + batch],
            metadatas=metas[i: i + batch],
        )
