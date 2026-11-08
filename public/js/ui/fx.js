// Маленькие радости: конфетти, монеты к балансу, счётчик и отклик на каждое нажатие.
import { session } from '../lib/bus.js';

const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!(session.play && session.play.prefs && (session.play.prefs.quiet || session.play.prefs.noConfetti));

export function confetti(opt = {}) {
  if (quiet() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti-canvas';
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#0F2D69', '#C9A646', '#5B8DEF', '#E9D7A0', '#FFFFFF', '#1C438F'];
  const ox = opt.x != null ? opt.x : innerWidth / 2, oy = opt.y != null ? opt.y : innerHeight * 0.35;
  const parts = Array.from({ length: opt.n || 140 }, () => {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.3 };
  });
  let frames = 0;
  (function tick() {
    frames++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (p.c === '#FFFFFF') { ctx.strokeStyle = '#DEDFE1'; ctx.lineWidth = 1; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      ctx.restore();
    });
    if (frames < 150) requestAnimationFrame(tick); else cv.remove();
  })();
}

export function countUp(el, from, to, ms = 600) {
  if (quiet()) { el.textContent = to.toLocaleString('ru-RU'); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('ru-RU');
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

// М-коины летят от кнопки к балансу в шапке, затем счётчик досчитывает
export function flyCoins(fromRect, from, to) {
  const target = document.querySelector('[data-bal]');
  if (!target || quiet()) { if (target && from != null) countUp(target.querySelector('.bal-num'), from, to); return; }
  const tr = target.getBoundingClientRect();
  const sx = fromRect.left + fromRect.width / 2, sy = fromRect.top + fromRect.height / 2;
  const tx = tr.left + 18, ty = tr.top + tr.height / 2;
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.className = 'fly-coin';
    el.innerHTML = '<span class="coin" style="width:24px;height:24px;font-size:12px">М</span>';
    el.style.left = sx - 12 + 'px';
    el.style.top = sy - 12 + 'px';
    document.body.appendChild(el);
    const dx = (Math.random() - 0.5) * 140, dy = -40 - Math.random() * 90;
    el.animate([
      { transform: 'translate(0,0) scale(.6)', opacity: 0 },
      { transform: `translate(${dx}px,${dy}px) scale(1.1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${tx - sx}px,${ty - sy}px) scale(.55)`, opacity: 0.9 },
    ], { duration: 900 + i * 45, easing: 'cubic-bezier(.3,.1,.2,1)', fill: 'forwards' }).onfinish = () => el.remove();
  }
  setTimeout(() => {
    const t = document.querySelector('[data-bal]');
    if (!t) return;
    t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
    const n = t.querySelector('.bal-num');
    if (n && from != null) countUp(n, from, to, 700);
  }, 900);
}

// «Тыц»: кольцо и искры там, где нажали
const TAP = 'button, a, [role="button"], .item, .zone, .prod, .acc, .swatch, .chip, .lesson, .disc, .cat-tile, .campus-svg';
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !e.target.closest || quiet()) return;
  const t = e.target.closest(TAP);
  if (!t || t.disabled || t.closest('.runner-wrap')) return;
  const tap = document.createElement('span');
  tap.className = 'tap';
  tap.style.left = e.clientX + 'px';
  tap.style.top = e.clientY + 'px';
  tap.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
  document.body.appendChild(tap);
  setTimeout(() => tap.remove(), 650);
}, { passive: true });
