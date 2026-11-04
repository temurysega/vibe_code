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

// Деканат: окно приёма, электронная очередь, табличка
function dean() {
  const t = top(0), b = SURF[0];
  let s = room(0, 'r', '#FFFFFF', '#E6E9EF');
  s += `<rect x="700" y="${t + 20}" width="150" height="40" rx="10" fill="${NAVY}"/><text x="775" y="${t + 46}" text-anchor="middle" font-family="Onest, Arial" font-size="17" font-weight="700" fill="#fff">Деканат</text>`;
  s += hot('window',
    `<rect x="700" y="${t + 72}" width="120" height="64" rx="8" fill="#DCE6F8" stroke="#C9D3E6" stroke-width="2"/><path d="M760 ${t + 72} V${t + 136}" stroke="#fff" stroke-width="4"/>` +
    `<rect x="690" y="${b - 60}" width="140" height="44" rx="8" fill="#fff" stroke="#DEDFE1" stroke-width="2"/><rect x="684" y="${b - 68}" width="152" height="12" rx="6" fill="${INK}"/>` +
    `<rect x="704" y="${b - 92}" width="34" height="24" rx="3" fill="#fff" stroke="#C9D3E6"/><path d="M710 ${b - 84} h22 M710 ${b - 78} h16" stroke="#9AA5B8" stroke-width="2"/>` +
    `<rect x="752" y="${b - 88}" width="28" height="20" rx="3" fill="${GOLD}"/>`,
    [684, t + 66, 152, ROOM_H - 72]);
  s += hot('queue',
    `<rect x="880" y="${b - 120}" width="52" height="104" rx="10" fill="${INK}"/><rect x="888" y="${b - 110}" width="36" height="26" rx="4" fill="#5B8DEF"/><text x="906" y="${b - 92}" text-anchor="middle" font-family="Onest, Arial" font-size="11" font-weight="700" fill="#fff">А-12</text>` +
    `<rect x="892" y="${b - 74}" width="28" height="6" rx="3" fill="${GOLD}"/><rect x="896" y="${b - 60}" width="20" height="16" rx="2" fill="#fff"/>`,
    [876, b - 124, 60, 110]);
  s += `<rect x="960" y="${t + 30}" width="90" height="70" rx="8" fill="#F8F1DC" stroke="#E9D7A0" stroke-width="2"/><path d="M972 ${t + 48} h66 M972 ${t + 62} h50 M972 ${t + 76} h58" stroke="#B08E33" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
  return s;
}

// Аудитория: доска с расписанием и парты
function classroom() {
  const t = top(1), b = SURF[1];
  let s = room(1, 'l', '#F4F7FD', '#DDE5F2');
  s += hot('board',
    `<rect x="110" y="${t + 22}" width="240" height="108" rx="8" fill="#1F4A3B" stroke="#8A5A3B" stroke-width="6"/>` +
    `<text x="124" y="${t + 48}" font-family="Onest, Arial" font-size="14" font-weight="600" fill="#E9F5EE">Сегодня</text>` +
    [0, 1, 2].map((i) => `<rect x="124" y="${t + 60 + i * 20}" width="${150 - i * 30}" height="8" rx="4" fill="#E9F5EE" opacity=".6"/><rect x="${290 - i * 6}" y="${t + 60 + i * 20}" width="40" height="8" rx="4" fill="${GOLD}" opacity=".9"/>`).join(''),
    [106, t + 18, 248, 116]);
  s += hot('journal',
    `<rect x="356" y="${b - 66}" width="60" height="12" rx="6" fill="${INK}"/><path d="M362 ${b - 54} V${b - 16} M410 ${b - 54} V${b - 16}" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="362" y="${b - 82}" width="48" height="16" rx="3" fill="${NAVY}"/><path d="M370 ${b - 74} h32" stroke="${GOLD}" stroke-width="3"/>`,
    [352, b - 86, 68, 72]);
  [[150, 0], [250, 1]].forEach(([x]) => {
    s += `<rect x="${x}" y="${b - 52}" width="80" height="10" rx="5" fill="#C9D3E6"/><path d="M${x + 8} ${b - 42} V${b - 16} M${x + 72} ${b - 42} V${b - 16}" stroke="#9AA5B8" stroke-width="5"/>`;
  });
  return s;
}

// Библиотека: полки и лампа читального зала
function library() {
  const t = top(1), b = SURF[1];
  let s = room(1, 'r', '#F8F1DC', '#EADFC1');
  let shelf = `<rect x="680" y="${t + 20}" width="128" height="${ROOM_H - 36}" rx="6" fill="#8A5A3B"/>`;
  const colors = [NAVY, GOLD, '#E0735A', '#3BAE8A', '#8E6CC4', '#5B8DEF'];
  [t + 30, t + 76, t + 122].forEach((y, r) => {
    shelf += `<path d="M684 ${y + 40} H804" stroke="#6B4429" stroke-width="4"/>`;
    for (let i = 0; i < 8; i++) {
      const h = 26 + ((i * 7 + r * 5) % 12);
      shelf += `<rect x="${688 + i * 14}" y="${y + 40 - h}" width="11" height="${h}" rx="2" fill="${colors[(i + r) % colors.length]}"/>`;
    }
  });
  s += hot('shelves', shelf, [680, t + 20, 128, ROOM_H - 36]);
  s += hot('lamp',
    `<path d="M900 ${t} V${t + 46}" stroke="${INK}" stroke-width="2"/><path d="M880 ${t + 46} h40 l-8 18 h-24 Z" fill="${GOLD}"/><circle cx="900" cy="${t + 74}" r="26" fill="${GOLD}" opacity=".18"/>` +
    `<rect x="846" y="${b - 62}" width="108" height="12" rx="6" fill="#6B4429"/><path d="M856 ${b - 50} V${b - 16} M944 ${b - 50} V${b - 16}" stroke="#6B4429" stroke-width="6"/>` +
    `<rect x="872" y="${b - 76}" width="40" height="14" rx="2" fill="#fff" stroke="#C9D3E6"/><path d="M892 ${b - 76} v14" stroke="#C9D3E6"/>`,
    [842, t + 4, 116, ROOM_H - 20]);
  s += plant(1100, b - 14, 0.7);
  return s;
}

// Студклубы: трибуна и флажки клубов (условные цвета, не флаги стран)
function clubs() {
  const t = top(2), b = SURF[2];
  let s = room(2, 'l', '#EEF0FF', '#D9DDF5');
  ['#1E3A7B', '#C9A646', '#3BAE8A', '#E0735A', '#8E6CC4', '#5B8DEF', '#7A8699'].forEach((c, i) => {
    const x = 100 + i * 30;
    s += `<path d="M${x} ${t + 24} V${t + 84}" stroke="#6B7280" stroke-width="2"/><path d="M${x} ${t + 26} h22 l-5 9 5 9 h-22 Z" fill="${c}"/>`;
  });
  s += `<text x="100" y="${t + 112}" font-family="Onest, Arial" font-size="13" font-weight="600" fill="${INK}">Модель ООН · дебаты · волонтёры · спорт</text>`;
  s += hot('podium',
    `<rect x="350" y="${b - 92}" width="66" height="76" rx="6" fill="${NAVY}"/><rect x="344" y="${b - 100}" width="78" height="12" rx="6" fill="${INK}"/>` +
    `<circle cx="383" cy="${b - 58}" r="16" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M367 ${b - 58} h32 M383 ${b - 74} c8 8 8 24 0 32 c-8 -8 -8 -24 0 -32" fill="none" stroke="${GOLD}" stroke-width="2"/>` +
    `<path d="M383 ${b - 100} V${b - 118}" stroke="${INK}" stroke-width="3"/><circle cx="383" cy="${b - 120}" r="4" fill="${INK}"/>`,
    [340, b - 126, 86, 112]);
  s += `<rect x="452" y="${b - 46}" width="80" height="10" rx="5" fill="#C9D3E6"/><path d="M460 ${b - 36} V${b - 16} M524 ${b - 36} V${b - 16}" stroke="#9AA5B8" stroke-width="4"/>`;
  return s;
}

