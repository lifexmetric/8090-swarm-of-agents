from .embedder import QUERY_PREFIX

# Each probe targets a specific architecture signal.
# query text gets the QUERY_PREFIX; stored docs already have DOC_PREFIX.
PROBES = [
    {
        'name': 'http_clients',
        'query': QUERY_PREFIX + 'HTTP client fetch request send to URL service endpoint',
    },
    {
        'name': 'grpc_clients',
        'query': QUERY_PREFIX + 'gRPC dial stub client call proto service',
    },
    {
        'name': 'database_connections',
        'query': QUERY_PREFIX + 'database connect pool DSN connection string postgres mysql mongo redis',
    },
    {
        'name': 'message_queue',
        'query': QUERY_PREFIX + 'kafka producer consumer publish subscribe topic message queue AMQP',
    },
    {
        'name': 'external_apis',
        'query': QUERY_PREFIX + 'external API key client SDK stripe sendgrid twilio payment third party',
    },
    {
        'name': 'server_listen',
        'query': QUERY_PREFIX + 'server listen port bind address HTTP start serve',
    },
    {
        'name': 'auth_middleware',
        'query': QUERY_PREFIX + 'authentication JWT bearer token middleware auth validate',
    },
]

N_RESULTS = 6  # top-k chunks per probe per service


def run_probes(collection, service_name: str) -> dict[str, list[dict]]:
    """
    Run all probes against one service's embeddings.
    Returns {probe_name: [{file, line, content}, ...]}
    """
    total = collection.count()
    if total == 0:
        return {p['name']: [] for p in PROBES}

    results: dict[str, list[dict]] = {}

    for probe in PROBES:
        try:
            res = collection.query(
                query_texts=[probe['query']],
                n_results=min(N_RESULTS, total),
                where={'service': service_name},
            )
            chunks = []
            for doc, meta in zip(res['documents'][0], res['metadatas'][0]):
                chunks.append({
                    'file': meta['file'],
                    'line': meta['line'],
                    'content': doc,
                })
            results[probe['name']] = chunks
        except Exception:
            results[probe['name']] = []

    return results
