import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { fx } from '../lib/fx';

const SNAP_SEL = 'button, a, [role="button"], [data-snap], select, summary, .switch';
const TEXT_SEL =
  'input:not([type=checkbox]):not([type=range]):not([type=color]):not([type=button]), textarea, [contenteditable="true"], .cm-content';
const MAX_SNAP_W = 280;
const MAX_SNAP_H = 90;

type Rgb = [number, number, number];

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  flicker: number;
}

function hexToRgb(hex: string): Rgb {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 106, 26];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Heat ramp for an ember as it cools: white-hot → accent → deep ember → smoke. */
function emberRamp(accent: Rgb) {
  const white: Rgb = [255, 246, 228];
  const hot = mix(accent, white, 0.45);
  const deep = mix(accent, [40, 6, 0], 0.55);
  const smoke: Rgb = [70, 72, 78];
  return (life: number): Rgb => {
    if (life > 0.8) return mix(hot, white, (life - 0.8) / 0.2);
    if (life > 0.55) return mix(accent, hot, (life - 0.55) / 0.25);
    if (life > 0.25) return mix(deep, accent, (life - 0.25) / 0.3);
    return mix(smoke, deep, life / 0.25);
  };
}

const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Targeting-reticle cursor: an exact crosshair, a springy diamond reticle that rotates square
 * and locks its corner brackets onto whatever you hover, plus an ember or tracer trail.
 */
