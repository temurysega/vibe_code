// Главная: ближайшая пара, день, «как у меня дела», дедлайны, заявки, изменения и новости —
// а ниже образ, питомец, кампус и перерыв из игрового слоя.
import { get, post } from '../lib/api.js';
import { session, setPlay, on } from '../lib/bus.js';
import { esc, fmt, plural, toMin, mskNow, dayLabel, relDay, dateNum, monthShort, dueLabel, inMinutes, when, num, dateOfTs } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, backdrop } from '../art/avatar.js';
import { ROOMS, RULES } from '../shared/catalog.js';
import { skeleton, errorBox, lessonState, changeLine, statusPill, pipe } from './common.js';
import { openOnboarding, openQuiz } from './onboarding.js';

