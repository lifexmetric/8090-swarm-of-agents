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

    encodings = _tokenizer.encode_batch(texts)
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
    return (pooled / norms).astype(np.float32)


class JinaCodeEmbedding(EmbeddingFunction):
    """ChromaDB EmbeddingFunction — jinaai/jina-embeddings-v2-base-code, ONNX int8."""

    def __call__(self, docs: Documents) -> Embeddings:
        return _embed(list(docs)).tolist()


def make_collection(name: str = 'repo') -> chromadb.Collection:
    client = chromadb.EphemeralClient()
    return client.create_collection(name, embedding_function=JinaCodeEmbedding())


# ── chunking ──────────────────────────────────────────────────────────────────

CHUNK_LINES = 60


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


def embed_service(collection: chromadb.Collection, service_name: str, files: list[dict]):
    ids, docs, metas = [], [], []

    for f in files:
        for chunk in _chunks(f['rel_path'], f['content']):
            ids.append(f"{service_name}::{chunk['id']}")
            docs.append(chunk['doc'])
            metas.append({'service': service_name, **chunk['meta']})

    if not ids:
        return

    batch = 2000
    for i in range(0, len(ids), batch):
        collection.add(
            ids=ids[i: i + batch],
            documents=docs[i: i + batch],
            metadatas=metas[i: i + batch],
        )
