// Сессии на сервере: случайный токен в httpOnly-cookie, в базе — только его SHA-256.
// К каждой сессии привязан CSRF-токен для изменяющих запросов.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const HOUR = 36e5;
const MAX_SESSIONS = 10;

