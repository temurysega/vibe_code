"""Контраст текста по WCAG 2.1: читает цвета из public/css/tokens.css.

python scripts/check-contrast.py          # печатает таблицу и пишет docs/evidence/contrast/
Код выхода 1, если у текстовой пары контраст ниже 4,5:1 (кроме пар, помеченных как крупный текст).
"""
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / 'public' / 'css' / 'tokens.css'
OUT = ROOT / 'docs' / 'evidence' / 'contrast'

# (имя пары, цвет текста, фон, где используется, крупный текст?)
PAIRS = [
    ('text/bg', '--text', '--bg', 'основной текст на белом', False),
    ('ink/bg', '--ink', '--bg', 'заголовки, кнопки', False),
    ('ink/surface', '--ink', '--surface', 'текст на серой карточке', False),
    ('text/surface', '--text', '--surface', 'текст на серой карточке', False),
    ('muted/bg', '--muted', '--bg', 'вторичный текст на белом', False),
    ('muted/surface', '--muted', '--surface', 'вторичный текст на серой карточке', False),
    ('muted-2/surface', '--muted-2', '--surface', 'badge-gray', False),
    ('faint-text/bg', '--faint-text', '--bg', 'зачёркнутая аудитория, «нет баллов»', False),
    ('faint-text/surface', '--faint-text', '--surface', 'подсказка в поле ввода', False),
    ('faint-text/past', '--faint-text', '#F8F9FB', 'зачёркнутая аудитория в прошедшей паре', False),
    ('faint (старый текст)/bg', '--faint', '--bg', 'бывший цвет текста; только декор', False),
    ('faint (старый текст)/surface', '--faint', '--surface', 'бывший цвет подсказки; только декор', False),
    ('navy/bg', '--navy', '--bg', 'ссылки, кнопки-контуры', False),
    ('white/navy', '#FFFFFF', '--navy', 'кнопка primary, карточка navy', False),
    ('gold-2/navy', '--gold-2', '--navy', 'подписи на тёмно-синем', False),
    ('navy-ink/gold', '--navy-ink', '--gold', 'монета, кнопка-золото, hl', False),
    ('ink/gold', '--ink', '--gold', 'btn-gold', False),
    ('navy-ink/navy-3', '--navy-ink', '--navy-3', 'badge-soft, нав. активный', False),
    ('gold-ink/gold-3', '--gold-ink', '--gold-3', 'badge-gold, роль', False),
    ('violet-ink/violet-2', '--violet-ink', '--violet-2', 'badge-violet', False),
    ('blue-ink/blue-2', '--blue-ink', '--blue-2', 'badge-blue, замена', False),
    ('good/good-2', '--good', '--good-2', 'badge-good, оценка A', False),
    ('warn/warn-2', '--warn', '--warn-2', 'badge-warn, внимание', False),
    ('red-ink/red-2', '--red-ink', '--red-2', 'badge-red, ошибка', False),
    ('red-ink/bg', '--red-ink', '--bg', 'текст ошибки поля', False),
    ('white/red (старый фон)', '#FFFFFF', '--red', 'прежний фон счётчика; теперь только для точек без текста', False),
    ('white/red-ink', '#FFFFFF', '--red-ink', 'счётчик уведомлений, таймер лимита, шаг «отклонено»', False),
    ('white/ink', '#FFFFFF', '--ink', 'toast, tooltip, badge-dark', False),
    ('#6A4300/warn-2', '#6A4300', '--warn-2', 'note-warn', False),
]


def tokens():
    css = TOKENS.read_text(encoding='utf-8')
    return {k: v.upper() for k, v in re.findall(r'(--[\w-]+):\s*(#[0-9A-Fa-f]{6})\b', css)}


def lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    hi, lo = sorted([lum(a), lum(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main():
    t = tokens()
    res = lambda v: t[v] if v.startswith('--') else v.upper()
    rows = []
    for name, fg, bg, use, large in PAIRS:
        r = ratio(res(fg), res(bg))
        decor = 'старый' in name
        rows.append({'pair': name, 'fg': res(fg), 'bg': res(bg), 'use': use, 'ratio': round(r, 2),
                     'aa_normal': r >= 4.5, 'aa_large': r >= 3.0, 'large_only': large, 'decor_only': decor})
    lines = ['| Пара (текст/фон) | Цвета | Где | Контраст | AA обычный (4,5) | AA крупный (3,0) |', '|---|---|---|---|---|---|']
    for x in rows:
        mark = lambda v: 'да' if v else 'НЕТ'
        lines.append(f"| {x['pair']} | {x['fg']} на {x['bg']} | {x['use']} | {x['ratio']:.2f}:1 | {mark(x['aa_normal'])} | {mark(x['aa_large'])} |")
    table = '\n'.join(lines)
    print(table)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'contrast.md').write_text('# Контраст текста (WCAG 2.1)\n\nСгенерировано `scripts/check-contrast.py` из `public/css/tokens.css`.\n'
        'Строки «старый …» показывают прежние значения (`--faint`, фон `--red` под белым текстом): они оставлены только для декора (точки, рамки), в текст не идут.\n\n' + table + '\n', encoding='utf-8')
    (OUT / 'contrast.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    bad = [x for x in rows if not x['decor_only'] and not (x['aa_large'] if x['large_only'] else x['aa_normal'])]
    for x in bad:
        print('FAIL', x['pair'], x['ratio'])
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
