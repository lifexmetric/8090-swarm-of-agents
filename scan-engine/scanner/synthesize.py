from anthropic import Anthropic

SUBMIT_TOOL = {
    'name': 'submit_graph',
    'description': 'Submit the extracted architecture graph as nodes and links.',
    'input_schema': {
        'type': 'object',
        'required': ['nodes', 'links'],
        'properties': {
            'nodes': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'required': ['id', 'name', 'nodeType'],
                    'properties': {
                        'id':          {'type': 'string', 'description': 'kebab-case unique id'},
                        'name':        {'type': 'string'},
                        'nodeType':    {'type': 'string', 'enum': ['service', 'database', 'system', 'ecosystem', 'actor', 'webclient', 'network']},
                        'description': {'type': 'string'},
                        'technology':  {'type': 'string', 'description': 'e.g. PostgreSQL, Redis, Kafka'},
                        'language':    {'type': 'string', 'description': 'e.g. Go, Python, TypeScript'},
                        'port':        {'type': 'integer'},
                        'confidence':  {'type': 'string', 'enum': ['confirmed', 'inferred', 'uncertain']},
                    },
                },
            },
            'links': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'required': ['source', 'target', 'protocol'],
                    'properties': {
                        'source':      {'type': 'string', 'description': 'node id'},
                        'target':      {'type': 'string', 'description': 'node id'},
                        'protocol':    {'type': 'string', 'description': 'e.g. HTTPS, AMQP, JDBC, gRPC, Redis, MongoDB'},
                        'criticality': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                        'description': {'type': 'string'},
                        'confidence':  {'type': 'string', 'enum': ['confirmed', 'inferred', 'uncertain']},
                    },
                },
            },
        },
    },
}

SYSTEM_PROMPT = """\
You are an expert software architect performing a codebase scan.
You will receive discovered services and code evidence found via semantic search.

Your job: extract the architecture as a graph.

Node types:
- service     → microservice, API server, backend app
- database    → any datastore: postgres, mysql, mongo, redis, neo4j, etc.
- system      → infrastructure: kafka, rabbitmq, k8s, etc.
- ecosystem   → external third-party APIs (stripe, sendgrid, twilio, swift, etc.)
- actor       → human user, CLI
- webclient   → browser frontend, mobile app

Link protocol examples: HTTPS, HTTP, gRPC, AMQP, JDBC, TCP, Redis, MongoDB, WebSocket

confidence:
- confirmed  → explicitly configured (docker-compose, config file)
- inferred   → found in code patterns (import, connect call, URL string)
- uncertain  → referenced by name only, no implementation found

Rules:
- Only emit nodes and links you have actual evidence for
- Never hallucinate connections
- Use kebab-case ids matching service folder names where possible
- Call submit_graph exactly once\
"""


def _build_prompt(services: list[dict], evidence: dict[str, dict]) -> str:
    lines = ['## Discovered services\n']
    for s in services:
        lines.append(f"- **{s['name']}** path=`{s['rel_path']}` marker=`{s['marker']}`")

    lines.append('\n## Semantic search evidence\n')
    for svc_name, probes in evidence.items():
        has_any = any(chunks for chunks in probes.values())
        if not has_any:
            continue
        lines.append(f'\n### {svc_name}\n')
        for probe_name, chunks in probes.items():
            if not chunks:
                continue
            lines.append(f'**{probe_name}**:')
            for chunk in chunks[:4]:  # top 4 per probe keeps the prompt tight
                snippet = chunk['content'][:350].replace('\n', '\n  ')
                lines.append(f'`{chunk["file"]}` L{chunk["line"]}:\n```\n  {snippet}\n```')

    return '\n'.join(lines)


def synthesize(api_key: str, services: list[dict], evidence: dict[str, dict]) -> dict:
    client = Anthropic(api_key=api_key)
    prompt = _build_prompt(services, evidence)

    response = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': prompt}],
        tools=[SUBMIT_TOOL],
        tool_choice={'type': 'any'},
    )

    for block in response.content:
        if block.type == 'tool_use' and block.name == 'submit_graph':
            return block.input

    raise RuntimeError('Claude did not call submit_graph')
