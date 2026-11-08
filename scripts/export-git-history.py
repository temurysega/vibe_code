"""Export Git metadata for the jury PDF: docs/evidence/history/git-history.json.

Run: python scripts/export-git-history.py
The export is repository metadata, not a transcript of AI sessions.
"""
from collections import Counter
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs' / 'evidence' / 'history' / 'git-history.json'
SEP, END = '\x1f', '\x1e'
raw = subprocess.check_output(
    ['git', 'log', '--reverse', '--date=iso-strict', f'--format=%H{SEP}%ad{SEP}%an{SEP}%s{SEP}%b{END}'],
    cwd=ROOT).decode('utf-8')
commits = []
for record in filter(None, (r.strip('\n') for r in raw.split(END))):
    sha, date, author, subject, body = record.split(SEP)
    coauthors = [line.split(':', 1)[1].strip() for line in body.splitlines() if line.lower().startswith('co-authored-by:')]
    commits.append({'commit': sha, 'date': date, 'author': author, 'subject': subject, 'coauthors': coauthors})

by_day = Counter(c['date'][:10] for c in commits)
replay = [c for c in commits if c['date'].startswith('2026-11-04')]
summary = {
    'commits': len(commits),
    'by_day': dict(sorted(by_day.items())),
    'commits_with_claude_coauthor': sum(any('Claude' in a for a in c['coauthors']) for c in commits),
}
if replay:
    summary['replayed_on_2026_11_04'] = {
        'commits': len(replay), 'first': replay[0]['date'], 'last': replay[-1]['date'],
        'note': 'Готовый код первой сессии Claude Code разложен скриптом на последовательные коммиты; '
                'время коммитов не отражает хронологию работы.',
    }
data = {
    'source': 'git log --reverse --date=iso-strict',
    'snapshot_head': commits[-1]['commit'],
    'interpretation': 'Метаданные репозитория, а не стенограмма работы с ИИ. Коммиты 4 ноября созданы скриптом '
                      'за 2–3 минуты в конце первой сессии и показывают устройство кода; с 8 ноября каждый коммит — '
                      'отдельная итерация. Трейлер Co-Authored-By не удостоверяет текст промптов или версию модели.',
    'summary': summary,
    'commits': commits,
}
TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps(summary, ensure_ascii=False))
