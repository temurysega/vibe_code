// Маленькие радости: конфетти, монеты к балансу, счётчик и отклик на каждое нажатие.
import { session } from '../lib/bus.js';

const quiet = () => !!(session.play && session.play.prefs && (session.play.prefs.quiet || session.play.prefs.noConfetti));

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
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('ru-RU');
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