export function Cursor() {
  const style = useStore((s) => s.settings.cursor);
  const morph = useStore((s) => s.settings.cursorMorph);
  const accent = useStore((s) => s.settings.accent);
  const reduce = useStore((s) => s.settings.reduceMotion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const active = style !== 'off' && !coarse;

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('custom-cursor');
    const canvas = canvasRef.current!;
    const reticle = reticleRef.current!;
    const cross = crossRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const accentRgb = hexToRgb(accent);
    const heat = emberRamp(accentRgb);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const mouse = { x: -100, y: -100, px: -100, py: -100, inside: false, down: false };
    const cur = { x: -100, y: -100, w: 26, h: 26, a: 45, speed: 0 };
    let snapEl: HTMLElement | null = null;
    let magnetEl: HTMLElement | null = null;
    let textMode = false;
    let hovering = false;
    const embers: Ember[] = [];
    const tracer: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let t = 0;
    let lockTimer: ReturnType<typeof setTimeout> | undefined;

    const releaseMagnet = () => {
      if (magnetEl) magnetEl.style.translate = '';
      magnetEl = null;
    };

    const spawnEmbers = (x: number, y: number, n: number, spread: number, vx0 = 0, vy0 = 0) => {
      for (let i = 0; i < n; i++) {
        embers.push({
          x: x + (Math.random() - 0.5) * spread,
          y: y + (Math.random() - 0.5) * spread,
          vx: vx0 + (Math.random() - 0.5) * 1.6,
          vy: vy0 + (Math.random() - 0.5) * 1.6 - 0.6,
          life: 1,
          decay: 0.018 + Math.random() * 0.022,
          size: 1 + Math.random() * 2.2,
          flicker: Math.random() * Math.PI * 2,
        });
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!mouse.inside) {
        mouse.inside = true;
        cur.x = mouse.px = mouse.x;
        cur.y = mouse.py = mouse.y;
      }
    };

    const onOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      textMode = !!target.closest(TEXT_SEL);
      const snap = textMode ? null : (target.closest(SNAP_SEL) as HTMLElement | null);
      hovering = !!snap;
      let next: HTMLElement | null = null;
      if (snap && morph && !snap.closest('[data-nosnap]')) {
        const r = snap.getBoundingClientRect();
        if (r.width <= MAX_SNAP_W && r.height <= MAX_SNAP_H) next = snap;
      }
      if (next && next !== snapEl) {
        // Lock-on flash each time the reticle acquires a new target.
        reticle.classList.remove('locking');
        void reticle.offsetWidth;
        reticle.classList.add('locking');
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => reticle.classList.remove('locking'), 320);
      }
      snapEl = next;

      const mag = target.closest('[data-magnetic]') as HTMLElement | null;
      if (mag !== magnetEl) {
        releaseMagnet();
        magnetEl = mag;
      }
    };

    const onLeave = () => {
      mouse.inside = false;
      releaseMagnet();
    };
    const onDown = (e: PointerEvent) => {
      mouse.down = true;
      if (textMode || e.pointerType === 'touch') return;
      fx.ripple(e.clientX, e.clientY, accent, 30);
      if (!reduce) spawnEmbers(e.clientX, e.clientY, 14, 4, 0, -0.5);
    };
    const onUp = () => {
      mouse.down = false;
    };

    const draw = () => {
      t++;
      if (magnetEl) {
        const r = magnetEl.getBoundingClientRect();
        magnetEl.style.translate = `${(mouse.x - (r.left + r.width / 2)) * 0.25}px ${(mouse.y - (r.top + r.height / 2)) * 0.25}px`;
      }

      const dx = mouse.x - mouse.px;
      const dy = mouse.y - mouse.py;
      const speed = Math.hypot(dx, dy);
      cur.speed += (Math.min(speed, 40) - cur.speed) * 0.15;

      // --- reticle target: a diamond that widens with speed, or the hovered element's box ---
      let tx = mouse.x;
      let ty = mouse.y;
      let tw = (hovering ? 34 : 24) + cur.speed * 0.7;
      let th = tw;
      let ta = 45 + Math.sin(t * 0.03) * 4;
      if (snapEl && snapEl.isConnected) {
        const r = snapEl.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        tw = r.width + 12;
        th = r.height + 12;
        ta = 0;
      }
      if (mouse.down) {
        tw *= 0.78;
        th *= 0.78;
      }
      const k = reduce ? 1 : 0.24;
      cur.x += (tx - cur.x) * k;
      cur.y += (ty - cur.y) * k;
      cur.w += (tw - cur.w) * 0.22;
      cur.h += (th - cur.h) * 0.22;
      cur.a += (ta - cur.a) * 0.18;

      const visible = mouse.inside && !textMode;
      reticle.style.transform = `translate3d(${cur.x - cur.w / 2}px, ${cur.y - cur.h / 2}px, 0) rotate(${cur.a}deg)`;
      reticle.style.width = `${cur.w}px`;
      reticle.style.height = `${cur.h}px`;
      reticle.style.setProperty('--bl', `${Math.max(6, Math.min(13, Math.min(cur.w, cur.h) * 0.3))}px`);
      reticle.style.opacity = visible ? '1' : '0';
      reticle.classList.toggle('is-locked', !!snapEl);
      reticle.classList.toggle('is-down', mouse.down);
      cross.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0) rotate(${snapEl ? 45 : 0}deg) scale(${snapEl ? 0.7 : 1})`;
      cross.style.opacity = visible ? '1' : '0';

      // --- trail ---
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (!reduce && mouse.inside && !textMode) {
        if (style === 'embers' && speed > 1) {
          const n = Math.min(5, Math.ceil(speed / 7));
          for (let i = 0; i < n; i++) {
            const f = i / n;
            spawnEmbers(mouse.px + dx * f, mouse.py + dy * f, 1, 5, -dx * 0.04, -dy * 0.04);
          }
        } else if (style === 'tracer') {
          tracer.push({ x: mouse.x, y: mouse.y, t: performance.now() });
          if (speed > 22 && Math.random() < 0.5) spawnEmbers(mouse.x, mouse.y, 1, 2, -dx * 0.08, -dy * 0.08);
        }
      }
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      if (embers.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = embers.length - 1; i >= 0; i--) {
          const p = embers[i];
          p.life -= p.decay;
          if (p.life <= 0) {
            embers.splice(i, 1);
            continue;
          }
          // Embers rise and drift like they're coming off a fire.
          p.vy -= 0.035;
          p.vx *= 0.97;
          p.vy *= 0.97;
          p.x += p.vx + Math.sin(t * 0.15 + p.flicker) * 0.25;
          p.y += p.vy;
          const c = heat(p.life);
          const flick = 0.75 + 0.25 * Math.sin(t * 0.6 + p.flicker);
          const a = Math.min(1, p.life * 1.6) * flick;
          if (p.life > 0.25) {
            ctx.fillStyle = rgba(c, a * 0.18);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          const sp = Math.hypot(p.vx, p.vy);
          if (sp > 1.4) {
            // fast embers render as short sparks along their velocity
            ctx.strokeStyle = rgba(c, a);
            ctx.lineWidth = p.size * 0.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
            ctx.stroke();
          } else {
            ctx.fillStyle = rgba(c, a);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (p.life < 0.25 ? 1.4 : 0.8), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        if (embers.length > 360) embers.splice(0, embers.length - 360);
      }

      if (tracer.length) {
        const now = performance.now();
        while (tracer.length && now - tracer[0].t > 220) tracer.shift();
        if (tracer.length > 2) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i < tracer.length; i++) {
            const a = tracer[i - 1];
            const b = tracer[i];
            const f = i / tracer.length;
            // outer glow
            ctx.strokeStyle = rgba(accentRgb, f * 0.35);
            ctx.lineWidth = 2 + f * 9;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            // white-hot core
            ctx.strokeStyle = rgba(mix(accentRgb, [255, 250, 240], f), f);
            ctx.lineWidth = 0.6 + f * 2.2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(lockTimer);
      releaseMagnet();
      document.documentElement.classList.remove('custom-cursor');
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [active, style, morph, accent, reduce]);

  if (!active) return null;
  return (
    <>
      <canvas ref={canvasRef} className="cursor-trail" aria-hidden />
      <div ref={reticleRef} className="reticle" aria-hidden>
        <i className="rb tl" />
        <i className="rb tr" />
        <i className="rb bl" />
        <i className="rb br" />
      </div>
      <div ref={crossRef} className="crosshair" aria-hidden>
        <i />
        <i />
      </div>
    </>
  );
}
