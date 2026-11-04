// Конструктор аватара: один SVG-рендер в координатах 200×320.
// Портрет, карточки вещей, кампус и кадры забега — это тот же персонаж с другим viewBox или позой.

const SKIN = {
  s1: ['#FDE4D3', '#EFC6AC'], s2: ['#F5C9A6', '#E0AC85'], s3: ['#E0A77C', '#C78C60'],
  s4: ['#C2885C', '#A66E45'], s5: ['#97603C', '#7C4B2C'], s6: ['#68412A', '#52321F'],
};
const HAIR = {
  black: '#25201E', dark: '#4B3022', brown: '#7B4A2A', light: '#B98250', blonde: '#E8C47F', ginger: '#C4562C',
  gray: '#C3C7CD', navy: '#2B4C9A', violet: '#8E6CC4', pink: '#EF8DB5',
};
export const CLOTH = {
  white: '#FFFFFF', cream: '#F3ECDF', graphite: '#2E2E30', gray: '#A2A7AE', black: '#1D1D1F', navy: '#1E3A7B', royal: '#2F5BC4',
  gold: '#C9A646', violet: '#8E6CC4', lilac: '#CDB4E6', sky: '#80B4F5', mint: '#86DDB6', coral: '#FF8C6E',
  sand: '#D8C3A1', denim: '#4E73A8', lightdenim: '#8FB0DA', beige: '#CFBBA1', olive: '#7D8C50', pink: '#F6A9C6',
  red: '#E5484D', yellow: '#FFD84D', brown: '#7A5236', orange: '#F2A65A',
};
const PETC = { orange: '#F2A65A', gray: '#9EA4AB', black: '#34343A', cream: '#F1DFC2', sand: '#D9AE74', brown: '#8A5A3B', white: '#F2F2F0' };
const INK = '#2B1D1A';
const MOUTH = '#3B2320';
const GOLD = '#C9A646';

