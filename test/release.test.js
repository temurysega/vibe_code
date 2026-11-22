// Одна версия выпуска (рецензия 22 ноября, п. 8): package.json, lock-файл и модуль release.js
// (его показывают страница входа, подвал кабинета и /api/health) и документы для жюри называют один номер.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASE } from '../public/js/shared/release.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DOCS = ['README.md', 'docs/JURY_GUIDE.md', 'docs/SUBMISSION.md', 'docs/PROCESS.md', 'docs/CONTEST_AUDIT.md', 'docs/DEPLOYMENT.md'];

test('package.json, lock-файл и release.js — один номер версии', () => {
  assert.match(RELEASE.version, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read('package.json')).version, RELEASE.version);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, RELEASE.version);
  assert.equal(lock.packages[''].version, RELEASE.version);
});

test('README, маршрут жюри, пакет капитана, описание процесса, аудит и развёртывание называют ту же версию', () => {
  for (const file of DOCS) {
    const found = [...read(file).matchAll(/[Вв]ерси(?:я|и|ю|ей)\s+`?(\d+\.\d+\.\d+)`?/g)].map((m) => m[1]);
    assert.ok(found.length, `${file}: версия выпуска не названа`);
    assert.deepEqual([...new Set(found)], [RELEASE.version], `${file}: названа другая версия`);
  }
});
