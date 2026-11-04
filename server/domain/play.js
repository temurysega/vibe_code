// Игровой слой на сервере: аватар, питомец, М-коины, маршрут по кампусу и забег.
// Клиент только просит — начисления и проверки делает сервер, подделать баланс из браузера нельзя.
import { randomBytes } from 'node:crypto';
import { APPEARANCE, ITEMS, ROOMS, KITS, TITLES, EMOJIS, FIRST_STEPS, RULES, itemOf, itemState, keyOf } from '../../public/js/shared/catalog.js';
import { fail } from '../http/router.js';
import { str, int } from '../http/body.js';
import { msk } from './time.js';

