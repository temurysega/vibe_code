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

// Затылок для вида со спины: волосы закрывают голову целиком
function hairNape(style, h) {
  if (style === 'none') return '';
  if (style === 'afro') return '';
  const cap = `<path d="M56 100 C52 56 76 40 100 40 C124 40 148 56 144 100 C144 114 140 126 132 134 Q100 144 68 134 C60 126 56 114 56 100 Z" fill="${style === 'buzz' ? dk(h, 0.05) : h}"${style === 'buzz' ? ' opacity=".9"' : ''}/>`;
  if (style === 'bun') return cap + `<circle cx="100" cy="34" r="17" fill="${dk(h, 0.06)}"/>`;
  if (style === 'ponytail') return cap + `<path d="M92 120 C88 150 96 172 100 186 C104 172 112 150 108 120 Z" fill="${dk(h, 0.1)}"/><rect x="93" y="112" width="14" height="9" rx="4" fill="${dk(h, 0.3)}"/>`;
  if (style === 'curly') return cap + [[70, 64], [100, 48], [130, 64], [62, 96], [138, 96], [84, 118], [116, 118]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${h}"/>`).join('');
  return cap;
}

// ---------- лицо ----------
function eyes(t) {
  const E = (x, kind, side) => {
    switch (kind) {
      case 'happy': return `<path d="M${x - 6} 100 Q${x} 92 ${x + 6} 100" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'sleepy': return `<path d="M${x - 6} 97 Q${x} 102 ${x + 6} 97" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      case 'big': return `<ellipse cx="${x}" cy="98" rx="6" ry="7.2" fill="${INK}"/><circle cx="${x + 2}" cy="95.2" r="2.3" fill="#fff"/><circle cx="${x - 2.2}" cy="100.8" r="1.1" fill="#fff"/>`;
      case 'lashes': {
        const o = side < 0 ? -1 : 1;
        return `<ellipse cx="${x}" cy="98" rx="4.8" ry="5.8" fill="${INK}"/><circle cx="${x + 1.6}" cy="96" r="1.6" fill="#fff"/><path d="M${x + o * 4} 93 l${o * 3.2} -3 M${x + o * 5.4} 96 l${o * 3.8} -1.4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
      }
      default: return `<ellipse cx="${x}" cy="98" rx="4.6" ry="5.6" fill="${INK}"/><circle cx="${x + 1.6}" cy="96" r="1.6" fill="#fff"/>`;
    }
  };
  if (t === 'wink') return E(84, 'round', -1) + E(116, 'happy', 1);
  return E(84, t, -1) + E(116, t, 1);
}

function mouth(t, fem) {
  const line = fem ? '#B5485A' : MOUTH;
  switch (t) {
    case 'grin': return `<path d="M89 112 Q100 128 111 112 Z" fill="${MOUTH}"/><path d="M93.5 120.5 Q100 125 106.5 120.5 Q100 117.6 93.5 120.5 Z" fill="#FF8C9E"/>`;
    case 'open': return `<ellipse cx="100" cy="117" rx="5" ry="6" fill="${MOUTH}"/><ellipse cx="100" cy="120.2" rx="3.2" ry="2.2" fill="#FF8C9E"/>`;
    case 'calm': return `<path d="M93 116 Q100 119.5 107 116" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'smirk': return `<path d="M92 117 Q102 120 109 112" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    default: return `<path d="M90.5 113 Q100 123 109.5 113" stroke="${line}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
}

function cheeks(t, sh) {
  if (t === 'blush') return `<circle cx="73" cy="110" r="6.5" fill="#FF7A93" opacity=".26"/><circle cx="127" cy="110" r="6.5" fill="#FF7A93" opacity=".26"/>`;
  if (t === 'freckles') {
    return [[71, 106], [76, 109], [70, 111], [129, 106], [124, 109], [130, 111]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="${dk(sh, 0.22)}"/>`).join('');
  }
  return '';
}

function facial(t, h) {
  const must = `<path d="M88 113 C92 108 98 109 100 111.5 C102 109 108 108 112 113 C107 115.5 103 114.5 100 113.5 C97 114.5 93 115.5 88 113 Z" fill="${h}"/>`;
  switch (t) {
    case 'stubble': return `<path d="M63 104 C66 134 86 138 100 138 C114 138 134 134 137 104 C132 124 116 131 100 131 C84 131 68 124 63 104 Z" fill="${h}" opacity=".24"/>`;
    case 'mustache': return must;
    case 'beard': return `<path d="M59 96 C59 138 82 147 100 147 C118 147 141 138 141 96 C137 116 127 124 114 122 C108 119 92 119 86 122 C73 124 63 116 59 96 Z" fill="${h}"/>${must}`;
    default: return '';
  }
}

function glasses(t) {
  const f = '#2A2A2A';
  switch (t) {
    case 'round': return `<g fill="#fff" fill-opacity=".2" stroke="${f}" stroke-width="2.6"><circle cx="84" cy="98" r="10.5"/><circle cx="116" cy="98" r="10.5"/></g><path d="M94.5 97 Q100 93.5 105.5 97 M73.5 96 L59 92 M126.5 96 L141 92" stroke="${f}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'square': return `<g fill="#fff" fill-opacity=".2" stroke="${f}" stroke-width="2.6"><rect x="72" y="89" width="24" height="18" rx="5"/><rect x="104" y="89" width="24" height="18" rx="5"/></g><path d="M96 97 Q100 94 104 97 M72 95 L59 92 M128 95 L141 92" stroke="${f}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    case 'sun': return `<g fill="#1E1E1E" fill-opacity=".92" stroke="#1E1E1E" stroke-width="2"><path d="M71 90 h26 v8 q0 10 -13 10 q-13 0 -13 -10 Z"/><path d="M103 90 h26 v8 q0 10 -13 10 q-13 0 -13 -10 Z"/></g><path d="M97 93 Q100 90.5 103 93 M71 93 L59 90 M129 93 L141 90" stroke="#1E1E1E" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M76 94.5 h7 M108 94.5 h7" stroke="#fff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`;
    default: return '';
  }
}

function head(c, skin, sh, h) {
  const male = c.body === 'm';
  const brow = mix(h, '#3B2A22', lum(h) > 0.55 ? 0.55 : male ? 0.4 : 0.3);
  return (
    `<ellipse cx="58" cy="96" rx="7" ry="10" fill="${skin}"/><ellipse cx="142" cy="96" rx="7" ry="10" fill="${skin}"/>` +
    `<path d="M59 91 Q55 96 59 101 M141 91 Q145 96 141 101" stroke="${sh}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    (male
      ? `<path d="M57 88 C57 61 76 45 100 45 C124 45 143 61 143 88 C143 113 135 131 114 135.5 Q100 138.5 86 135.5 C65 131 57 113 57 88 Z" fill="${skin}"/>`
      : `<ellipse cx="100" cy="90" rx="42" ry="45" fill="${skin}"/>`) +
    facial(c.facial, h) +
    cheeks(c.cheeks, sh) +
    (male
      ? `<path d="M75.5 86.5 Q83.5 82 92 85 M108 85 Q116.5 82 124.5 86.5" stroke="${brow}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`
      : `<path d="M77.5 85 Q84 79.5 90.5 83 M109.5 83 Q116 79.5 122.5 85" stroke="${brow}" stroke-width="2.7" fill="none" stroke-linecap="round"/>`) +
    eyes(c.eyes) +
    `<path d="M97 106 Q100 109 103 106" stroke="${sh}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    mouth(c.mouth, !male) +
    glasses(c.glasses) +
    hairFront(c.hair, h)
  );
}

// Голова со спины: уши, затылок и причёска
function headBack(c, skin, sh, h) {
  return `<ellipse cx="58" cy="96" rx="7" ry="10" fill="${skin}"/><ellipse cx="142" cy="96" rx="7" ry="10" fill="${skin}"/>` +
    `<ellipse cx="100" cy="90" rx="42" ry="45" fill="${skin}"/>` + hairNape(c.hair, h) +
    (c.hair === 'afro' ? `<circle cx="100" cy="82" r="50" fill="${h}"/>` : '');
}

// ---------- одежда ----------
function topBack(t, k) {
  if (t === 'hoodie' || t === 'mgimo-hoodie') return `<path d="M70 152 Q66 118 100 116 Q134 118 130 152 Z" fill="${dk(k, 0.2)}"/>`;
  return '';
}

function topColor(c) {
  if (c.top === 'mgimo-tee' || c.top === 'mgimo-hoodie' || c.top === 'mun-bomber') return CLOTH.navy;
  if (c.top === 'ling-knit') return CLOTH.sky;
  if (c.top === 'focus-jacket') return CLOTH.royal;
  if (c.top === 'gown') return CLOTH.black;
  return col(c.topColor, CLOTH.white);
}

function torso(c, sh) {
  const t = c.top;
  const k = topColor(c);
  const d = dk(k, 0.12);
  const b = bodyOf(c);
  const TORSO = torsoPath(b);
  let s = `<path d="${TORSO}" fill="${k}"/>`;
  switch (t) {
    case 'polo':
      s += `<path d="M90 140 L100 154 L110 140 Z" fill="${sh}"/><path d="M85 139 L100 151 L94 160 L80 147 Z M115 139 L100 151 L106 160 L120 147 Z" fill="${d}"/>` +
        `<path d="M100 151 L100 177" stroke="${dk(k, 0.2)}" stroke-width="2"/><circle cx="100" cy="161" r="1.9" fill="${lt(k, 0.55)}"/><circle cx="100" cy="171" r="1.9" fill="${lt(k, 0.55)}"/>`;
      break;
    case 'shirt':
      s += `<path d="M92 140 L100 150 L108 140 Z" fill="${sh}"/><path d="M100 150 V234" stroke="${dk(k, 0.15)}" stroke-width="1.6"/>` +
        [166, 184, 202, 220].map((y) => `<circle cx="100" cy="${y}" r="1.9" fill="${dk(k, 0.28)}"/>`).join('') +
        `<path d="M110 166 h14 v11 q0 3 -3 3 h-8 q-3 0 -3 -3 Z" fill="none" stroke="${dk(k, 0.15)}" stroke-width="1.4"/>` +
        `<path d="M86 138 L100 150 L95 158 L82 144 Z M114 138 L100 150 L105 158 L118 144 Z" fill="${lt(k, 0.45)}" stroke="${dk(k, 0.12)}" stroke-width="1"/>`;
      break;
    case 'hoodie':
    case 'mgimo-hoodie':
      s += `<path d="M84 141 Q100 160 116 141" fill="none" stroke="${dk(k, 0.2)}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M76 206 Q76 200 82 200 L118 200 Q124 200 124 206 L128 228 L72 228 Z" fill="${dk(k, 0.08)}"/>` +
        `<rect x="62" y="226" width="76" height="10" rx="5" fill="${dk(k, 0.12)}"/>` +
        `<path d="M94 152 L93 175 M106 152 L107 175" stroke="${lt(k, 0.62)}" stroke-width="2.4" stroke-linecap="round"/><circle cx="93" cy="177" r="2.4" fill="${lt(k, 0.62)}"/><circle cx="107" cy="177" r="2.4" fill="${lt(k, 0.62)}"/>`;
      if (t === 'mgimo-hoodie') s += print(GOLD, 100, 190);
      break;
    case 'sweater':
    case 'ling-knit':
      s += `<path d="M89 140 Q100 152 111 140 Z" fill="${sh}"/><path d="M86 140 Q100 156 114 140" fill="none" stroke="${dk(k, 0.15)}" stroke-width="5" stroke-linecap="round"/>` +
        `<rect x="62" y="224" width="76" height="12" rx="5" fill="${dk(k, 0.1)}"/>` +
        Array.from({ length: 11 }, (_, i) => `<path d="M${67 + i * 6.6} 226 v8" stroke="${dk(k, 0.22)}" stroke-width="1"/>`).join('');
      if (t === 'ling-knit') {
        // Полоса из букв разных алфавитов: в МГИМО учат десятки языков
        s += `<rect x="62.5" y="170" width="75" height="22" fill="#fff"/><text x="100" y="186" text-anchor="middle" font-family="Onest, Arial, sans-serif" font-size="12" font-weight="700" fill="${CLOTH.navy}" letter-spacing="1">A Б 中 ع Ω</text>`;
      }
      break;
    case 'turtleneck':
      s += `<rect x="87" y="122" width="26" height="24" rx="8" fill="${dk(k, 0.08)}"/>` +
        [92, 97, 103, 108].map((x) => `<path d="M${x} 126 v17" stroke="${dk(k, 0.22)}" stroke-width="1.2"/>`).join('');
      break;
    case 'blazer':
    case 'gown':
      s = `<path d="${TORSO}" fill="#FFFFFF"/><path d="M92 140 L100 152 L108 140 Z" fill="${sh}"/>` +
        `<path d="M${100 - b.sh} 152 C${100 - b.sh} 145 ${109 - b.sh} 141 86 140 L100 196 L100 236 L${108 - b.hip} 236 Q${100 - b.hip} 236 ${100 - b.hip} 228 C${100 - b.hip} 218 ${100 - b.waist} 210 ${100 - b.waist} 196 C${100 - b.waist} 182 ${100 - b.sh} 170 ${100 - b.sh} 152 Z" fill="${k}"/>` +
        `<path d="M${100 + b.sh} 152 C${100 + b.sh} 145 ${91 + b.sh} 141 114 140 L100 196 L100 236 L${92 + b.hip} 236 Q${100 + b.hip} 236 ${100 + b.hip} 228 C${100 + b.hip} 218 ${100 + b.waist} 210 ${100 + b.waist} 196 C${100 + b.waist} 182 ${100 + b.sh} 170 ${100 + b.sh} 152 Z" fill="${k}"/>` +
        `<path d="M86 140 L94 168 L84 160 L81 146 Z M114 140 L106 168 L116 160 L119 146 Z" fill="${t === 'gown' ? GOLD : dk(k, 0.16)}"/>` +
        `<circle cx="100" cy="210" r="2.6" fill="${dk(k, 0.35)}"/><path d="M70 214 h17 M113 214 h17" stroke="${dk(k, 0.22)}" stroke-width="2" stroke-linecap="round"/>`;
      if (t === 'gown') s += `<circle cx="118" cy="170" r="9" fill="${GOLD}"/><path d="m118 164 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="${CLOTH.navy}"/>`;
      break;
    case 'mun-bomber':
    case 'focus-jacket':
      s += `<path d="M84 141 Q100 160 116 141" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/>` +
        `<rect x="62" y="224" width="76" height="12" rx="5" fill="${GOLD}"/><path d="M62 228 h76 M62 232 h76" stroke="${k}" stroke-width="1.2"/>` +
        `<path d="M100 152 V224" stroke="${lt(k, 0.25)}" stroke-width="1.6"/><circle cx="119" cy="174" r="9" fill="${GOLD}"/>` +
        (t === 'mun-bomber'
          ? `<text x="119" y="178.5" text-anchor="middle" font-family="Onest, Arial, sans-serif" font-weight="700" font-size="11" fill="${CLOTH.navy}">M</text>`
          : `<path d="m119 168 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="${CLOTH.navy}"/>`);
      break;
    default: // tee, mgimo-tee
      s += `<path d="M88 140 Q100 155 112 140 Z" fill="${sh}"/><path d="M85.5 140 Q100 158 114.5 140" fill="none" stroke="${d}" stroke-width="3"/>`;
      if (t === 'mgimo-tee') s += print(GOLD, 102, 194);
  }
  return s;
}

function arms(c, skin, pose) {
  const t = c.top;
  const k = topColor(c);
  const long = LONG.includes(t);
  const bomber = t === 'mun-bomber' || t === 'focus-jacket';
  const one = (L) => {
    const off = bodyOf(c).arm;
    const x = L ? 49 - off : 134 + off;
    let g = `<rect x="${x}" y="150" width="17" height="70" rx="8.5" fill="${skin}"/><circle cx="${x + 8.5}" cy="223" r="9.5" fill="${skin}"/>`;
    if (long) {
      g += `<rect x="${x - 3}" y="146" width="23" height="68" rx="10.5" fill="${k}"/>`;
      g += t === 'blazer' || t === 'shirt' || t === 'gown'
        ? `<rect x="${x - 3}" y="206" width="23" height="8" rx="4" fill="${t === 'shirt' ? lt(k, 0.35) : '#fff'}"/>`
        : `<rect x="${x - 3}" y="205" width="23" height="9" rx="4.5" fill="${bomber ? GOLD : dk(k, 0.13)}"/>`;
    } else {
      g += `<rect x="${x - 3}" y="146" width="23" height="32" rx="10" fill="${k}"/><rect x="${x - 3}" y="172" width="23" height="6" rx="3" fill="${dk(k, 0.1)}"/>`;
    }
    const base = L ? `rotate(5 ${57 - off} 152)` : `rotate(-5 ${143 + off} 152)`;
    const tr = pose[L ? 'armL' : 'armR'];
    return `<g class="av-arm-${L ? 'l' : 'r'}"${tr ? ` transform="${tr}"` : ''}><g transform="${base}">${g}</g></g>`;
  };
  return one(true) + one(false);
}

function shoe(type, color, L) {
  const x = L ? 64 : 101;
  const c = col(color, CLOTH.gray);
  switch (type) {
    case 'boots': return `<rect x="${x + 1}" y="268" width="33" height="31" rx="9" fill="${c}"/><rect x="${x + 1}" y="293" width="33" height="7" rx="3.5" fill="${dk(c, 0.35)}"/><path d="M${x + 11} 274 h13 M${x + 11} 280 h13" stroke="${lt(c, 0.25)}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'loafers': return `<rect x="${x}" y="285" width="35" height="14" rx="7" fill="${c}"/><rect x="${x + 9}" y="286.5" width="17" height="3.6" rx="1.8" fill="${lt(c, 0.28)}"/>`;
    case 'hightops': return `<rect x="${x}" y="272" width="35" height="27" rx="9" fill="${c}"/><rect x="${x}" y="292" width="35" height="7" rx="3.5" fill="#fff"/><path d="M${x + 10} 278 h15 M${x + 10} 284 h15" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
    case 'runners': return `<rect x="${x}" y="283" width="35" height="16" rx="8" fill="#fff" stroke="#DADDE1"/><path d="M${x + 4} 291 Q${x + 17} 284 ${x + 31} 287" stroke="${GOLD}" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="${x}" y="294" width="35" height="6" rx="3" fill="${CLOTH.navy}"/>`;
    default: return `<rect x="${x}" y="283" width="35" height="16" rx="8" fill="#fff" stroke="#DADDE1"/><rect x="${x}" y="294" width="35" height="6" rx="3" fill="${c}"/><circle cx="${x + 14}" cy="288.5" r="1.4" fill="#C9CDD3"/><circle cx="${x + 21}" cy="288.5" r="1.4" fill="#C9CDD3"/>`;
  }
}

function legs(c, skin, pose) {
  const b = c.bottom;
  const bc = col(c.bottomColor, CLOTH.denim);
  const one = (L) => {
    const x = L ? 68 : 103;
    const cx = x + 14.5;
    let g = '';
    if (b === 'shorts') {
      g += `<rect x="${x + 3}" y="240" width="23" height="50" rx="10" fill="${skin}"/><rect x="${x}" y="236" width="29" height="24" rx="8" fill="${bc}"/>`;
    } else if (b === 'skirt') {
      g += `<rect x="${x + 4}" y="240" width="21" height="50" rx="10" fill="${skin}"/>`;
    } else {
      g += `<rect x="${x}" y="236" width="29" height="56" rx="10" fill="${bc}"/>`;
      if (b === 'jeans') g += `<path d="M${cx} 254 V288" stroke="${dk(bc, 0.2)}" stroke-width="1.4" opacity=".7"/>`;
      if (b === 'trousers') g += `<path d="M${cx} 246 V290" stroke="${dk(bc, 0.24)}" stroke-width="1.1" opacity=".6"/>`;
      if (b === 'joggers') g += `<rect x="${x}" y="279" width="29" height="11" rx="5" fill="${dk(bc, 0.14)}"/>`;
      if (b === 'cargo') g += `<rect x="${x + (L ? 2 : 9)}" y="254" width="18" height="16" rx="3" fill="${dk(bc, 0.12)}"/><path d="M${x + (L ? 2 : 9)} 258 h18" stroke="${dk(bc, 0.25)}" stroke-width="1.2"/>`;
    }
    g += shoe(c.shoes, c.shoesColor, L);
    const tr = pose[L ? 'legL' : 'legR'];
    return `<g class="av-leg-${L ? 'l' : 'r'}"${tr ? ` transform="${tr}"` : ''}>${g}</g>`;
  };
  let hip;
  if (b === 'skirt') {
    hip = `<path d="M64 230 L136 230 L146 268 Q100 276 54 268 Z" fill="${bc}"/><path d="M84 240 L80 268 M100 240 V272 M116 240 L120 268" stroke="${dk(bc, 0.13)}" stroke-width="1.6"/>`;
  } else {
    hip = `<path d="M63 230 L137 230 L136 253 Q100 257 64 253 Z" fill="${bc}"/>`;
  }
  return one(true) + one(false) + hip;
}

function bodyExtras(c) {
  const k = col(c.extraColor, CLOTH.navy);
  switch (c.extra) {
    case 'lanyard':
      return `<path d="M90 142 L97 182 M110 142 L103 182" stroke="${CLOTH.navy}" stroke-width="3.2" stroke-linecap="round"/><rect x="88" y="180" width="24" height="31" rx="4" fill="#fff" stroke="#DADDE1"/><rect x="88" y="180" width="24" height="8" rx="3" fill="${CLOTH.navy}"/><circle cx="100" cy="197" r="4.6" fill="#E3E5E8"/><rect x="93" y="204" width="14" height="2.6" rx="1.3" fill="${GOLD}"/>`;
    case 'tie':
      return `<path d="M96 146 L104 146 L106 154 L102.5 198 L100 203 L97.5 198 L94 154 Z" fill="${k}"/><path d="M95 145 L105 145 L103.5 153 L96.5 153 Z" fill="${dk(k, 0.22)}"/>`;
    case 'scarf':
      return `<path d="M78 139 Q100 157 122 139 L124 151 Q100 169 76 151 Z" fill="${k}"/><path d="M105 152 L113 195 L103 197 L98 156 Z" fill="${dk(k, 0.08)}"/><path d="M104 197 v5 M107.5 196.5 v5 M111 196 v5" stroke="${dk(k, 0.08)}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'medal':
      return `<path d="M92 141 L100 168 L108 141" stroke="${CLOTH.navy}" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="100" cy="176" r="10" fill="#FFD84D" stroke="#C9A646" stroke-width="2"/><path d="M100 170 l1.8 3.8 4.1 .5 -3 2.8 .8 4.1 -3.7 -2 -3.7 2 .8 -4.1 -3 -2.8 4.1 -.5 Z" fill="#fff"/>`;
    default:
      return '';
  }
}

function bag(c) {
  if (c.extra !== 'bag') return '';
  const k = col(c.extraColor, CLOTH.graphite);
  return `<path d="M66 150 L128 206" stroke="${dk(k, 0.3)}" stroke-width="4" stroke-linecap="round"/><rect x="118" y="200" width="30" height="26" rx="7" fill="${k}"/><path d="M118 208 h30" stroke="${dk(k, 0.22)}" stroke-width="2"/><rect x="129" y="210" width="8" height="4" rx="2" fill="${lt(k, 0.45)}"/>`;
}

function hat(c) {
  const k = col(c.hatColor, CLOTH.graphite);
  switch (c.hat) {
    case 'cap':
    case 'mgimo-cap': {
      const kk = c.hat === 'mgimo-cap' ? CLOTH.navy : k;
      return `<path d="M56 86 C55 52 77 33 100 33 C123 33 145 52 144 86 Q100 77 56 86 Z" fill="${kk}"/><path d="M100 35 L100 79" stroke="${dk(kk, 0.15)}" stroke-width="1.5"/>` +
        (c.hat === 'mgimo-cap' ? print(GOLD, 106, 64, 0.8) : '') +
        `<path d="M50 87 Q100 70 150 87 Q153 97 142 97 Q100 86 58 97 Q47 97 50 87 Z" fill="${dk(kk, 0.2)}"/><circle cx="100" cy="34" r="3.5" fill="${dk(kk, 0.25)}"/>`;
    }
    case 'beanie':
      return `<path d="M55 92 C53 50 76 29 100 29 C124 29 147 50 145 92 Z" fill="${k}"/><path d="M52 82 Q100 72 148 82 L148 96 Q100 88 52 96 Z" fill="${dk(k, 0.12)}"/>` +
        Array.from({ length: 13 }, (_, i) => `<path d="M${58 + i * 7} 84 v8" stroke="${dk(k, 0.26)}" stroke-width="1.4" opacity=".55"/>`).join('') +
        `<circle cx="100" cy="27" r="10" fill="${lt(k, 0.28)}"/>`;
    case 'beret':
      return `<ellipse cx="96" cy="58" rx="50" ry="20" transform="rotate(-8 96 58)" fill="${k}"/><path d="M58 70 Q100 62 142 70" stroke="${dk(k, 0.25)}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="92" cy="38" r="3.5" fill="${dk(k, 0.3)}"/>`;
    case 'bucket':
      return `<path d="M64 76 C64 46 82 33 100 33 C118 33 136 46 136 76 Z" fill="#D8C3A1"/><path d="M64 67 L136 67 L136 77 L64 77 Z" fill="${CLOTH.navy}"/><circle cx="123" cy="72" r="4" fill="${GOLD}"/><path d="M42 85 Q100 62 158 85 Q161 95 150 95 Q100 79 50 95 Q39 95 42 85 Z" fill="#C9B28C"/>`;
    case 'mortarboard':
      // Шапочка выпускника: квадратный верх и золотая кисточка
      return `<path d="M60 74 C60 58 78 50 100 50 C122 50 140 58 140 74 Z" fill="#1D1D1F"/><path d="M30 52 L100 30 L170 52 L100 74 Z" fill="#26262A" stroke="#111" stroke-width="1.5"/><circle cx="100" cy="52" r="3.6" fill="${GOLD}"/><path d="M100 52 Q132 56 140 60 L140 84" stroke="${GOLD}" stroke-width="2.4" fill="none"/><path d="M136 84 h8 l-1 12 h-6 Z" fill="${GOLD}"/>`;
    default:
      return '';
  }
}

