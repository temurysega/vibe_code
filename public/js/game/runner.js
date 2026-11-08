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
  typing(e) { const t = e.target; return (t && t.closest('button, a, input, textarea, select, [contenteditable="true"]')) || document.querySelector('.modal-overlay, .drawer, .menu'); }
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

  loop(ts) {
    if (this.state !== 'run') return;
    const dt = this.last ? Math.min(0.034, (ts - this.last) / 1000) : 0.016;
    this.last = ts;
    this.update(dt);
    this.draw();
    if (this.state === 'run') this.raf = requestAnimationFrame(this.loop);
  }

  // Ряд препятствий: всегда остаётся хотя бы один проход
  spawnRow(z) {
    const lanes = [-1, 0, 1];
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const r = Math.random();
    const add = (kind, lane) => this.objs.push({ kind, lane, z, hit: false });
    const coins = (lane, arc) => { for (let i = 0; i < 4; i++) this.objs.push({ kind: 'coin', lane, z: z + 2 + i * 1.6, h: arc ? 0.95 : 0.3 }); };
    const t = this.t;
    if (r < 0.22) {
      const free = pick(lanes);
      lanes.filter((l) => l !== free).forEach((l) => add(Math.random() < 0.5 ? 'cart' : 'deadline', l));
      coins(free, false);
    } else if (r < 0.42) {
      lanes.forEach((l) => add(Math.random() < 0.6 ? 'bench' : 'wet', l));
      coins(pick(lanes), true);
    } else if (r < 0.58 && t > 12) {
      lanes.forEach((l) => add('banner', l));
    } else if (r < 0.8) {
      const a = pick(lanes);
      add(pick(['cart', 'deadline']), a);
      const b = pick(lanes.filter((l) => l !== a));
      add(pick(['bench', 'wet', t > 12 ? 'banner' : 'bench']), b);
      coins(lanes.find((l) => l !== a && l !== b), false);
    } else {
      coins(pick(lanes), false);
      if (Math.random() < 0.5) this.objs.push({ kind: Math.random() < 0.5 ? 'coffee' : 'book', lane: pick(lanes), z: z + 4, h: 0.4 });
    }
  }

  update(dt) {
    this.t += dt;
    this.left -= dt;
    if (this.left <= 0) { this.left = 0; this.over('time'); return; }
    this.speed = Math.min(34, 14 + this.t * 0.14);
    const dz = this.speed * dt;
    this.dist += dz;
    this.score += dz * (this.mult > 0 ? 2 : 1);
    this.deco = (this.deco + dz) % 8;
    this.px += (this.laneI - this.px) * Math.min(1, dt * 14);
    // прыжок и подкат
    if (this.y > 0 || this.vy > 0) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    this.slideT = Math.max(0, this.slideT - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.mult = Math.max(0, this.mult - dt);
    this.animT += dt * (this.speed / 14);
    if (this.animT > 0.12) { this.animT = 0; this.frame ^= 1; }

    this.nextRow -= dz;
    if (this.nextRow <= 0) {
      this.spawnRow(Z_FAR);
      this.nextRow = Math.max(11, this.speed * 0.72) + Math.random() * 6;
    }
    this.objs.forEach((o) => { o.z -= dz; });
    this.objs = this.objs.filter((o) => o.z > -2 && !o.taken);
    this.pops.forEach((p) => { p.life -= dt; p.y -= 30 * dt; });
    this.pops = this.pops.filter((p) => p.life > 0);

    // столкновения в зоне игрока
    const lane = Math.round(this.px);
    const sliding = this.slideT > 0;
    for (const o of this.objs) {
      if (Math.abs(o.z - PZ) > 0.4 || o.lane !== lane) continue;
      if (o.kind === 'coin') {
        const ok = o.h > 0.6 ? this.y > 0.35 : this.y < 0.9;
        if (ok) { o.taken = true; this.coins += 1; this.score += 10; this.pops.push({ text: '+10', x: this.sx(this.px, PZ), y: this.gy(PZ) - this.u(PZ) * 1.3, life: 0.7 }); }
        continue;
      }
      if (o.kind === 'coffee' || o.kind === 'book') {
        o.taken = true;
        if (o.kind === 'coffee') { this.shield = 4; this.pops.push({ text: 'Кофе: неуязвимость', x: this.W / 2, y: this.H * 0.4, life: 1.2 }); }
        else { this.mult = 8; this.pops.push({ text: 'Зачётка: очки ×2', x: this.W / 2, y: this.H * 0.4, life: 1.2 }); }
        continue;
      }
      if (o.hit) continue;
      const k = KINDS[o.kind];
      const hit = k.type === 'low' ? this.y < k.h + 0.05 : k.type === 'high' ? !sliding : true;
      if (hit) {
        if (this.shield > 0) { o.hit = true; this.pops.push({ text: 'Мимо!', x: this.sx(this.px, PZ), y: this.gy(PZ) - this.u(PZ) * 1.5, life: 0.6 }); continue; }
        this.over('hit');
        return;
      }
    }
  }

  async over(reason) {
    if (this.state !== 'run') return;
    this.state = 'over';
    cancelAnimationFrame(this.raf);
    this.draw();
    const score = Math.floor(this.score);
    this.show('saving', score);
    if (reason === 'hit') this.wrap.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    let res = null;
    try { res = await this.opt.onFinish(this.runId, score, this.coins, reason); } catch (e) { res = null; }
    if (this.state === 'dead') return;
    if (res) { this.best = Math.max(this.best, res.best || 0); this.left = res.left; }
    this.show('over', score, res, reason);
  }

  // ---------- отрисовка ----------
  draw() {
    const c = this.ctx, W = this.W, H = this.H;
    if (!W) return;
    // потолок и дальний свет аудитории
    const g = c.createLinearGradient(0, 0, 0, this.horizon);
    g.addColorStop(0, '#0B1C42');
    g.addColorStop(1, '#1C438F');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const edge = 1.7, wallH = 2.7;
    const zf = Z_FAR;
    const pt = (x, z, h = 0) => [this.sx(x, z), this.gy(z) - h * this.u(z)];
    const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); };
    // стены
    poly([pt(-edge, zf), pt(-edge, -0.9), pt(-edge, -0.9, wallH), pt(-edge, zf, wallH)], '#DCE4F2');
    poly([pt(edge, zf), pt(edge, -0.9), pt(edge, -0.9, wallH), pt(edge, zf, wallH)], '#D2DBEC');
    // пол
    poly([pt(-edge, zf), pt(edge, zf), pt(edge, -0.9), pt(-edge, -0.9)], '#E9EEF7');
    // дверь аудитории в конце коридора
    const [dx, dy] = pt(0, zf);
    const du = this.u(zf);
    c.fillStyle = '#FFF4D1';
    c.fillRect(dx - du * 0.7, dy - du * 1.9, du * 1.4, du * 1.9);
    c.fillStyle = 'rgba(255,244,209,.35)';
    c.beginPath(); c.arc(dx, dy - du, du * 3, 0, Math.PI * 2); c.fill();
    // плитка и дорожки
    c.strokeStyle = '#D3DCEB';
    c.lineWidth = 1;
    for (let z = 8 - this.deco; z < zf; z += 4) {
      const [x1, y1] = pt(-edge, z), [x2] = pt(edge, z);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y1); c.stroke();
    }
    c.strokeStyle = '#C3CEE2';
    c.lineWidth = 2;
    [-0.5, 0.5].forEach((x) => { const [a, b] = pt(x, zf), [d, e] = pt(x, -0.9); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); });
    // потолок, двери аудиторий с номерами и лампы
    poly([pt(-edge, zf, wallH), pt(edge, zf, wallH), pt(edge, -0.9, wallH), pt(-edge, -0.9, wallH)], '#C5D0E5');
    for (let i = 0; i < 10; i++) {
      const z = i * 8 - this.deco + 3;
      if (z < -0.9 || z > zf - 2) continue;
      const X = (i % 2 ? 1 : -1) * edge;
      poly([pt(X, z), pt(X, z + 1.3), pt(X, z + 1.3, 1.95), pt(X, z, 1.95)], NAVY);
      poly([pt(X, z + 0.12), pt(X, z + 1.18), pt(X, z + 1.18, 1.84), pt(X, z + 0.12, 1.84)], '#16346F');
      const u = this.u(z + 0.65);
      if (u > 14) {
        const [nx, ny] = pt(X, z + 0.65, 2.2);
        c.fillStyle = GOLD;
        c.font = `700 ${Math.max(9, u * 0.16)}px Onest, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillText(DOORS[(i + Math.floor(this.dist / 80)) % DOORS.length], nx, ny);
      }
      poly([pt(-0.6, z + 0.3, wallH), pt(0.6, z + 0.3, wallH), pt(0.6, z + 0.8, wallH), pt(-0.6, z + 0.8, wallH)], 'rgba(255,255,255,.9)');
    }
    // объекты от дальних к ближним
    const list = this.objs.slice().sort((a, b) => b.z - a.z);
    for (const o of list) {
      if (o.z > zf || o.z < -1.2) continue;
      this.object(c, o);
    }
    this.player(c);
    // всплывающие подписи
    c.textAlign = 'center';
    c.font = '700 16px Onest, system-ui, sans-serif';
    this.pops.forEach((p) => { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = '#fff'; c.fillText(p.text, p.x, p.y); });
    c.globalAlpha = 1;
    this.hud(c);
  }

  object(c, o) {
    const u = this.u(o.z);
    const x = this.sx(o.lane, o.z);
    const y = this.gy(o.z);
    if (o.kind === 'coin') {
      const r = u * 0.16;
      const cy = y - u * o.h - r;
      const sq = Math.abs(Math.cos(this.t * 5 + o.z));
      c.fillStyle = GOLD;
      c.beginPath(); c.ellipse(x, cy, Math.max(1, r * (0.35 + 0.65 * sq)), r, 0, 0, Math.PI * 2); c.fill();
      if (sq > 0.5 && r > 6) { c.fillStyle = INK; c.font = `700 ${r * 1.1}px Onest, sans-serif`; c.textAlign = 'center'; c.fillText('М', x, cy + r * 0.4); }
      return;
    }
    if (o.kind === 'coffee' || o.kind === 'book') {
      const s = u * 0.32;
      const cy = y - u * 0.55 + Math.sin(this.t * 4) * u * 0.05;
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath(); c.arc(x, cy, s * 1.1, 0, Math.PI * 2); c.fill();
      if (o.kind === 'coffee') {
        c.fillStyle = '#fff'; rr(c, x - s * 0.45, cy - s * 0.5, s * 0.9, s, s * 0.15); c.fill();
        c.fillStyle = '#7A5236'; c.fillRect(x - s * 0.45, cy - s * 0.2, s * 0.9, s * 0.35);
      } else {
        c.fillStyle = '#2F8A3B'; rr(c, x - s * 0.4, cy - s * 0.55, s * 0.8, s * 1.1, s * 0.1); c.fill();
        c.fillStyle = GOLD; c.fillRect(x - s * 0.25, cy - s * 0.2, s * 0.5, s * 0.12);
      }
      return;
    }
    const k = KINDS[o.kind];
    const w = u * k.w, h = u * k.h;
    if (o.hit) c.globalAlpha = 0.35;
    switch (o.kind) {
      case 'bench':
        c.fillStyle = '#8A5A3B'; rr(c, x - w / 2, y - h, w, h * 0.35, 4); c.fill();
        c.fillStyle = '#6B4429'; c.fillRect(x - w * 0.42, y - h * 0.65, w * 0.08, h * 0.65); c.fillRect(x + w * 0.34, y - h * 0.65, w * 0.08, h * 0.65);
        break;
      case 'wet':
        c.fillStyle = '#FFD84D';
        c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w / 2, y); c.lineTo(x - w / 2, y); c.closePath(); c.fill();
        if (u > 30) { c.fillStyle = INK; c.font = `700 ${u * 0.09}px Onest, sans-serif`; c.textAlign = 'center'; c.fillText('МОКРЫЙ', x, y - h * 0.38); c.fillText('ПОЛ', x, y - h * 0.2); }
        break;
      case 'banner': {
        const by = y - u * k.lift;
        c.fillStyle = '#6B7280'; c.fillRect(x - w / 2, by - h, u * 0.05, u * k.lift + h); c.fillRect(x + w / 2 - u * 0.05, by - h, u * 0.05, u * k.lift + h);
        c.fillStyle = '#E5484D'; rr(c, x - w / 2, by - h, w, h, 4); c.fill();
        c.fillStyle = '#fff';
        for (let i = 0; i < 5; i++) c.fillRect(x - w / 2 + (i * w) / 5 + w * 0.04, by - h, w * 0.1, h);
        if (u > 30) { c.fillStyle = INK; c.font = `700 ${u * 0.12}px Onest, sans-serif`; c.textAlign = 'center'; c.fillText('РЕМОНТ', x, by - h * 0.3); }
        break;
      }
      case 'cart':
        c.fillStyle = '#7A8699'; rr(c, x - w / 2, y - h * 0.9, w, h * 0.8, 6); c.fill();
        [NAVY, GOLD, '#E0735A', '#3BAE8A', '#8E6CC4'].forEach((col, i) => { c.fillStyle = col; c.fillRect(x - w * 0.42 + i * w * 0.17, y - h, w * 0.13, h * 0.5); });
        c.fillStyle = INK; c.beginPath(); c.arc(x - w * 0.3, y - u * 0.05, u * 0.06, 0, Math.PI * 2); c.arc(x + w * 0.3, y - u * 0.05, u * 0.06, 0, Math.PI * 2); c.fill();
        break;
      case 'deadline':
        c.fillStyle = '#2E2E30'; c.fillRect(x - u * 0.04, y - h * 0.75, u * 0.08, h * 0.75);
        c.fillStyle = '#E5484D'; rr(c, x - w / 2, y - h, w, h * 0.38, 6); c.fill();
        if (u > 26) { c.fillStyle = '#fff'; c.font = `700 ${u * 0.13}px Onest, sans-serif`; c.textAlign = 'center'; c.fillText('ДЕДЛАЙН', x, y - h * 0.76); }
        break;
      default: break;
    }
    c.globalAlpha = 1;
  }

  player(c) {
    const u = this.u(PZ);
    const x = this.sx(this.px, PZ);
    const ground = this.gy(PZ);
    const ph = u * 1.12, pw = (ph * 200) / 320;
    // тень и питомец, который бежит чуть сзади
    c.fillStyle = 'rgba(11,33,80,.18)';
    c.beginPath(); c.ellipse(x, ground - 2, pw * 0.36 * Math.max(0.5, 1 - this.y / 2.5), u * 0.05, 0, 0, Math.PI * 2); c.fill();
    if (this.petImg) {
      const pz = PZ - 0.9, s = this.u(pz) * 0.4;
      c.drawImage(this.petImg, this.sx(this.px + 0.42, pz) - s / 2, this.gy(pz) - s * 0.86 - Math.abs(Math.sin(this.t * 14)) * 4, s, s * 0.83);
    }
    const img = this.state !== 'run' && this.state !== 'over' ? this.run1 : this.slideT > 0 ? this.slideImg : this.y > 0 ? this.jumpImg : this.frame ? this.run2 : this.run1;
    if (this.shield > 0) {
      c.strokeStyle = `rgba(201,166,70,${0.5 + 0.3 * Math.sin(this.t * 10)})`;
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(x, ground - ph * 0.5 - this.y * u, pw * 0.7, ph * 0.62, 0, 0, Math.PI * 2); c.stroke();
    }
    if (img) c.drawImage(img, x - pw / 2, ground - ph - this.y * u + ph * 0.04, pw, ph);
  }

  hud(c) {
    const W = this.W;
    c.textAlign = 'left';
    c.fillStyle = 'rgba(11,28,66,.55)';
    rr(c, 12, 12, 132, 52, 12); c.fill();
    c.fillStyle = '#fff';
    c.font = '700 22px Onest, system-ui, sans-serif';
    c.fillText(Math.floor(this.score).toLocaleString('ru-RU'), 24, 42);
    c.font = '500 11px Onest, system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.fillText(`рекорд ${this.best.toLocaleString('ru-RU')}`, 24, 57);
    // М-коины забега
    c.fillStyle = 'rgba(11,28,66,.55)';
    rr(c, W - 96, 12, 84, 36, 18); c.fill();
    c.fillStyle = GOLD;
    c.beginPath(); c.arc(W - 76, 30, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = INK; c.font = '700 11px Onest, sans-serif'; c.textAlign = 'center'; c.fillText('М', W - 76, 34);
    c.fillStyle = '#fff'; c.font = '700 16px Onest, sans-serif'; c.textAlign = 'left'; c.fillText(String(this.coins), W - 58, 36);
    // сколько осталось сегодня
    const left = Math.max(0, Math.ceil(this.left));
    const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    c.textAlign = 'center';
    c.fillStyle = left <= 30 ? '#E5484D' : 'rgba(11,28,66,.55)';
    rr(c, W / 2 - 44, 12, 88, 30, 15); c.fill();
    c.fillStyle = '#fff'; c.font = '600 14px Onest, sans-serif'; c.fillText(`⏱ ${txt}`, W / 2, 32);
    if (this.mult > 0 || this.shield > 0) {
      c.font = '600 12px Onest, sans-serif';
      c.fillStyle = GOLD;
      c.fillText(this.shield > 0 ? `☕ неуязвимость ${Math.ceil(this.shield)} с` : `📗 очки ×2 · ${Math.ceil(this.mult)} с`, W / 2, 60);
    }
    c.textAlign = 'left';
  }

  // ---------- оверлей ----------
  show(kind, score, res, reason) {
    const fmtL = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let html = '';
    if (kind === 'ready') {
      html = `<div class="h3">Бегом на пару</div>
        <div class="muted small">← → — дорожка · ↑ или пробел — прыжок · ↓ — подкат<br>На телефоне — свайпы. Кофе даёт неуязвимость, зачётка — очки ×2</div>
        <button class="btn btn-primary btn-lg" data-run>▶ Начать · осталось ${fmtL(this.left)}</button>`;
    } else if (kind === 'starting') {
      html = '<div class="h3">На старт…</div>';
    } else if (kind === 'saving') {
      html = `<div class="h3">Финиш</div><div class="muted">Счёт ${score.toLocaleString('ru-RU')} · сохраняем…</div>`;
    } else if (kind === 'limit') {
      html = `<div class="h3">На сегодня всё</div><div class="muted">5 минут перерыва закончились — пора к учебникам 📚<br>Завтра забег снова будет доступен</div><a class="btn btn-primary" href="#/schedule">Открыть расписание</a>`;
    } else if (kind === 'error') {
      html = '<div class="h3">Не удалось начать</div><div class="muted">Проверьте интернет и попробуйте ещё раз</div><button class="btn btn-primary" data-run>Ещё раз</button>';
    } else {
      const head = reason === 'time' ? 'Время вышло' : reason === 'hidden' ? 'Забег завершён' : res && res.record ? 'Новый рекорд!' : 'Не успели на пару';
      html = `<div class="h3">${head}</div>
        <div class="muted">Счёт <b style="color:#fff">${(res ? res.score : score).toLocaleString('ru-RU')}</b> · рекорд ${this.best.toLocaleString('ru-RU')}${res && res.coins ? ` · +${res.coins} М-коинов` : ''}</div>
        ${res && res.unlocked && res.unlocked.length ? `<div class="badge badge-gold" style="height:30px;font-size:13px">Открыто: ${res.unlocked.join(', ')}</div>` : ''}
        ${this.left > 1 ? `<button class="btn btn-primary btn-lg" data-run>↻ Ещё раз · осталось ${fmtL(this.left)}</button>` : '<div class="muted">5 минут на сегодня закончились — до завтра!</div>'}`;
    }
    this.overlay.innerHTML = html;
    this.overlay.hidden = false;
  }
  hide() { this.overlay.hidden = true; }

  destroy() {
    if (this.state === 'run') this.over('hidden');
    this.state = 'dead';
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.wrap.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVis);
  }
}
