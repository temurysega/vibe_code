// «Бегом на пару»: аватар бежит по коридору учебного корпуса к аудитории.
// Три дорожки, прыжок и подкат, М-коины и бонусы. Время забега отмеряет сервер — 5 минут в день.
import { svg as avatarSvg, pet as petSvg } from '../art/avatar.js';

const NAVY = '#0F2D69', GOLD = '#C9A646', INK = '#0B2150';
const F = 7;                 // фокусное расстояние камеры
const Z_FAR = 70;            // дальность прорисовки
const DOORS = ['1001', '1023', '2007', '2014', '3008', '3047', '4018', '4031'];
const PZ = 2.4;              // глубина, на которой бежит игрок

function toImg(svg) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Типы препятствий: low — перепрыгнуть, high — проскочить подкатом, block — только сменить дорожку
const KINDS = {
  bench: { type: 'low', w: 0.9, h: 0.34 },
  wet: { type: 'low', w: 0.55, h: 0.55 },
  banner: { type: 'high', w: 1, h: 0.3, lift: 0.78 },
  cart: { type: 'block', w: 0.86, h: 0.95 },
  deadline: { type: 'block', w: 0.8, h: 1.35 },
};

export class Runner {
  constructor(wrap, opt) {
    this.wrap = wrap;
    this.opt = opt;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.overlay = wrap.querySelector('.runner-overlay');
    this.state = 'loading';
    this.best = opt.best || 0;
    this.left = opt.left || 0;
    this.loop = this.loop.bind(this);
    this.onKey = this.onKey.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onVis = () => { if (document.hidden && this.state === 'run') this.over('hidden'); };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(wrap);
    wrap.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVis);
    this.overlay.addEventListener('click', (e) => { const b = e.target.closest('[data-run]'); if (b) this.start(); });
    this.reset();
    this.resize();
    this.load().then(() => {
      if (this.state === 'dead') return;
      this.state = 'ready';
      this.draw();
      this.show(this.left > 1 ? 'ready' : 'limit');
    }).catch(() => { this.state = 'ready'; this.show('ready'); });
  }

  async load() {
    const av = this.opt.av;
    const mk = (pose) => toImg(avatarSvg(av, { view: 'full', pose, shadow: false, back: true, raster: [300, 480] }));
    [this.run1, this.run2, this.jumpImg, this.slideImg] = await Promise.all([mk('run1'), mk('run2'), mk('jump'), mk('slide')]);
    if (this.opt.pet && this.opt.pet !== 'none') this.petImg = await toImg(petSvg(this.opt.pet, this.opt.petColor, { shadow: false, raster: [180, 150] }));
  }