// ---------- цвет ----------
function hex(c) {
  c = String(c).replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  return [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16));
}
function toHex(a) { return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
export const dk = (c, t) => mix(c, '#000000', t == null ? 0.16 : t);
export const lt = (c, t) => mix(c, '#FFFFFF', t == null ? 0.3 : t);
export function lum(c) { const [r, g, b] = hex(c).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const col = (k, fb) => CLOTH[k] || (k && k[0] === '#' ? k : null) || fb || CLOTH.graphite;

export const DEFAULT = {
  body: 'f', skin: 's2', hair: 'short', hairColor: 'dark', eyes: 'round', mouth: 'smile', cheeks: 'none', facial: 'none',
  top: 'tee', topColor: 'white', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoesColor: 'gray',
  hat: 'none', hatColor: 'graphite', glasses: 'none', extra: 'none', extraColor: 'navy', pet: 'none', petColor: '',
};

const VIEWS = {
  full: '0 0 200 320', bust: '28 24 144 144', head: '34 16 132 132', torso: '34 114 132 132',
  legs: '40 212 120 96', feet: '48 258 104 52',
};

// Позы для растровых кадров игры. В DOM шаг анимируется CSS-классом .walking
const POSES = {
  stand: {},
  run1: { legL: 'translate(0 -11)', legR: 'translate(0 2)', armL: 'rotate(24 57 152)', armR: 'rotate(-4 143 152)', body: 'translate(0 -3)' },
  run2: { legL: 'translate(0 2)', legR: 'translate(0 -11)', armL: 'rotate(4 57 152)', armR: 'rotate(-24 143 152)', body: 'translate(0 0)' },
  jump: { legL: 'rotate(16 82 240) translate(0 -6)', legR: 'rotate(-16 118 240) translate(0 -6)', armL: 'rotate(62 57 152)', armR: 'rotate(-62 143 152)' },
  slide: { legL: 'rotate(-58 82 240) translate(-8 -10)', legR: 'rotate(-48 118 240) translate(-4 -14)', armL: 'rotate(-40 57 152)', armR: 'rotate(40 143 152)', body: 'translate(0 46) rotate(-8 100 240)' },
};

// Фигура: у мужской шире плечи и шея, у женской плечи и талия уже, бёдра шире
const BODY = {
  m: { sh: 42, waist: 39, hip: 39, neck: 24, arm: 4 },
  f: { sh: 34, waist: 31, hip: 38, neck: 19, arm: -2 },
};
const bodyOf = (c) => BODY[c.body] || BODY.f;
function torsoPath(b) {
  const L = 100 - b.sh, R = 100 + b.sh, WL = 100 - b.waist, WR = 100 + b.waist, HL = 100 - b.hip, HR = 100 + b.hip;
  return `M${L} 152 C${L} 145 ${L + 9} 141 86 140 L114 140 C${R - 9} 141 ${R} 145 ${R} 152 C${R} 170 ${WR} 182 ${WR} 196 C${WR} 210 ${HR} 218 ${HR} 228 Q${HR} 236 ${HR - 8} 236 L${HL + 8} 236 Q${HL} 236 ${HL} 228 C${HL} 218 ${WL} 210 ${WL} 196 C${WL} 182 ${L} 170 ${L} 152 Z`;
}

// Быстрая смена фигуры: заодно меняет явно «женские» или «мужские» детали
export function applyBody(av, body) {
  const out = Object.assign({}, av, { body });
  if (body === 'm') {
    if (['bob', 'long', 'bun', 'ponytail'].includes(out.hair)) out.hair = 'short';
    if (out.cheeks === 'blush') out.cheeks = 'none';
    if (out.eyes === 'lashes') out.eyes = 'round';
    if (out.bottom === 'skirt') { out.bottom = 'trousers'; out.bottomColor = 'graphite'; }
  } else {
    if (['short', 'buzz', 'side'].includes(out.hair)) out.hair = 'bob';
    out.facial = 'none';
    if (out.cheeks === 'none') out.cheeks = 'blush';
  }
  return out;
}
const LONG = ['hoodie', 'mgimo-hoodie', 'sweater', 'ling-knit', 'turtleneck', 'shirt', 'blazer', 'mun-bomber', 'focus-jacket', 'gown'];

// Принт МГИМО Мании на мерче: знак-меридианы и надпись
function print(fg, cx, cy, s) {
  return `<g transform="translate(${cx} ${cy}) scale(${s || 1})"><path d="M-21 4 C-22 0 -21.6 -3.6 -20 -6.4 L-16 -1 L-12 -6.4 C-10.4 -3.6 -10 0 -11 4" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><text x="-7" y="4" font-family="Onest, Arial, sans-serif" font-weight="700" font-size="11.5" letter-spacing="-0.3" fill="${fg}">мгимо</text></g>`;
}

// ---------- волосы ----------
function hairBack(style, h) {
  switch (style) {
    case 'bob': return `<path d="M50 92 C48 52 74 36 100 36 C126 36 152 52 150 92 L151 132 Q151 140 143 140 L57 140 Q49 140 49 132 Z" fill="${dk(h, 0.1)}"/>`;
    case 'long': return `<path d="M48 92 C46 50 74 34 100 34 C126 34 154 50 152 92 L156 182 Q156 196 142 196 L58 196 Q44 196 44 182 Z" fill="${dk(h, 0.12)}"/>`;
    case 'afro': {
      let s = `<circle cx="100" cy="80" r="54" fill="${h}"/>`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        s += `<circle cx="${(100 + Math.cos(a) * 50).toFixed(1)}" cy="${(80 + Math.sin(a) * 50).toFixed(1)}" r="13" fill="${h}"/>`;
      }
      return s;
    }
    case 'ponytail': return `<path d="M124 54 C162 60 168 118 152 160 C148 170 138 168 140 158 C152 120 148 84 120 68 Z" fill="${dk(h, 0.08)}"/>`;
    default: return '';
  }
}

function hairFront(style, h) {
  const shine = `<path d="M80 50 Q98 42 118 47" stroke="#fff" stroke-opacity=".22" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  switch (style) {
    case 'short':
      return `<path d="M58 102 C50 62 70 38 100 38 C130 38 150 62 142 102 C140 88 136 80 130 74 C116 80 98 80 84 70 C78 75 70 79 64 86 C61 91 59 96 58 102 Z" fill="${h}"/>${shine}`;
    case 'side':
      return `<path d="M57 104 C48 60 74 34 104 36 C136 38 152 64 143 104 C141 90 137 82 132 76 C120 86 102 86 90 80 C80 76 72 68 68 60 C62 72 58 86 57 104 Z" fill="${h}"/>${shine}`;
    case 'buzz':
      return `<path d="M59 96 C57 60 76 44 100 44 C124 44 143 60 141 96 C137 74 121 62 100 62 C79 62 63 74 59 96 Z" fill="${h}" opacity=".92"/>`;
    case 'bob':
      return `<path d="M54 104 C50 58 74 38 100 38 C126 38 150 58 146 104 L147 132 Q147 138 141 138 L137 138 C139 118 140 104 138 92 C136 84 132 78 128 74 L72 74 C68 78 64 84 62 92 C60 104 61 118 63 138 L59 138 Q53 138 53 132 Z" fill="${h}"/>${shine}`;
    case 'long':
      return `<path d="M54 106 C50 58 74 36 100 38 C126 36 150 58 146 106 L149 170 Q149 178 141 178 L138 178 C141 142 141 114 137 98 C133 84 120 70 101 63 L100 62 L99 63 C80 70 67 84 63 98 C59 114 59 142 62 178 L59 178 Q51 178 51 170 Z" fill="${h}"/>${shine}`;
    case 'curly': {
      let s = `<path d="M58 98 C56 62 76 44 100 44 C124 44 144 62 142 98 C136 80 120 70 100 70 C80 70 64 80 58 98 Z" fill="${h}"/>`;
      [[62, 84, 13], [70, 64, 15], [86, 50, 16], [104, 46, 16], [120, 52, 15], [134, 66, 14], [140, 86, 12], [58, 100, 9], [142, 100, 9], [74, 72, 10], [90, 68, 10], [106, 68, 10], [122, 72, 10]]
        .forEach(([x, y, r]) => { s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${h}"/>`; });
      s += `<path d="M80 52 q4 -3 8 0 M100 46 q4 -3 8 0 M118 56 q4 -3 8 0 M68 68 q4 -3 8 0 M128 74 q4 -3 8 0" stroke="${dk(h, 0.25)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      return s;
    }
    case 'afro':
      return `<path d="M60 94 C58 62 78 48 100 48 C122 48 142 62 140 94 C134 78 120 70 100 70 C80 70 66 78 60 94 Z" fill="${dk(h, 0.08)}"/>`;
    case 'bun':
      return `<circle cx="100" cy="32" r="17" fill="${h}"/><path d="M58 98 C54 60 76 42 100 42 C124 42 146 60 142 98 C138 80 122 66 100 66 C78 66 62 80 58 98 Z" fill="${h}"/><rect x="89" y="44" width="22" height="6" rx="3" fill="${dk(h, 0.28)}"/>${shine}`;
    case 'ponytail':
      return `<path d="M58 98 C54 60 76 42 100 42 C124 42 146 60 142 98 C138 80 122 66 100 66 C78 66 62 80 58 98 Z" fill="${h}"/><rect x="124" y="58" width="10" height="14" rx="4" fill="${dk(h, 0.28)}" transform="rotate(-30 129 65)"/>${shine}`;
    default:
      return '';
  }
}

