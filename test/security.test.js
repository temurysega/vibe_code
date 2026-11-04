// Требования конкурса по безопасности — автоматической проверкой.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

