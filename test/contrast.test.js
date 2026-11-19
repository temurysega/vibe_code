// Регрессия контраста текста: пары берутся из public/css/tokens.css, порог WCAG 2.1 AA — 4,5:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cssDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'css');
const tokens = Object.fromEntries(
  [...readFileSync(join(cssDir, 'tokens.css'), 'utf8').matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2].toUpperCase()]),
);

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const t = (v) => (v.startsWith('--') ? tokens[v] : v);

// [цвет текста, фон]
const PAIRS = [
  ['--text', '--bg'], ['--ink', '--bg'], ['--ink', '--surface'],
  ['--muted', '--bg'], ['--muted', '--surface'], ['--muted-2', '--surface'],
  ['--faint-text', '--bg'], ['--faint-text', '--surface'], ['--faint-text', '#F8F9FB'],
  ['--navy', '--bg'], ['#FFFFFF', '--navy'], ['--gold-2', '--navy'], ['--navy-ink', '--gold'],
  ['--gold-ink', '--gold-3'], ['--violet-ink', '--violet-2'], ['--blue-ink', '--blue-2'],
  ['--good', '--good-2'], ['--warn', '--warn-2'], ['--red-ink', '--red-2'], ['--red-ink', '--bg'],
  ['#FFFFFF', '--red-ink'], ['#FFFFFF', '--ink'],
];

for (const [fg, bg] of PAIRS) {
  test(`контраст ${fg} на ${bg} не ниже 4,5:1`, () => {
    assert.ok(t(fg) && t(bg), 'токен не найден в tokens.css');
    const r = ratio(t(fg), t(bg));
    assert.ok(r >= 4.5, `${fg} ${t(fg)} на ${bg} ${t(bg)}: ${r.toFixed(2)}:1`);
  });
}

test('светлый декоративный --faint не используется как цвет текста в CSS', () => {
  const offenders = [];
  for (const f of readdirSync(cssDir).filter((n) => n.endsWith('.css'))) {
    readFileSync(join(cssDir, f), 'utf8').split('\n').forEach((line, i) => {
      if (/(^|[\s{;])color:\s*var\(--faint\)/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'для текста нужен --faint-text');
});

test('--faint-text читаем на сером фоне поля', () => {
  assert.ok(ratio(tokens['--faint-text'], tokens['--surface']) >= 4.5);
});
