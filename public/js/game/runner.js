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

  resize() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.horizon = this.H * 0.3;
    this.nearY = this.H * 0.95;
    this.lane = Math.min(this.W * 0.27, this.H * 0.36);
    if (this.state !== 'run') this.draw();
  }

  // Проекция: дорожка laneX на глубине z → точка на экране и масштаб
  s(z) { return F / (F + Math.max(-0.9, z)); }
  gy(z) { return this.horizon + (this.nearY - this.horizon) * this.s(z); }
  sx(x, z) { return this.W / 2 + x * this.lane * this.s(z); }
  u(z) { return this.lane * this.s(z); }

  reset() {
    this.t = 0; this.score = 0; this.coins = 0; this.dist = 0;
    this.speed = 14; this.laneI = 0; this.px = 0;
    this.y = 0; this.vy = 0; this.slideT = 0;
    this.shield = 0; this.mult = 0;
    this.objs = []; this.pops = [];
    this.nextRow = 26; this.deco = 0; this.frame = 0; this.animT = 0;
  }

  // ---------- управление ----------
  move(d) { if (this.state === 'run') this.laneI = Math.max(-1, Math.min(1, this.laneI + d)); }
  jump() { if (this.state === 'run' && this.y <= 0.001) { this.vy = 6.4; this.slideT = 0; } }
  slide() { if (this.state === 'run') { this.slideT = 0.62; if (this.y > 0) this.vy = Math.min(this.vy, -8); } }
  typing(e) { const t = e.target; return (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) || document.querySelector('.modal-overlay, .drawer'); }
  onKey(e) {
    if (this.typing(e)) return;
    const k = e.code;
    if (this.state !== 'run') {
      if ((k === 'Space' || k === 'Enter') && document.activeElement === this.wrap && (this.state === 'ready' || this.state === 'over')) { e.preventDefault(); this.start(); }
      return;
    }
    if (['ArrowLeft', 'KeyA'].includes(k)) { e.preventDefault(); this.move(-1); }
    if (['ArrowRight', 'KeyD'].includes(k)) { e.preventDefault(); this.move(1); }
    if (['ArrowUp', 'KeyW', 'Space'].includes(k)) { e.preventDefault(); if (!e.repeat) this.jump(); }
    if (['ArrowDown', 'KeyS'].includes(k)) { e.preventDefault(); this.slide(); }
  }
  // Свайпы: влево-вправо — дорожка, вверх — прыжок, вниз — подкат, тап — прыжок
  onDown(e) {
    if (e.target.closest('button')) return;
    this.touch = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.state === 'run') e.preventDefault();
  }
  onUp(e) {
    const t = this.touch;
    this.touch = null;
    if (!t || this.state !== 'run') return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { this.jump(); return; }
    if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 1 : -1);
    else if (dy < 0) this.jump(); else this.slide();
  }

  async start() {
    if (this.state === 'loading' || this.state === 'dead' || this.state === 'starting' || this.state === 'run') return;
    this.state = 'starting';
    this.show('starting');
    let r = null;
    try { r = await this.opt.onStart(); } catch (e) { r = null; }
    if (this.state === 'dead') return;
    if (!r || !r.run) { this.left = r ? r.left || 0 : this.left; this.state = 'ready'; this.show(this.left > 1 ? 'error' : 'limit'); return; }
    this.runId = r.run;
    this.left = r.left;
    this.reset();
    this.state = 'run';
    this.hide();
    this.last = 0;
    try { this.wrap.focus({ preventScroll: true }); } catch (e) { /* ничего */ }
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

