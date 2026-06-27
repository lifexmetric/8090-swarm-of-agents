"""Extract a code-level graph (files, classes, functions, calls) using tree-sitter."""

from __future__ import annotations
from pathlib import Path
from typing import Optional

from .repo import read_files, SKIP_DIRS, CODE_EXTS

# ── Language mapping ──────────────────────────────────────────────────────────

LANG_MAP = {
    'go': 'go',
    'py': 'python',
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'java': 'java',
    'kt': 'kotlin',
    'rs': 'rust',
    'rb': 'ruby',
    'cs': 'c_sharp',
    'cpp': 'cpp',
    'c': 'c',
}

# Node types per language that represent definitions
FUNCTION_NODES = {
    'go': ['function_declaration', 'method_declaration'],
    'python': ['function_definition'],
    'javascript': ['function_declaration', 'method_definition'],
    'typescript': ['function_declaration', 'method_definition'],
    'java': ['method_declaration', 'constructor_declaration'],
    'kotlin': ['function_declaration'],
    'rust': ['function_item'],
    'ruby': ['method', 'singleton_method'],
    'c_sharp': ['method_declaration', 'constructor_declaration'],
    'cpp': ['function_definition', 'function_declaration'],
    'c': ['function_definition', 'function_declaration'],
}

CLASS_NODES = {
    'go': ['type_declaration'],
    'python': ['class_definition'],
    'javascript': ['class_declaration'],
    'typescript': ['class_declaration', 'interface_declaration', 'type_alias_declaration'],
    'java': ['class_declaration', 'interface_declaration', 'enum_declaration'],
    'kotlin': ['class_declaration', 'object_declaration'],
    'rust': ['struct_item', 'enum_item', 'trait_item', 'impl_item'],
    'ruby': ['class', 'module'],
    'c_sharp': ['class_declaration', 'interface_declaration', 'struct_declaration'],
    'cpp': ['class_specifier', 'struct_specifier'],
    'c': ['struct_specifier'],
}

CALL_NODES = {
    'go': ['call_expression'],
    'python': ['call'],
    'javascript': ['call_expression', 'new_expression'],
    'typescript': ['call_expression', 'new_expression'],
    'java': ['method_invocation', 'object_creation_expression'],
    'kotlin': ['call_expression'],
    'rust': ['call_expression'],
    'ruby': ['call', 'command', 'command_call'],
    'c_sharp': ['invocation_expression', 'object_creation_expression'],
    'cpp': ['call_expression'],
    'c': ['call_expression'],
}

# Import node types
IMPORT_NODES = {
    'go': ['import_declaration'],
    'python': ['import_statement', 'import_from_statement'],
    'javascript': ['import_statement'],
    'typescript': ['import_statement'],
    'java': ['import_declaration'],
    'kotlin': ['import_header'],
    'rust': ['use_declaration'],
    'ruby': ['call'],
    'c_sharp': ['using_directive'],
    'cpp': ['preproc_include', 'using_declaration'],
    'c': ['preproc_include'],
}

_parser_cache: dict[str, object] = {}


def _get_parser(lang: str):
    """Get a cached tree-sitter parser for the given language."""
    if lang not in _parser_cache:
        try:
            from tree_sitter_languages import get_parser
            _parser_cache[lang] = get_parser(lang)
        except Exception as e:
            print(f'[code_graph] no parser for {lang}: {e}')
            return None
    return _parser_cache[lang]


