import { useEffect, useRef } from 'react';

const INTERACTIVE = 'button, a, [role="button"], input[type="checkbox"], select, label.t-check, [data-cursor]';
const TEXT = 'input:not([type=checkbox]):not([type=range]):not([type=button]), textarea, [contenteditable="true"], .cm-content';
const GLYPHS = '01ABCDEF#$%<>/|';

interface Glyph {
  x: number;
  y: number;
  vy: number;
  life: number;
  ch: string;
  color: string;
}

function labelFor(el: HTMLElement): string {
  const explicit = el.closest<HTMLElement>('[data-cursor]')?.dataset.cursor;
  if (explicit) return explicit;
  if (el.closest('a')) return 'OPEN';
  if (el.closest('input[type="checkbox"], label.t-check')) return 'TOGGLE';
  return 'EXEC';
}

/**
 * Hacker cursor: viewport-wide crosshair hairlines with a coordinate readout, a block caret
 * that inverts what's under it, square brackets that lock onto controls with an action label,
 * and a glyph trail that rains off the pointer.
 */
export function HackerCursor({ trail, reduce }: { trail: boolean; reduce: boolean }) {
  const hx = useRef<HTMLDivElement>(null);
  const hy = useRef<HTMLDivElement>(null);
  const coord = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    if (coarse) return;
    document.documentElement.classList.add('hc-on');
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const resize = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const m = { x: -100, y: -100, px: -100, py: -100, inside: false, down: false };
    const c = { x: -100, y: -100 };
    const b = { x: 0, y: 0, w: 0, h: 0, o: 0 };
    let target: HTMLElement | null = null;
    let text = false;
    const glyphs: Glyph[] = [];
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      m.x = e.clientX;
      m.y = e.clientY;
      if (!m.inside) {
        m.inside = true;
        c.x = m.px = m.x;
        c.y = m.py = m.y;
      }
    };
    const onOver = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest) return;
      text = !!el.closest(TEXT);
      const hit = text ? null : el.closest<HTMLElement>(INTERACTIVE);
      if (hit !== target) {
        target = hit;
        if (hit && tag.current) tag.current.textContent = labelFor(hit);
        const bx = box.current;
        if (hit && bx) {
          // restart the lock-on animation
          bx.classList.remove('lock');
          void bx.offsetWidth;
          bx.classList.add('lock');
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      m.down = true;
      if (text || reduce) return;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 1 + Math.random() * 4;
        glyphs.push({
          x: e.clientX + Math.cos(a) * 4,
          y: e.clientY + Math.sin(a) * 4,
          vy: Math.sin(a) * s,
          life: 1,
          ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
          color: i % 5 === 0 ? '#ff2b2b' : i % 7 === 0 ? '#2f7bff' : '#f5f5f5',
        });
      }
      caret.current?.classList.add('glitch');
      setTimeout(() => caret.current?.classList.remove('glitch'), 180);
    };
    const onUp = () => (m.down = false);
    const onLeave = () => (m.inside = false);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const k = reduce ? 1 : 0.35;
      c.x += (m.x - c.x) * k;
      c.y += (m.y - c.y) * k;
      const visible = m.inside && !text;

      hx.current!.style.transform = `translate3d(0, ${m.y}px, 0)`;
      hy.current!.style.transform = `translate3d(${m.x}px, 0, 0)`;
      hx.current!.style.opacity = hy.current!.style.opacity = m.inside ? '1' : '0';
      coord.current!.style.transform = `translate3d(${m.x + 16}px, ${m.y + 18}px, 0)`;
      coord.current!.textContent = `X:${String(Math.round(m.x)).padStart(4, '0')} Y:${String(Math.round(m.y)).padStart(4, '0')}`;
      coord.current!.style.opacity = visible ? '1' : '0';

      const scale = m.down ? 0.7 : 1;
      caret.current!.style.transform = `translate3d(${c.x - 5}px, ${c.y - 9}px, 0) scale(${target ? 0.5 : scale})`;
      caret.current!.style.opacity = visible ? '1' : '0';

      // Brackets: lock onto the hovered control, otherwise collapse onto the caret.
      let tx = c.x - 12;
      let ty = c.y - 14;
      let tw = 24;
      let th = 28;
      if (target?.isConnected) {
        const r = target.getBoundingClientRect();
        tx = r.left - 6;
        ty = r.top - 4;
        tw = r.width + 12;
        th = r.height + 8;
      }
      b.x += (tx - b.x) * 0.3;
      b.y += (ty - b.y) * 0.3;
      b.w += (tw - b.w) * 0.3;
      b.h += (th - b.h) * 0.3;
      b.o += ((target && visible ? 1 : 0) - b.o) * 0.25;
      const bx = box.current!;
      bx.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
      bx.style.width = `${b.w}px`;
      bx.style.height = `${b.h}px`;
      bx.style.opacity = String(b.o);

      // Glyph trail
      const dx = m.x - m.px;
      const dy = m.y - m.py;
      const speed = Math.hypot(dx, dy);
      if (trail && !reduce && visible && speed > 3) {
        const n = Math.min(3, Math.ceil(speed / 14));
        for (let i = 0; i < n; i++) {
          const r = Math.random();
          glyphs.push({
            x: m.px + dx * (i / n) + (Math.random() - 0.5) * 6,
            y: m.py + dy * (i / n),
            vy: 0.4 + Math.random() * 1.2,
            life: 1,
            ch: GLYPHS[(Math.random() * GLYPHS.length) | 0],
            color: r > 0.94 ? '#ff2b2b' : r > 0.9 ? '#2f7bff' : '#bdbdbd',
          });
        }
      }
      m.px = m.x;
      m.py = m.y;

      ctx.clearRect(0, 0, cv.width, cv.height);
      if (glyphs.length) {
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        for (let i = glyphs.length - 1; i >= 0; i--) {
          const g = glyphs[i];
          g.life -= 0.03;
          if (g.life <= 0) {
            glyphs.splice(i, 1);
            continue;
          }
          g.y += g.vy;
          g.vy += 0.05;
          if (Math.random() < 0.08) g.ch = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          ctx.globalAlpha = g.life;
          ctx.fillStyle = g.color;
          ctx.fillText(g.ch, g.x, g.y);
        }
        ctx.globalAlpha = 1;
        if (glyphs.length > 300) glyphs.splice(0, glyphs.length - 300);
      }
    };
    raf = requestAnimationFrame(draw);

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('hc-on');
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [coarse, trail, reduce]);

  if (coarse) return null;
  return (
    <>
      <canvas ref={canvas} className="hc-trail" aria-hidden />
      <div ref={hx} className="hc-hair x" aria-hidden />
      <div ref={hy} className="hc-hair y" aria-hidden />
      <div ref={coord} className="hc-coord" aria-hidden />
      <div ref={box} className="hc-box" aria-hidden>
        <span ref={tag} className="hc-tag">EXEC</span>
      </div>
      <div ref={caret} className="hc-caret" aria-hidden />
    </>
  );
}
