// Гардероб: примерочная с зеркалом. Внешность бесплатна, вещи открываются за учёбу, прогулку и забег.
import { patch, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc, fmt } from '../lib/format.js';
import { icon, coin } from '../ui/icons.js';
import { modal, toast, confirm } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, backdrop, itemPreview, applyBody, CLOTH, BACKDROPS, SKIN, HAIR } from '../art/avatar.js';
import { APPEARANCE, ITEMS, SLOTS, PROFILE_SLOTS, EMOJIS, itemState, keyOf } from '../shared/catalog.js';

