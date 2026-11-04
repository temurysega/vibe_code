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

