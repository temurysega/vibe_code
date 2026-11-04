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

// ---------- художественные слои ----------
function sky() {
  let s = `<defs><linearGradient id="cp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D3E2FA"/><stop offset="1" stop-color="#F4F8FF"/></linearGradient>
    <linearGradient id="cp-mirror" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE6F8"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#cp-sky)"/>`;
  [[150, 70, 1], [380, 40, 0.8], [880, 60, 1.1], [1080, 34, 0.7]].forEach(([x, y, k]) => {
    s += `<g fill="#fff" opacity=".9"><ellipse cx="${x}" cy="${y}" rx="${46 * k}" ry="${15 * k}"/><ellipse cx="${x + 26 * k}" cy="${y - 10 * k}" rx="${26 * k}" ry="${15 * k}"/></g>`;
  });
  let x = 0;
  s += '<g fill="#C7D7F0">';
  while (x < W) {
    const w = 40 + ((x * 37) % 50), h = 60 + ((x * 53) % 120);
    s += `<rect x="${x}" y="${760 - h}" width="${w}" height="${h}"/>`;
    x += w + 8;
  }
  s += '</g>';
  s += `<rect y="756" width="${W}" height="64" fill="#E3E8F0"/><rect y="790" width="${W}" height="30" fill="#D3DAE4"/>`;
  for (let i = 0; i < 12; i++) s += `<rect x="${20 + i * 104}" y="803" width="52" height="4" rx="2" fill="#fff"/>`;
  [[30, 1], [1170, 0.9]].forEach(([tx, k]) => {
    s += `<rect x="${tx - 4}" y="${756 - 40 * k}" width="8" height="${40 * k}" fill="#9AA5B8"/><circle cx="${tx}" cy="${756 - 58 * k}" r="${28 * k}" fill="#7FB89A"/><circle cx="${tx + 10 * k}" cy="${756 - 50 * k}" r="${16 * k}" fill="#5FA47E"/>`;
  });
  return s;
}

function shell() {
  let s = `<rect x="60" y="134" width="1080" height="626" fill="${NAVY}"/>`;
  s += `<rect x="44" y="118" width="1112" height="26" rx="10" fill="${INK}"/>`;
  s += `<path d="M560 72 V118 M640 72 V118" stroke="${INK}" stroke-width="5"/><rect x="452" y="60" width="296" height="54" rx="27" fill="${INK}"/>`;
  // Вывеска: собственный знак концепта и надпись
  s += `<g transform="translate(478 70)"><rect width="34" height="34" rx="9" fill="${NAVY}"/><path d="M10.9 25.4 C9.6 20.6 9.8 15.8 11.8 12.4 L17 19.4 L22.2 12.4 C24.2 15.8 24.4 20.6 23.1 25.4" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27.5" cy="7" r="2.6" fill="${GOLD}"/></g>`;
  s += `<text x="524" y="96" font-family="Onest, Arial, sans-serif" font-size="25" fill="#fff"><tspan font-weight="700">мгимо</tspan><tspan font-weight="500" font-style="italic" fill="#E9D7A0"> мания</tspan></text>`;
  s += `<rect x="52" y="752" width="1096" height="12" rx="4" fill="${INK}"/>`;
  s += `<rect x="560" y="150" width="80" height="590" fill="#16346F"/><path d="M572 150 V740 M628 150 V740" stroke="#24468A" stroke-width="3"/>`;
  [0, 1, 2].forEach((f) => { s += `<rect x="562" y="${top(f) + 4}" width="76" height="${ROOM_H - 4}" rx="6" fill="none" stroke="#2E5296" stroke-width="2"/>`; });
  return s;
}

