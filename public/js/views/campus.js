// Экран кампуса: сцена, подсказки, отметки маршрута и быстрые переходы по зонам.
import { post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, plural } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { ROOMS, RULES } from '../shared/catalog.js';
import { Campus, NPC, HOTS } from '../campus/scene.js';

