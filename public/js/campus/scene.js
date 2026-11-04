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

const ZONE_POS = { cloakroom: [0, 'l'], dean: [0, 'r'], classroom: [1, 'l'], library: [1, 'r'], clubs: [2, 'l'], shop: [2, 'r'] };

// Сотрудники и завсегдатаи кампуса — вымышленные персонажи
export const NPC = {
  cloakroom: { id: 'nina', name: 'Нина Петровна', role: 'гардероб', x: 452, av: { body: 'f', skin: 's2', hair: 'bun', hairColor: 'gray', eyes: 'happy', mouth: 'smile', cheeks: 'blush', top: 'sweater', topColor: 'navy', bottom: 'skirt', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'black', glasses: 'round' },
    say: 'Номерок не теряйте! А ещё у нас можно переодеть аватар — зеркало справа' },
  dean: { id: 'irina', name: 'Ирина Викторовна', role: 'деканат', x: 1052, av: { body: 'f', skin: 's1', hair: 'bob', hairColor: 'dark', eyes: 'lashes', mouth: 'calm', top: 'blazer', topColor: 'navy', bottom: 'trousers', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'black', glasses: 'square', extra: 'lanyard' },
    say: 'Справку об обучении закажите онлайн — электронная будет готова в течение дня. А за бумажной заходите сюда' },
  classroom: { id: 'sokolov', name: 'Пётр Андреевич', role: 'преподаватель', x: 486, av: { body: 'm', skin: 's2', hair: 'short', hairColor: 'gray', eyes: 'round', mouth: 'calm', facial: 'beard', top: 'blazer', topColor: 'graphite', bottom: 'trousers', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'brown', glasses: 'square', extra: 'tie', extraColor: 'navy' },
    say: 'Все переносы и замены — в расписании кабинета. Консультация перед контрольной тоже там' },
  library: { id: 'vera', name: 'Вера', role: 'библиотека', x: 1030, av: { body: 'f', skin: 's3', hair: 'long', hairColor: 'black', eyes: 'round', mouth: 'smile', top: 'turtleneck', topColor: 'cream', bottom: 'skirt', bottomColor: 'navy', shoes: 'boots', shoesColor: 'brown', glasses: 'round' },
    say: 'Тихий час: 25 минут учёбы без телефона. Питомец посидит рядом и подрастёт' },
  clubs: { id: 'timofey', name: 'Тимофей', role: 'клуб «Модель ООН»', x: 490, av: { body: 'm', skin: 's4', hair: 'curly', hairColor: 'black', eyes: 'happy', mouth: 'grin', top: 'mun-bomber', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoesColor: 'navy' },
    say: 'Регистрация делегатов Модели ООН открыта! Объявления клубов приходят в уведомления' },
  shop: { id: 'artyom', name: 'Артём', role: 'Лавка МГИМО', x: 1062, av: { body: 'm', skin: 's2', hair: 'side', hairColor: 'brown', eyes: 'round', mouth: 'smile', top: 'mgimo-hoodie', bottom: 'joggers', bottomColor: 'graphite', shoes: 'sneakers', shoesColor: 'gray', hat: 'mgimo-cap' },
    say: 'Худи и футболки — за М-коины, с цифровой копией для аватара. Заберёте здесь, на кассе' },
};

export const HOTS = [
  { id: 'mirror', zone: 'cloakroom', x: 330, label: 'Зеркало гардероба', act: 'wardrobe' },
  { id: 'hooks', zone: 'cloakroom', x: 170, label: 'Вешалки и номерки', act: 'tickets' },
  { id: 'window', zone: 'dean', x: 760, label: 'Окно приёма заявлений', act: 'request' },
  { id: 'queue', zone: 'dean', x: 905, label: 'Электронная очередь', act: 'requests' },
  { id: 'board', zone: 'classroom', x: 230, label: 'Доска с расписанием', act: 'schedule' },
  { id: 'journal', zone: 'classroom', x: 380, label: 'Журнал с баллами', act: 'grades' },
  { id: 'shelves', zone: 'library', x: 740, label: 'Книжные полки', act: 'focus' },
  { id: 'lamp', zone: 'library', x: 900, label: 'Читальный стол', act: 'focus' },
  { id: 'podium', zone: 'clubs', x: 380, label: 'Трибуна Модели ООН', act: 'clubs' },
  { id: 'counter', zone: 'shop', x: 820, label: 'Прилавок Лавки', act: 'shop' },
];

const floorOf = (zone) => ZONE_POS[zone][0];
const top = (f) => SURF[f] - ROOM_H;
const zoneAt = (f, x) => {
  if (x < LX[1]) return ROOMS.find((r) => r.floor === f && r.side === 'l').id;
  if (x > RX[0]) return ROOMS.find((r) => r.floor === f && r.side === 'r').id;
  return null;
};

