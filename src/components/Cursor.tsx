import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { fx } from '../lib/fx';

const SNAP_SEL = 'button, a, [role="button"], [data-snap], select, summary, .switch';
const TEXT_SEL =
  'input:not([type=checkbox]):not([type=range]):not([type=color]):not([type=button]), textarea, [contenteditable="true"], .cm-content';
const MAX_SNAP_W = 280;
const MAX_SNAP_H = 90;

interface TrailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
}

function hexToHue(hex: string): number {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return 250;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h;
}

/**
 * The custom cursor: an instant dot, a springy ring that morphs around buttons,
 * magnetic elements, click ripples, and a glowing comet or ribbon trail.
 */
export function Cursor() {
  const style = useStore((s) => s.settings.cursor);
  const morph = useStore((s) => s.settings.cursorMorph);
  const accent = useStore((s) => s.settings.accent);
  const reduce = useStore((s) => s.settings.reduceMotion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const active = style !== 'off' && !coarse;

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('custom-cursor');
    const canvas = canvasRef.current!;
    const ring = ringRef.current!;
    const dot = dotRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const baseHue = hexToHue(accent);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const mouse = { x: -100, y: -100, px: -100, py: -100, inside: false, down: false };
    const cur = { x: -100, y: -100, w: 34, h: 34, r: 17 };
    let snapEl: HTMLElement | null = null;
    let snapRadius = 10;
    let magnetEl: HTMLElement | null = null;
    let textMode = false;
    let hovering = false;
    const particles: TrailParticle[] = [];
    const ribbon: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let t = 0;

    const releaseMagnet = () => {
      if (magnetEl) magnetEl.style.translate = '';
      magnetEl = null;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!mouse.inside) {
        mouse.inside = true;
        cur.x = mouse.x;
        cur.y = mouse.y;
        mouse.px = mouse.x;
        mouse.py = mouse.y;
      }
    };

    const onOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      textMode = !!target.closest(TEXT_SEL);
      const snap = textMode ? null : (target.closest(SNAP_SEL) as HTMLElement | null);
      hovering = !!snap;
      if (snap && morph && !snap.closest('[data-nosnap]')) {
        const r = snap.getBoundingClientRect();
        if (r.width <= MAX_SNAP_W && r.height <= MAX_SNAP_H) {
          if (snap !== snapEl) {
            const br = parseFloat(getComputedStyle(snap).borderTopLeftRadius) || 8;
            snapRadius = Math.min(br + 5, Math.min(r.width, r.height) / 2 + 6);
          }
          snapEl = snap;
        } else snapEl = null;
      } else snapEl = null;

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
      if (!textMode && e.pointerType !== 'touch') {
        fx.ripple(e.clientX, e.clientY, accent, 28);
        if (!reduce) fx.sparkle(e.clientX, e.clientY);
      }
    };
    const onUp = () => {
      mouse.down = false;
    };

    const draw = () => {
      t++;
      // --- magnetic pull ---
      if (magnetEl) {
        const r = magnetEl.getBoundingClientRect();
        const dx = mouse.x - (r.left + r.width / 2);
        const dy = mouse.y - (r.top + r.height / 2);
        magnetEl.style.translate = `${dx * 0.28}px ${dy * 0.28}px`;
      }

      // --- ring target ---
      let tx = mouse.x;
      let ty = mouse.y;
      let tw = hovering ? 46 : 34;
      let th = tw;
      let tr = tw / 2;
      if (snapEl && snapEl.isConnected) {
        const r = snapEl.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        tw = r.width + 10;
        th = r.height + 10;
        tr = snapRadius;
      }
      if (mouse.down) {
        tw *= 0.86;
        th *= 0.86;
      }
      const k = reduce ? 1 : 0.22;
      cur.x += (tx - cur.x) * k;
      cur.y += (ty - cur.y) * k;
      cur.w += (tw - cur.w) * 0.2;
      cur.h += (th - cur.h) * 0.2;
      cur.r += (tr - cur.r) * 0.2;
      const visible = mouse.inside && !textMode;
      ring.style.transform = `translate3d(${cur.x - cur.w / 2}px, ${cur.y - cur.h / 2}px, 0)`;
      ring.style.width = `${cur.w}px`;
      ring.style.height = `${cur.h}px`;
      ring.style.borderRadius = `${cur.r}px`;
      ring.style.opacity = visible ? '1' : '0';
      ring.classList.toggle('is-snapped', !!snapEl);
      ring.classList.toggle('is-hover', hovering);
      dot.style.transform = `translate3d(${mouse.x - 3}px, ${mouse.y - 3}px, 0) scale(${snapEl ? 0.6 : 1})`;
      dot.style.opacity = visible ? '1' : '0';

      // --- trail ---
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const dx = mouse.x - mouse.px;
      const dy = mouse.y - mouse.py;
      const speed = Math.hypot(dx, dy);
      if (!reduce && mouse.inside && !textMode) {
        if (style === 'comet' && speed > 0.5) {
          const n = Math.min(6, Math.ceil(speed / 6));
          for (let i = 0; i < n; i++) {
            const f = i / n;
            particles.push({
              x: mouse.px + dx * f + (Math.random() - 0.5) * 4,
              y: mouse.py + dy * f + (Math.random() - 0.5) * 4,
              vx: (Math.random() - 0.5) * 0.6 - dx * 0.02,
              vy: (Math.random() - 0.5) * 0.6 - dy * 0.02 + 0.15,
              life: 1,
              size: 2 + Math.random() * 3.2 + Math.min(speed, 40) * 0.05,
              hue: (baseHue + Math.sin(t * 0.03) * 50 + Math.random() * 30 + 360) % 360,
            });
          }
        } else if (style === 'ribbon') {
          ribbon.push({ x: mouse.x, y: mouse.y, t: performance.now() });
        }
      }
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      if (particles.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= 0.028;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          p.x += p.vx;
          p.y += p.vy;
          // Two stacked discs + additive blending read as a soft glow, far cheaper than gradients.
          const r = p.size * p.life;
          ctx.fillStyle = `hsla(${p.hue}, 95%, 62%, ${p.life * 0.16})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${p.hue}, 100%, 78%, ${p.life * 0.85})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        if (particles.length > 400) particles.splice(0, particles.length - 400);
      }

      if (ribbon.length) {
        const now = performance.now();
        while (ribbon.length && now - ribbon[0].t > 280) ribbon.shift();
        if (ribbon.length > 2) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 1; i < ribbon.length; i++) {
            const a = ribbon[i - 1];
            const b = ribbon[i];
            const f = i / ribbon.length;
            ctx.strokeStyle = `hsla(${(baseHue + f * 90) % 360}, 100%, 70%, ${f * 0.9})`;
            ctx.lineWidth = 1 + f * 7;
            ctx.shadowColor = `hsl(${(baseHue + f * 90) % 360}, 100%, 65%)`;
            ctx.shadowBlur = 12 * f;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.shadowBlur = 0;
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
      <div ref={ringRef} className="cursor-ring" aria-hidden />
      <div ref={dotRef} className="cursor-dot" aria-hidden />
    </>
  );
}