def _node_text(node, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode('utf-8', errors='replace')


def _get_name(node, source: bytes) -> str:
    """Extract the name identifier from a definition node."""
    # Most languages have a 'name' or 'identifier' field
    for field in ('name', 'identifier', 'declarator'):
        try:
            child = node.child_by_field_name(field)
            if child:
                return _node_text(child, source).strip()
        except Exception:
            pass
    # Fallback: first identifier child
    for child in node.children:
        if child.type == 'identifier' or child.type == 'type_identifier':
            return _node_text(child, source).strip()
    return ''


def _walk_tree(node, source: bytes, lang: str, file_path: str, prefix: str,
               nodes: list, edges: list, func_names: dict):
    """Recursively walk the AST and extract definitions + calls."""
    fn_types = FUNCTION_NODES.get(lang, [])
    cls_types = CLASS_NODES.get(lang, [])
    call_types = CALL_NODES.get(lang, [])

    if node.type in fn_types:
        name = _get_name(node, source)
        if name:
            node_id = f'{prefix}::{name}'
            nodes.append({
                'id': node_id,
                'type': 'function',
                'name': name,
                'file': file_path,
                'line': node.start_point[0] + 1,
                'endLine': node.end_point[0] + 1,
            })
            # Register in func_names for call resolution
            if name not in func_names:
                func_names[name] = node_id

            # Scan body for call expressions
            _extract_calls(node, source, lang, call_types, node_id, file_path, func_names, edges)

            # Still recurse for nested functions
            for child in node.children:
                _walk_tree(child, source, lang, file_path, prefix, nodes, edges, func_names)
        return

    if node.type in cls_types:
        name = _get_name(node, source)
        if name:
            node_id = f'{prefix}::{name}'
            nodes.append({
                'id': node_id,
                'type': 'class',
                'name': name,
                'file': file_path,
                'line': node.start_point[0] + 1,
                'endLine': node.end_point[0] + 1,
            })
            # Walk children for methods
            for child in node.children:
                _walk_tree(child, source, lang, file_path, prefix, nodes, edges, func_names)
        return

    # Recurse
    for child in node.children:
        _walk_tree(child, source, lang, file_path, prefix, nodes, edges, func_names)


def _extract_calls(func_node, source: bytes, lang: str, call_types: list,
                   caller_id: str, file_path: str, func_names: dict, edges: list):
    """Scan a function body for call expressions and create call edges."""
    seen_targets = set()

    def _scan(n):
        if n.type in call_types:
            # Try to get the function name being called
            callee = _get_callee_name(n, source, lang)
            if callee and callee in func_names:
                target_id = func_names[callee]
                edge_key = f'{caller_id}->{target_id}'
                if edge_key not in seen_targets:
                    seen_targets.add(edge_key)
                    edges.append({
                        'source': caller_id,
                        'target': target_id,
                        'type': 'calls',
                        'file': file_path,
                        'line': n.start_point[0] + 1,
                    })
        for child in n.children:
            _scan(child)

    # Don't scan into nested function definitions (they have their own call extraction)
    for child in func_node.children:
        child_fn_types = FUNCTION_NODES.get(lang, [])
        if child.type not in child_fn_types:
            _scan(child)


def _get_callee_name(node, source: bytes, lang: str) -> str:
    """Extract the function name from a call expression."""
    # Try 'function' field first (JS/TS, Java)
    for field in ('function', 'callee', 'method', 'name'):
        try:
            child = node.child_by_field_name(field)
            if child:
                text = _node_text(child, source).strip()
                # For member expressions like obj.method, take the last part
                if '.' in text:
                    text = text.rsplit('.', 1)[-1]
                # For Go selector expressions like pkg.Func
                if '::' in text:
                    text = text.rsplit('::', 1)[-1]
                return text
        except Exception:
            pass
    # Fallback: first identifier child
    for child in node.children:
        if child.type in ('identifier', 'type_identifier', 'property_identifier'):
            return _node_text(child, source).strip()
    return ''


def _extract_imports(root_node, source: bytes, lang: str, file_path: str) -> list[str]:
    """Extract imported module/package names from import declarations."""
    import_types = IMPORT_NODES.get(lang, [])
    imports = []

    def _scan(n):
        if n.type in import_types:
            text = _node_text(n, source)
            # Extract path strings
            for child in n.children:
                if child.type in ('string', 'string_literal', 'raw_string_literal'):
                    imp = _node_text(child, source).strip().strip('"').strip("'").strip('`')
                    if imp:
                        imports.append(imp)
        for child in n.children:
            _scan(child)

    _scan(root_node)
    return imports


def extract_service_graph(service_name: str, service_path: str, rel_base: str = '') -> dict:
    """Extract the code graph for a single service.

    Returns { service, nodes: [...], edges: [...] }
    """
    files = read_files(service_path)
    all_nodes = []
    all_edges = []
    all_func_names: dict[str, str] = {}  # name -> node_id
    file_nodes = []
    file_imports: dict[str, list[str]] = {}

    for f in files:
        ext = f['ext']
        lang = LANG_MAP.get(ext)
        if not lang:
            continue

        parser = _get_parser(lang)
        if not parser:
            continue

        rel_path = f['rel_path']
        file_id = f'{service_name}/{rel_path}'
        source = f['content'].encode('utf-8')

        # File node
        file_nodes.append({
            'id': file_id,
            'type': 'file',
            'name': Path(rel_path).name,
            'path': rel_path,
            'language': lang,
        })

        # contains edges will be added after we know all children
        try:
            tree = parser.parse(source)
            _walk_tree(
                tree.root_node, source, lang,
                file_id, file_id,
                all_nodes, all_edges, all_func_names,
            )
            imports = _extract_imports(tree.root_node, source, lang, rel_path)
            file_imports[file_id] = imports
        except Exception as e:
            print(f'[code_graph] parse error in {rel_path}: {e}')
            continue

    # Add file → function/class contains edges
    for node in all_nodes:
        if node['type'] in ('function', 'class'):
            all_edges.append({
                'source': node['file'],
                'target': node['id'],
                'type': 'contains',
            })

    # Add import edges (file → file, heuristic: match by filename)
    file_by_basename = {}
    for fn in file_nodes:
        file_by_basename.setdefault(fn['name'], []).append(fn['id'])

    for file_id, imports in file_imports.items():
        for imp in imports:
            # Try to match import to a file by basename
            base = Path(imp).name
            if base in file_by_basename:
                for target_id in file_by_basename[base]:
                    if target_id != file_id:
                        all_edges.append({
                            'source': file_id,
                            'target': target_id,
                            'type': 'imports',
                        })

    return {
        'service': service_name,
        'nodes': file_nodes + all_nodes,
        'edges': all_edges,
    }


def extract_repo_graph(services: list[dict]) -> dict:
    """Extract code graphs for all services in a repo.

    Returns { services: { name: { nodes, edges } }, total_nodes, total_edges }
    """
    result = {}
    total_nodes = 0
    total_edges = 0

    for svc in services:
        graph = extract_service_graph(svc['name'], svc['path'])
        result[svc['name']] = graph
        total_nodes += len(graph['nodes'])
        total_edges += len(graph['edges'])
        print(f'[code_graph] {svc["name"]}: {len(graph["nodes"])} nodes, {len(graph["edges"])} edges')

    return {
        'services': result,
        'total_nodes': total_nodes,
        'total_edges': total_edges,
    }
