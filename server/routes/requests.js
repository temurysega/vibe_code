// Заявки студента. Каждый запрос к конкретной заявке проверяет владельца:
// чужая заявка по прямой ссылке отвечает «не найдено» — даже факт её существования не раскрывается.
import { fail } from '../http/router.js';
import { int, str } from '../http/body.js';
import { requireStudent } from '../security/auth.js';
import { catalogFor, createRequest, setStatus, applyPlans, publicRequest, typeOf } from '../domain/requests.js';
import { semesterOf, msk } from '../domain/time.js';
import * as play from '../domain/play.js';

