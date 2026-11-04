// Сборка приложения: заголовки безопасности, CSRF, разбор тела, маршруты API и раздача фронтенда.
import { Router, HttpError, sendJson, fail } from './http/router.js';
import { readJson } from './http/body.js';
import { serveStatic } from './http/static.js';
import { securityHeaders } from './security/headers.js';
import { safeEqual } from './security/session.js';
import { loadUser } from './security/auth.js';
import { config } from './config.js';
import auth from './routes/auth.js';
import student from './routes/student.js';
import requests from './routes/requests.js';
import play from './routes/play.js';
import dean from './routes/dean.js';
import assistant from './routes/assistant.js';

