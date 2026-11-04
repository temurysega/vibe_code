// Игровой слой: образ, питомец, прогулка по кампусу, Лавка и забег.
import { fail } from '../http/router.js';
import { str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { insertRequest, typeOf } from '../domain/requests.js';
import * as play from '../domain/play.js';
import { playCtx } from './student.js';

