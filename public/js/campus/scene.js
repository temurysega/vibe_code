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

function room(f, side, wall, floor) {
  const x0 = side === 'l' ? LX[0] : RX[0], x1 = side === 'l' ? LX[1] : RX[1];
  const t = top(f), b = SURF[f];
  return `<rect x="${x0}" y="${t}" width="${x1 - x0}" height="${ROOM_H}" fill="${wall}"/>` +
    `<rect x="${x0}" y="${b - 16}" width="${x1 - x0}" height="16" fill="${floor}"/>` +
    `<rect x="${x0}" y="${t}" width="${x1 - x0}" height="6" fill="#000" opacity=".06"/>`;
}

const glow = (x, y, w, h) => `<rect class="hot-glow" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="14" fill="${GOLD}" fill-opacity=".16" stroke="${GOLD}" stroke-width="3"/>`;
const hot = (id, inner, box) => `<g class="hot" data-hot="${id}">${glow.apply(null, box)}${inner}</g>`;

function plant(x, b, k) {
  k = k || 1;
  return `<path d="M${x - 14 * k} ${b - 34 * k} h${28 * k} l-3 ${32 * k} h-${22 * k} Z" fill="${INK}"/>` +
    `<ellipse cx="${x - 9 * k}" cy="${b - 52 * k}" rx="${9 * k}" ry="${20 * k}" transform="rotate(-24 ${x - 9 * k} ${b - 52 * k})" fill="#3E8E6A"/>` +
    `<ellipse cx="${x + 9 * k}" cy="${b - 54 * k}" rx="${9 * k}" ry="${21 * k}" transform="rotate(22 ${x + 9 * k} ${b - 54 * k})" fill="#5FB386"/>` +
    `<ellipse cx="${x}" cy="${b - 62 * k}" rx="${8 * k}" ry="${22 * k}" fill="#4BA176"/>`;
}

// Гардероб: вешалки с номерками и зеркало
function cloakroom() {
  const t = top(0), b = SURF[0];
  let s = room(0, 'l', '#EEF3FC', '#D9E2F2');
  let hooks = `<rect x="104" y="${t + 34}" width="140" height="8" rx="4" fill="${INK}"/>`;
  [['#1E3A7B', 116], ['#C9A646', 140], ['#8E6CC4', 164], ['#E0735A', 188], ['#3BAE8A', 212], ['#7A8699', 232]].forEach(([c, x]) => {
    hooks += `<path d="M${x} ${t + 42} v6" stroke="#6B7280" stroke-width="2"/><path d="M${x - 11} ${t + 56} L${x - 4} ${t + 48} H${x + 4} L${x + 11} ${t + 56} L${x + 9} ${t + 118} H${x - 9} Z" fill="${c}"/>`;
  });
  hooks += `<rect x="104" y="${b - 66}" width="140" height="50" rx="8" fill="#fff" stroke="#C9D3E6" stroke-width="2"/>`;
  [0, 1, 2, 3, 4].forEach((i) => { hooks += `<circle cx="${122 + i * 26}" cy="${b - 41}" r="8" fill="${GOLD}"/><text x="${122 + i * 26}" y="${b - 37.5}" text-anchor="middle" font-family="Onest, Arial" font-size="8" font-weight="700" fill="${INK}">${114 + i}</text>`; });
  s += hot('hooks', hooks, [100, t + 30, 148, ROOM_H - 44]);
  s += hot('mirror',
    `<path d="M300 ${b - 18} V${t + 66} Q300 ${t + 36} 331 ${t + 36} Q362 ${t + 36} 362 ${t + 66} V${b - 18} Z" fill="url(#cp-mirror)" stroke="${GOLD}" stroke-width="6"/>` +
    `<path d="M312 ${t + 70} L324 ${t + 56} M312 ${t + 86} L336 ${t + 60}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>`,
    [297, t + 33, 68, ROOM_H - 48]);
  s += `<rect x="388" y="${b - 60}" width="120" height="44" rx="8" fill="${INK}"/><rect x="380" y="${b - 68}" width="136" height="12" rx="6" fill="#16346F"/>`;
  s += plant(530, b - 14, 0.8);
  return s;
}

