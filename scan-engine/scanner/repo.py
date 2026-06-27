import subprocess
import tempfile
import re
from pathlib import Path

SKIP_DIRS = {
    '.git', 'node_modules', '__pycache__', '.venv', 'venv', 'env',
    'dist', 'build', '.next', 'out', 'vendor', 'target', '.gradle',
    '.mvn', 'coverage', '.nyc_output', 'migrations',
}

# File extensions worth embedding for architecture signals
CODE_EXTS = {
    '.go', '.py', '.js', '.ts', '.tsx', '.jsx',
    '.java', '.kt', '.rs', '.rb', '.cs', '.cpp', '.c',
    '.yml', '.yaml', '.toml', '.mod', '.env', '.env.example',
}

# Markers that indicate a folder is a service root
SERVICE_MARKERS = [
    'Dockerfile', 'go.mod', 'package.json',
    'pyproject.toml', 'setup.py', 'pom.xml', 'build.gradle',
]


def repo_id_from_url(url: str) -> str:
    """Derive a consistent repo ID from a GitHub URL.
    e.g. https://github.com/org/my-repo -> my-repo
    """
    # Strip trailing .git and slashes
    cleaned = url.rstrip('/').removesuffix('.git')
    # Take the last path segment
    parts = cleaned.split('/')
    return re.sub(r'[^a-zA-Z0-9_-]', '-', parts[-1]) if parts else 'repo'


def clone_repo(repo_url: str, pat: str | None = None) -> str:
    """Clone repo shallow into a temp dir. Returns the temp dir path."""
    if pat and 'github.com' in repo_url:
        repo_url = repo_url.replace('https://', f'https://x-access-token:{pat}@')

    dest = tempfile.mkdtemp(prefix='scan-')
    subprocess.run(
        ['git', 'clone', '--depth=1', '--quiet', repo_url, dest],
        check=True, capture_output=True, timeout=120,
    )
    return dest


def discover_services(root: str) -> list[dict]:
    """
    Find service folders by looking for Dockerfile / go.mod / package.json etc.
    Searches root itself and up to two levels of subdirectories.
    """
    root_path = Path(root)
    seen: set[str] = set()
    services = []

    def check(folder: Path):
        key = str(folder)
        if key in seen:
            return
        for marker in SERVICE_MARKERS:
            if (folder / marker).exists():
                seen.add(key)
                rel = str(folder.relative_to(root_path)) if folder != root_path else '.'
                services.append({
                    'name': folder.name if folder != root_path else root_path.name,
                    'path': key,
                    'rel_path': rel,
                    'marker': marker,
                })
                return  # one match per folder is enough

    # depth 0 (repo root itself)
    check(root_path)

    # depth 1
    for d in root_path.iterdir():
        if d.is_dir() and d.name not in SKIP_DIRS:
            check(d)
            # depth 2
            for dd in d.iterdir():
                if dd.is_dir() and dd.name not in SKIP_DIRS:
                    check(dd)

    return services


def read_files(folder: str) -> list[dict]:
    """Read all code files under a folder. Returns list of {rel_path, content, ext}."""
    folder_path = Path(folder)
    result = []

    for fpath in sorted(folder_path.rglob('*')):
        if not fpath.is_file():
            continue
        if fpath.suffix not in CODE_EXTS:
            continue
        parts = fpath.relative_to(folder_path).parts
        if any(p in SKIP_DIRS for p in parts):
            continue
        try:
            content = fpath.read_text(encoding='utf-8', errors='ignore').strip()
            if len(content) > 40:
                result.append({
                    'rel_path': str(fpath.relative_to(folder_path)),
                    'content': content,
                    'ext': fpath.suffix.lstrip('.'),
                })
        except OSError:
            continue

    return result
