// Вход, выход, смена пароля и управление сеансами.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { verifyPassword, dummyVerify, hashPassword, passwordProblems } from '../security/password.js';
import { createSession, destroySession, sessionCookie, clearSessionCookie, deviceName, maskIp } from '../security/session.js';
import { RateLimiter } from '../security/rateLimit.js';
import { requireUser, publicUser, audit } from '../security/auth.js';

