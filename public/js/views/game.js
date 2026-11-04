// Перерыв: забег «Бегом на пару». Пять минут в день — лимит хранит сервер, а не браузер.
import { post, get } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, fmt } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { ITEMS, RULES } from '../shared/catalog.js';
import { Runner } from '../game/runner.js';

