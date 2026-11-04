// Пароли: scrypt со случайной солью. В базе — только строка вида scrypt$N$r$p$соль$хеш.
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