// Лавка МГИМО: прилавок и стойка с мерчем
function shop() {
  const t = top(2), b = SURF[2];
  let s = room(2, 'r', '#FFF7F0', '#F0E2D4');
  let rack = `<path d="M676 ${t + 52} H806 M680 ${t + 52} V${b - 16} M802 ${t + 52} V${b - 16}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  [[NAVY, 696], [GOLD, 728], [NAVY, 760], ['#fff', 788]].forEach(([c, x]) => {
    rack += `<path d="M${x} ${t + 52} v6" stroke="#6B7280" stroke-width="2"/><path d="M${x - 14} ${t + 66} L${x - 6} ${t + 58} H${x + 6} L${x + 14} ${t + 66} L${x + 10} ${t + 72} L${x + 8} ${t + 70} V${t + 112} H${x - 8} V${t + 70} L${x - 10} ${t + 72} Z" fill="${c}" stroke="#C9D3E6"/>`;
  });
  s += rack;
  s += hot('counter',
    `<rect x="${830}" y="${t + 26}" width="120" height="34" rx="17" fill="${NAVY}"/><text x="890" y="${t + 48}" text-anchor="middle" font-family="Onest, Arial" font-size="14" font-weight="700" fill="#E9D7A0">Лавка</text>` +
    `<rect x="826" y="${b - 66}" width="150" height="50" rx="10" fill="#fff" stroke="#DEDFE1" stroke-width="2"/><rect x="820" y="${b - 74}" width="162" height="12" rx="6" fill="${INK}"/>` +
    `<rect x="842" y="${b - 98}" width="30" height="24" rx="4" fill="${NAVY}"/><circle cx="857" cy="${b - 86}" r="5" fill="${GOLD}"/><rect x="886" y="${b - 94}" width="24" height="20" rx="4" fill="${GOLD}"/><rect x="920" y="${b - 104}" width="26" height="30" rx="4" fill="#5B8DEF"/>`,
    [816, t + 22, 170, ROOM_H - 36]);
  return s;
}

const LABEL_POS = { cloakroom: 380, dean: 866, classroom: 380, library: 960, clubs: 452, shop: 990 };
function labels(visited) {
  let s = '';
  ROOMS.forEach((r) => {
    const [f] = ZONE_POS[r.id];
    const on = visited.includes(r.id);
    const w = 24 + r.name.length * 7.6;
    const lx = LABEL_POS[r.id];
    const ly = top(f) + 12;
    s += `<g class="room-label"><rect x="${lx}" y="${ly}" width="${w + (on ? 22 : 0)}" height="26" rx="13" fill="#fff" opacity=".95"/>` +
      `<text x="${lx + 12}" y="${ly + 17.5}" font-family="Onest, Arial, sans-serif" font-size="13" font-weight="600" fill="${INK}">${esc(r.name)}</text>` +
      (on ? `<g transform="translate(${lx + w + 8} ${ly + 13})"><circle r="9" fill="${NAVY}"/><path d="M-4 0 l2.6 2.6 L4.2 -3" stroke="#E9D7A0" stroke-width="2" fill="none" stroke-linecap="round"/></g>` : '') +
      `</g>`;
  });
  return s;
}

function avatarNested(av, w, h, cls) {
  const inner = avatarSvg(av, { view: 'full' }).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  return `<svg class="${cls || ''}" width="${w}" height="${h}" viewBox="0 0 200 320" overflow="visible">${inner}</svg>`;
}

function npcs() {
  let s = '';
  Object.entries(NPC).forEach(([zone, n], i) => {
    const f = floorOf(zone);
    const y = SURF[f] - AV_H - 2;
    const tw = 16 + n.name.length * 7.6;
    s += `<g class="npc idle" data-npc="${zone}" transform="translate(${n.x - AV_W / 2} ${y})" style="--d:${i * 0.4}s">` +
      `<rect x="-6" y="0" width="${AV_W + 12}" height="${AV_H}" fill="transparent"/>` + avatarNested(n.av, AV_W, AV_H) +
      `<g class="tag"><rect x="${AV_W / 2 - tw / 2}" y="-26" width="${tw}" height="22" rx="11" fill="${INK}"/><text x="${AV_W / 2}" y="-11" text-anchor="middle" font-family="Onest, Arial, sans-serif" font-size="12" font-weight="500" fill="#fff">${esc(n.name)}</text></g></g>`;
  });
  return s;
}

// ---------- сцена ----------
export class Campus {
  constructor(stage, state, opts) {
    this.stage = stage;
    this.state = state;
    this.opts = opts || {};
    const last = Campus.pos || { floor: 0, x: 520 };
    this.p = { floor: last.floor, x: last.x, y: SURF[last.floor], dir: 1, ride: null };
    this.pet = { x: last.x - 50, dir: 1 };
    this.path = [];
    this.keys = {};
    this.zone = zoneAt(this.p.floor, this.p.x);
    this.render();
    this.bind();
    this.last = 0;
    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  render() {
    const av = this.state.av;
    const petMarkup = av.pet && av.pet !== 'none' ? petSvg(av.pet, av.petColor, { shadow: true }).replace('<svg ', '<svg width="50" height="42" ') : '';
    this.stage.innerHTML = `<svg class="campus-svg" viewBox="0 0 ${W} ${H}" role="application" aria-label="Кампус МГИМО Мании">
      ${sky()}${shell()}
      ${cloakroom()}${dean()}${classroom()}${library()}${clubs()}${shop()}
      <g id="cp-cabin" transform="translate(0 ${SURF[this.p.floor] - SURF[0]})">
        <rect x="566" y="${SURF[0] - 180}" width="68" height="176" rx="8" fill="#EEF3FC"/><rect x="566" y="${SURF[0] - 180}" width="68" height="8" rx="4" fill="${GOLD}"/>
        <path d="M572 ${SURF[0] - 90} H628" stroke="#C9D3E6" stroke-width="3" stroke-linecap="round"/><rect x="566" y="${SURF[0] - 16}" width="68" height="12" fill="#D9E2F2"/>
      </g>
      <g>${[0, 1, 2].map((f) => `<g transform="translate(${EX} ${top(f) - 2})"><rect x="-15" y="-11" width="30" height="16" rx="8" fill="${INK}"/><text y="1.5" text-anchor="middle" font-family="Onest, Arial, sans-serif" font-size="11" font-weight="600" fill="#E9D7A0">${f + 1}</text></g>`).join('')}</g>
      <g id="cp-target" style="display:none"><ellipse class="tgt-ring" cx="0" cy="0" rx="24" ry="7" fill="none" stroke="${GOLD}" stroke-width="4"/><ellipse cx="0" cy="0" rx="12" ry="3.5" fill="${INK}" opacity=".25"/>
        <path class="tgt-pin" d="M0 -6 C0 -6 -15 -17 -15 -27 C-15 -34 -9 -41 0 -41 C9 -41 15 -34 15 -27 C15 -17 0 -6 0 -6 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/><circle cx="0" cy="-27" r="5" fill="${INK}"/></g>
      <g id="cp-labels">${labels(this.state.visited)}</g>
      <g id="cp-npcs">${npcs()}</g>
      <g id="cp-pet">${petMarkup}</g>
      <g id="cp-player"><g class="pl-body">${avatarNested(av, AV_W, AV_H)}</g>
        <g class="me-tag"><rect x="${AV_W / 2 - 17}" y="-30" width="34" height="22" rx="11" fill="${GOLD}" stroke="${INK}" stroke-width="2"/><text x="${AV_W / 2}" y="-14.5" text-anchor="middle" font-family="Onest, Arial, sans-serif" font-size="12" font-weight="700" fill="${INK}">Вы</text></g>
      </g>
    </svg>`;
    this.svg = this.stage.querySelector('svg');
    this.elPlayer = this.svg.querySelector('#cp-player');
    this.elBody = this.svg.querySelector('#cp-player .pl-body');
    this.elPet = this.svg.querySelector('#cp-pet');
    this.elCabin = this.svg.querySelector('#cp-cabin');
    this.elTarget = this.svg.querySelector('#cp-target');
    this.place();
  }

