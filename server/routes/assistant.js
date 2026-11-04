// Помощник «Спросить деканат» и служебные маршруты демо-стенда.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { RateLimiter } from '../security/rateLimit.js';
import { snapshot, ruleAnswer, aiAnswer } from '../domain/assistant.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../seed/seed.js';
import { config } from '../config.js';

