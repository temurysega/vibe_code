// Точка входа: открывает базу, наполняет демо-данными и запускает HTTP-сервер.
import { createServer } from 'node:http';
import { config } from './config.js';
import { Store } from './db.js';
import { createApp } from './app.js';
import { seed } from './seed/seed.js';
import { applyPlans } from './domain/requests.js';
import { perAccount, perIp } from './routes/auth.js';

