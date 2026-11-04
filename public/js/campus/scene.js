// Кампус МГИМО Мании: учебный корпус в разрезе — три этажа, шесть зон и лифт.
// Аватар ходит по клику или стрелкам, сотрудники стоят в зонах, каждая зона ведёт в раздел кабинета.
import { svg as avatarSvg, pet as petSvg } from '../art/avatar.js';
import { ROOMS } from '../shared/catalog.js';
import { esc } from '../lib/format.js';

const W = 1200, H = 820;
const SURF = [740, 540, 340];          // поверхность пола этажей 0, 1, 2
const ROOM_H = 190;
const LX = [80, 556], RX = [644, 1120];
const EX = 600;                          // центр лифта
const AV_H = 120, AV_W = 75;
const SPEED = 270;
const NAVY = '#0F2D69', GOLD = '#C9A646', INK = '#0B2150';

