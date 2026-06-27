"""Generate a repo summary from discovered services + code graph."""

from collections import Counter


def summarize_repo(services: list[dict], code_graph: dict) -> dict:
    """Build a summary of the repo for display.

    Args:
        services: list of service dicts from discover_services
        code_graph: output of extract_repo_graph

    Returns: { repo_id, total_files, total_functions, total_classes, languages, services: [...] }
    """
    total_files = 0
    total_functions = 0
    total_classes = 0
    lang_counter: Counter = Counter()
    svc_summaries = []

    for svc in services:
        name = svc['name']
        graph = code_graph.get('services', {}).get(name, {})
        nodes = graph.get('nodes', [])

        files = [n for n in nodes if n['type'] == 'file']
        functions = [n for n in nodes if n['type'] == 'function']
        classes = [n for n in nodes if n['type'] == 'class']

        for f in files:
            lang_counter[f.get('language', 'unknown')] += 1

        total_files += len(files)
        total_functions += len(functions)
        total_classes += len(classes)

        svc_summaries.append({
            'name': name,
            'path': svc['rel_path'],
            'marker': svc['marker'],
            'files': len(files),
            'functions': len(functions),
            'classes': len(classes),
        })

    return {
        'total_files': total_files,
        'total_functions': total_functions,
        'total_classes': total_classes,
        'languages': dict(lang_counter.most_common()),
        'services': svc_summaries,
    }
