// Пароли: scrypt со случайной солью. В базе — только строка вида scrypt$N$r$p$соль$хеш.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(String(password).normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

// Сравнение за постоянное время: по времени ответа нельзя угадать совпавшие байты
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Хеш-пустышка: если логина нет, всё равно считаем scrypt — время ответа не выдаёт, существует ли пользователь
let dummy = null;
export async function dummyVerify(password) {
  if (!dummy) dummy = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
  return false;
}

// Требования к новому паролю
export function passwordProblems(password, login) {
  const pw = String(password || '');
  const out = [];
  if (pw.length < 10) out.push('не короче 10 символов');
  if (pw.length > 128) out.push('не длиннее 128 символов');
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw) || !/\d/.test(pw)) out.push('буквы и цифры');
  if (login && pw.toLowerCase().includes(String(login).toLowerCase().split('@')[0])) out.push('без логина внутри');
  return out;
}
