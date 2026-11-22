"""Опрос после финальных правок: пятеро новых участников рядом с исходными 25.

Вход — responses.csv в папке замера: та же таблица формы, строки 1–25 — исходный опрос,
строки 26 и дальше — новые участники после финальных правок.
Выход рядом — final.json: размеры групп, самооценка лёгкости, самое трудное задание,
точный перестановочный тест разницы средних (насколько она объяснима случайностью).
Запуск: python scripts/survey-final.py docs/evidence/survey-final-2026-11-22
"""
from collections import Counter
import csv
from itertools import combinations
import json
from pathlib import Path
import statistics
import sys

FOLDER = Path(sys.argv[1])
EASE = 'Насколько легко было выполнить задания с телефона?'
HARD = 'Какое задание было самым трудным?'
GAME = 'Кампус, питомец и мини-игра помогают возвращаться в кабинет или отвлекают?'
USE = 'Стали бы вы пользоваться таким кабинетом вместо нынешних способов?'
BASE = 25
rows = list(csv.DictReader((FOLDER / 'responses.csv').open(encoding='utf-8')))
orig, new = rows[:BASE], rows[BASE:]
ease = [int(r[EASE]) for r in rows]


def group(part):
    values = [int(r[EASE]) for r in part]
    return {
        'n': len(part),
        'ease_mean': round(statistics.mean(values), 2),
        'ease_counts': {str(k): values.count(k) for k in range(5, 0, -1)},
        'hardest': dict(Counter(r[HARD] for r in part).most_common()),
        'game': dict(Counter(r[GAME] for r in part).most_common()),
        'would_use': dict(Counter(r[USE] for r in part).most_common()),
    }


# Точный перестановочный тест: все способы выбрать len(new) ответов из всех
observed = statistics.mean(ease[BASE:]) - statistics.mean(ease[:BASE])
total, k = sum(ease), len(new)
hits = count = 0
for combo in combinations(range(len(ease)), k):
    s = sum(ease[i] for i in combo)
    count += 1
    if s / k - (total - s) / (len(ease) - k) >= observed - 1e-9:
        hits += 1
summary = {
    'source': 'Таблица ответов Google Forms: строки 1–25 — исходный опрос, 26–30 — новые участники после финальных правок; передана автором 22 ноября 2026',
    'original': group(orig),
    'after_final_fixes': {**group(new), 'rows': list(range(BASE + 1, len(rows) + 1))},
    'all': {'n': len(rows), 'ease_mean': round(statistics.mean(ease), 2)},
    'difference_of_means': round(observed, 2),
    'permutation_test': {'one_sided_p': round(hits / count, 3), 'as_large_or_larger': hits, 'splits': count},
}
(FOLDER / 'final.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
