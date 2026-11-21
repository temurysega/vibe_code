"""Шрифт для PDF-справки: Onest 400 с латиницей и кириллицей в одном TTF.

Источник — те же файлы Google Fonts, что раздаёт кабинет (public/fonts/*.woff2, SIL OFL 1.1,
без зарезервированного имени). Вариативный шрифт фиксируется на начертании 400, два подмножества
объединяются. Нужны fontTools и brotli (версии — в requirements-qa.txt).
Запуск: python scripts/build-pdf-font.py
Сборка воспроизводима: даты в заголовке шрифта берутся из исходника (объединение ставит текущее время),
поэтому повторный запуск даёт тот же файл байт в байт.
"""
from pathlib import Path
import tempfile

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'server' / 'assets' / 'onest-pdf.ttf'

with tempfile.TemporaryDirectory() as tmp:
    parts = []
    source_head = None
    for name in ['onest-latin.woff2', 'onest-cyrillic.woff2']:
        font = TTFont(ROOT / 'public' / 'fonts' / name, recalcTimestamp=False)
        font.flavor = None
        source_head = source_head or (font['head'].created, font['head'].modified)
        if 'fvar' in font:
            font = instancer.instantiateVariableFont(font, {'wght': 400})
            font.recalcTimestamp = False
        out = Path(tmp) / name.replace('.woff2', '.ttf')
        font.save(out)
        parts.append(str(out))
    merged = Merger().merge(parts)
    merged.recalcTimestamp = False
    merged['head'].created, merged['head'].modified = source_head
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    merged.save(TARGET)
print(f'{TARGET.relative_to(ROOT)}: {TARGET.stat().st_size} bytes')
