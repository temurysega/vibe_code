// Знакомство первокурсника: образ и питомец за минуту, а также квиз «Как устроен кабинет».
import { patch, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, applyBody, SKIN } from '../art/avatar.js';
import { APPEARANCE, FIRST_STEPS } from '../shared/catalog.js';

