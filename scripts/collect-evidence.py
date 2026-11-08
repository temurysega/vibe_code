"""Collect reproducible journals/screenshots using an isolated temporary database.

Run: python scripts/collect-evidence.py
Never starts the application against the user's data/ directory or a live AI key.
"""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')
OUT = ROOT / 'docs' / 'evidence' / 'final'
OUT.mkdir(parents=True, exist_ok=True)
MSK = timezone(timedelta(hours=3))


def stamp():
    return datetime.now(MSK).isoformat(timespec='seconds')


def run(command, name, env):
    started = stamp()
    result = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, encoding='utf-8', errors='replace', timeout=240)
    output = result.stdout.replace(str(ROOT), '<project>')
    journal = f'Command: {subprocess.list2cmdline(command)}\nStarted (MSK): {started}\nFinished (MSK): {stamp()}\nExit code: {result.returncode}\n\n{output}'
    (OUT / f'{name}.txt').write_text(journal, encoding='utf-8', newline='\n')
    print(f'{name}: exit {result.returncode}', flush=True)
    if result.returncode:
        print(output[-10000:], flush=True)
        raise RuntimeError(f'{name} failed; see docs/evidence/final/{name}.txt')
    return {'command': command, 'started_msk': started, 'finished_msk': stamp(),
            'exit_code': result.returncode, 'journal': f'{name}.txt'}, output


env = os.environ.copy()
env.update({'OPENROUTER_API_KEY': '', 'ANTHROPIC_API_KEY': '', 'COOKIE_SECURE': '0',
            'NODE_ENV': 'test', 'TRUST_PROXY': '0', 'DEMO_RESEED_HOURS': '0',
            'PYTHONIOENCODING': 'utf-8', 'QA_OUTPUT_DIR': str(OUT), 'HOST': '127.0.0.1'})
source = hashlib.sha256()
for directory in ['server', 'public', 'test']:
    for path in sorted((ROOT / directory).rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            source.update(path.relative_to(ROOT).as_posix().encode())
            source.update(path.read_bytes())
summary = {'started_msk': stamp(), 'scope': 'Local source, disposable SQLite, external AI disabled',
           'source_revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
           'tested_source_sha256': source.hexdigest(), 'stages': []}

try:
    unit, output = run(['node', '--test', '--test-reporter=tap', 'test/*.test.js'], 'unit-tests', env)
    unit['tests'] = int(re.search(r'^# tests (\d+)', output, re.M).group(1))
    unit['passed'] = int(re.search(r'^# pass (\d+)', output, re.M).group(1))
    summary['stages'].append(unit)
    with tempfile.TemporaryDirectory(prefix='mgimo-evidence-') as temporary:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env.update({'PORT': str(port), 'DB_FILE': str(Path(temporary) / 'evidence.db')})
        base = f'http://127.0.0.1:{port}'
        summary['base'] = base
        with (Path(temporary) / 'server.txt').open('w', encoding='utf-8') as server_log:
            server = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env,
                                      stdout=server_log, stderr=subprocess.STDOUT)
            try:
                for _ in range(80):
                    if server.poll() is not None:
                        raise RuntimeError('Isolated server stopped before becoming ready')
                    try:
                        with urlopen(base, timeout=1) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(.2)
                else:
                    raise RuntimeError('Isolated server did not become ready')
                for name in ['browser-smoke', 'browser-flows', 'browser-accessibility', 'browser-polish', 'browser-stipend']:
                    script = ROOT / 'test' / f'{name}.py'
                    if not script.exists():
                        continue
                    stage, _ = run([sys.executable, str(script), base], name, env)
                    report_name = 'browser-results' if name == 'browser-smoke' else name
                    report = json.loads((OUT / f'{report_name}.json').read_text(encoding='utf-8'))
                    stage.update({'checks': len(report['checks']),
                                  'passed': sum(bool(c['passed']) for c in report['checks']),
                                  'browser_errors': report.get('browser_errors', [])})
                    summary['stages'].append(stage)
            finally:
                server.terminate()
                server.wait(timeout=10)
    summary['passed'] = True
finally:
    summary['finished_msk'] = stamp()
    (OUT / 'run-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
