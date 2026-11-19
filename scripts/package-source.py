"""Package the current source and jury documents, excluding secrets and runtime data."""
from pathlib import Path
import hashlib
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode('utf-8').split('\0')
target = root / 'artifacts' / 'mgimo-mania-source.zip'
target.parent.mkdir(exist_ok=True)
allowed_dirs = {'server', 'public', 'docs', 'test', 'scripts', 'deploy', '.claude'}
allowed_root = {'AGENTS.md', 'CLAUDE.md', 'QWEN.md', 'README.md', 'THIRD_PARTY.md', 'LICENSE', 'Dockerfile', 'compose.yaml', 'render.yaml', 'package.json', 'package-lock.json', 'requirements-qa.txt', '.gitignore', '.dockerignore', '.env.example'}
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(set(paths)):
        path = Path(name)
        if not name or not (root / path).is_file():
            continue
        if path.parts[0] not in allowed_dirs and name not in allowed_root:
            continue
        if any(p in {'__pycache__', 'node_modules', '.git'} for p in path.parts):
            continue
        if path.name == '.env' or path.suffix in {'.db', '.log', '.pyc'}:
            raise ValueError('Runtime file must not enter the source archive')
        archive.write(root / path, 'mgimo-mania/' + name)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
digest = hashlib.sha256(target.read_bytes()).hexdigest()
target.with_suffix('.zip.sha256').write_text(digest + '  ' + target.name + '\n', encoding='utf-8')
print(f'{target.name}: {target.stat().st_size:,} bytes; SHA256 {digest}')
