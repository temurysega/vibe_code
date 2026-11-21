// Журналы проверок лежат в публичном репозитории: в путях не должно быть имени
// учётной записи (E-35). Заглушки вида <пользователь> и <project> допустимы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEXT = new Set(['.txt', '.json', '.md', '.html']);
// C:\Users\имя, C:\\Users\\имя (JSON), C:/Users/имя, а также /Users/имя/ и /home/имя/
const HOME_PATH = /(?:[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)|(?:^|[\s"'(`])\/(?:Users|home)\/)(?!<)[^\\/"'`\s<>]+/m;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

test('журналы docs/evidence не раскрывают имя пользователя в путях', () => {
  const leaks = [];
  for (const file of walk(join(ROOT, 'docs', 'evidence'))) {
    if (!TEXT.has(extname(file))) continue;
    const match = readFileSync(file, 'utf8').match(HOME_PATH);
    if (match) leaks.push(`${relative(ROOT, file)}: ${match[0].trim()}`);
  }
  assert.deepEqual(leaks, [], `пути с именем пользователя в ${leaks.length} файлах`);
});
