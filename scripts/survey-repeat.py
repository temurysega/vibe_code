"""Повторный замер опроса: те же задания и те же два вопроса у части участников.

Вход — responses.csv в папке замера: копия таблицы ответов с двумя столбцами «(повторный замер)».
Пустые повторные ответы — участники, которые задания не повторяли.
Выход рядом — repeat.json: размер обеих групп, самооценка лёгкости до и после у тех же людей,
самое трудное задание до и после.
Запуск: python scripts/survey-repeat.py docs/evidence/survey-repeat-2026-11-22
"""
from collections import Counter
import csv
import json
from pathlib import Path
import statistics
import sys

FOLDER = Path(sys.argv[1])
EASE = 'Насколько легко было выполнить задания с телефона?'
HARD = 'Какое задание было самым трудным?'
AGAIN = ' (повторный замер)'
rows = list(csv.DictReader((FOLDER / 'responses.csv').open(encoding='utf-8')))
repeat = [r for r in rows if r[EASE + AGAIN].strip()]
rest = [r for r in rows if not r[EASE + AGAIN].strip()]
assert all(r[HARD + AGAIN].strip() for r in repeat), 'у повторного замера должны быть оба ответа'


def mean(values):
    return round(statistics.mean(values), 2)


before = [int(r[EASE]) for r in repeat]
after = [int(r[EASE + AGAIN]) for r in repeat]
summary = {
    'source': 'Таблица ответов Google Forms с двумя столбцами повторного замера; передана автором 22 ноября 2026',
    'original': {
        'n': len(rows),
        'ease_mean': mean([int(r[EASE]) for r in rows]),
        'ease_median': statistics.median([int(r[EASE]) for r in rows]),
        'hardest': dict(Counter(r[HARD] for r in rows).most_common()),
    },
    'repeat': {
        'n': len(repeat),
        'rows': [int(r['№']) for r in repeat],
        'ease_before_mean': mean(before),
        'ease_after_mean': mean(after),
        'ease_change_mean': mean([b - a for a, b in zip(before, after)]),
        'improved': sum(b > a for a, b in zip(before, after)),
        'hardest_before': dict(Counter(r[HARD] for r in repeat).most_common()),
        'hardest_after': dict(Counter(r[HARD + AGAIN] for r in repeat).most_common()),
        'people': [{'row': int(r['№']), 'ease': [int(r[EASE]), int(r[EASE + AGAIN])], 'hardest': [r[HARD], r[HARD + AGAIN]]} for r in repeat],
    },
    'did_not_repeat': {'n': len(rest), 'ease_mean': mean([int(r[EASE]) for r in rest])},
    'original_low_scores_in_repeat': [sum(int(r[EASE]) <= 3 for r in repeat), sum(int(r[EASE]) <= 3 for r in rows)],
}
(FOLDER / 'repeat.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
