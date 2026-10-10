/**
 * Global particle/FX engine drawn on one full-screen canvas (see components/FxLayer).
 * The render loop only runs while something is alive, so it costs nothing when idle.
 */

type Shape = 'circle' | 'square' | 'star' | 'streak';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
  radius: number;
  color: string;
}

const particles: Particle[] = [];
const texts: FloatText[] = [];
const ripples: Ripple[] = [];

let canvas: HTMLCanvasElement | null = null;
let c2d: CanvasRenderingContext2D | null = null;
let raf = 0;
let last = 0;
let reduced = false;

export const PALETTE = ['#8b7bff', '#4fd1c5', '#ff7ab6', '#ffc857', '#5ee6a0', '#7cc4ff'];

export function setReducedMotion(v: boolean) {
  reduced = v;
}

export function attachFxCanvas(el: HTMLCanvasElement | null) {
  canvas = el;
  c2d = el?.getContext('2d') ?? null;
  resize();
}

export function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  c2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function wake() {
  if (!raf && c2d) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export interface BurstOptions {
  count?: number;
  colors?: string[];
  speed?: number;
  spread?: number;
  angle?: number;
  gravity?: number;
  shapes?: Shape[];
  size?: number;
}

function burst(x: number, y: number, o: BurstOptions = {}) {
  const count = Math.round((o.count ?? 24) * (reduced ? 0.25 : 1));
  const colors = o.colors ?? PALETTE;
  const speed = o.speed ?? 6;
  const spread = o.spread ?? Math.PI * 2;
  const angle = o.angle ?? -Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * rand(0.4, 1.1);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0,
      max: rand(40, 75),
      size: (o.size ?? 4) * rand(0.6, 1.4),
      color: pick(colors),
      shape: pick(o.shapes ?? ['circle', 'square', 'star', 'streak']),
      rot: Math.random() * Math.PI,
      vr: rand(-0.3, 0.3),
      gravity: o.gravity ?? 0.18,
      drag: 0.965,
    });
  }
  wake();
}

export const fx = {
  burst,
  /** Small sparkle used for clicks. */
  sparkle(x: number, y: number, color?: string) {
    burst(x, y, { count: 8, speed: 3.2, gravity: 0.02, size: 2.6, colors: color ? [color] : undefined, shapes: ['circle', 'star'] });
  },
  ripple(x: number, y: number, color = 'rgba(139,123,255,0.8)', radius = 40) {
    if (reduced) return;
    ripples.push({ x, y, life: 0, max: 32, radius, color });
    wake();
  },
  text(x: number, y: number, text: string, color = '#ffc857', size = 18) {
    texts.push({ x, y, text, color, life: 0, max: 70, size });
    wake();
  },
  /** Full-screen celebration from both bottom corners. */
  confetti(intensity = 1) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const n = Math.round(90 * intensity);
    burst(0, h * 0.85, { count: n, angle: -Math.PI / 3, spread: 0.9, speed: 19, gravity: 0.32, size: 6 });
    burst(w, h * 0.85, { count: n, angle: (-2 * Math.PI) / 3, spread: 0.9, speed: 19, gravity: 0.32, size: 6 });
  },
  /** Burst positioned on a DOM element's centre. */
  burstAt(el: Element | null, o?: BurstOptions) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, o);
  },
};

function drawStar(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function loop(now: number) {
  const ctx = c2d;
  if (!ctx || !canvas) {
    raf = 0;
    return;
  }
  // Normalise to 60fps steps so physics feel the same on 120Hz screens.
  const dt = Math.min(3, (now - last) / 16.67);
  last = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.life += dt;
    const t = r.life / r.max;
    if (t >= 1) {
      ripples.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2 * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      particles.splice(i, 1);
      continue;
    }
    p.vx *= Math.pow(p.drag, dt);
    p.vy = p.vy * Math.pow(p.drag, dt) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const t = p.life / p.max;
    ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    ctx.fillStyle = p.color;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    switch (p.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'square':
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        break;
      case 'star':
        drawStar(ctx, p.size * 0.8);
        break;
      case 'streak':
        ctx.rotate(Math.atan2(p.vy, p.vx) - p.rot);
        ctx.fillRect(-p.size * 1.5, -0.8, p.size * 3, 1.6);
        break;
    }
    ctx.restore();
  }

  ctx.textAlign = 'center';
  for (let i = texts.length - 1; i >= 0; i--) {
    const f = texts[i];
    f.life += dt;
    const t = f.life / f.max;
    if (t >= 1) {
      texts.splice(i, 1);
      continue;
    }
    const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : t < 0.25 ? 1.15 - ((t - 0.15) / 0.1) * 0.15 : 1;
    ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    ctx.font = `700 ${f.size * pop}px "Space Grotesk", Inter, sans-serif`;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - t * 46);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  if (particles.length || texts.length || ripples.length) {
    raf = requestAnimationFrame(loop);
  } else {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    raf = 0;
  }
}
