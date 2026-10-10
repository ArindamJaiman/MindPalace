import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { sfx } from '../lib/sound';

const N = 28;
const R = 82;
const C = 150;

interface Pt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rx: number;
  ry: number;
}

/** Closed Catmull-Rom spline through the points, as an SVG path. */
function smoothPath(pts: Pt[]): string {
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    if (i === 0) d += `M${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d + 'Z';
}

/** Blobby: a squishy jelly with springy physics and eyes that follow you around. */
export function Jelly() {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const shineRef = useRef<SVGPathElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const pupilL = useRef<SVGCircleElement>(null);
  const pupilR = useRef<SVGCircleElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const lidsRef = useRef<SVGGElement>(null);
  const bump = useStore((s) => s.bumpFidget);

  useEffect(() => {
    const pts: Pt[] = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2;
      const rx = C + Math.cos(a) * R;
      const ry = C + Math.sin(a) * R * 0.92 + 8;
      return { x: rx, y: ry, vx: 0, vy: 0, rx, ry };
    });
    const mouse = { x: C, y: C - 60, down: false, lx: 0, ly: 0, weights: [] as number[], moved: 0 };
    let raf = 0;
    let t = 0;
    let blinkAt = 120;
    let squish = 0;

    const toLocal = (e: PointerEvent) => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 };
    };

    const onWindowMove = (e: PointerEvent) => {
      const p = toLocal(e);
      if (mouse.down) {
        const dx = p.x - mouse.lx;
        const dy = p.y - mouse.ly;
        mouse.moved += Math.abs(dx) + Math.abs(dy);
        pts.forEach((pt, i) => {
          pt.x += dx * mouse.weights[i];
          pt.y += dy * mouse.weights[i];
        });
        mouse.lx = p.x;
        mouse.ly = p.y;
      }
      mouse.x = p.x;
      mouse.y = p.y;
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      mouse.down = true;
      mouse.lx = p.x;
      mouse.ly = p.y;
      mouse.moved = 0;
      mouse.weights = pts.map((pt) => Math.exp(-((pt.x - p.x) ** 2 + (pt.y - p.y) ** 2) / (2 * 55 * 55)));
      squish = 1;
      sfx.squish();
      bump('squishes');
    };
    const onUp = () => {
      if (!mouse.down) return;
      mouse.down = false;
      if (mouse.moved < 6) {
        // a poke: push nearby points inward, then let the springs bounce back
        pts.forEach((pt, i) => {
          const w = mouse.weights[i];
          pt.vx += (C - pt.x) * 0.12 * w;
          pt.vy += (C - pt.y) * 0.12 * w;
        });
      } else sfx.boing();
    };

    const svg = svgRef.current!;
    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onUp);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      t++;
      // idle breathing
      const breathe = Math.sin(t * 0.04) * 1.5;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const a = (i / N) * Math.PI * 2;
        const tx = p.rx + Math.cos(a) * breathe;
        const ty = p.ry + Math.sin(a) * breathe;
        const prev = pts[(i - 1 + N) % N];
        const next = pts[(i + 1) % N];
        const k = mouse.down ? 0.012 : 0.05;
        p.vx += (tx - p.x) * k + ((prev.x + next.x) / 2 - p.x) * 0.08;
        p.vy += (ty - p.y) * k + ((prev.y + next.y) / 2 - p.y) * 0.08;
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x += p.vx;
        p.y += p.vy;
      }
      bodyRef.current?.setAttribute('d', smoothPath(pts));

      // face follows the centroid of the body
      let cx = 0;
      let cy = 0;
      let minY = Infinity;
      for (const p of pts) {
        cx += p.x;
        cy += p.y;
        minY = Math.min(minY, p.y);
      }
      cx /= N;
      cy /= N;
      const stretch = Math.max(0.7, Math.min(1.3, (cy - minY) / (R * 0.92)));
      faceRef.current?.setAttribute('transform', `translate(${cx - C} ${cy - C}) translate(${C} ${C}) scale(${1 / stretch} ${stretch}) translate(${-C} ${-C})`);
      shineRef.current?.setAttribute('transform', `translate(${(cx - C) * 0.8} ${(cy - C) * 0.8})`);

      // eyes look at the cursor
      const look = (el: SVGCircleElement | null, ex: number) => {
        if (!el) return;
        const dx = mouse.x - (cx + ex - C);
        const dy = mouse.y - (cy - 10);
        const d = Math.hypot(dx, dy) || 1;
        const m = Math.min(5, d / 20);
        el.setAttribute('cx', String(ex + (dx / d) * m));
        el.setAttribute('cy', String(C - 10 + (dy / d) * m));
      };
      look(pupilL.current, C - 24);
      look(pupilR.current, C + 24);

      // blink every few seconds
      blinkAt--;
      const blinking = blinkAt < 8;
      if (blinkAt <= 0) blinkAt = 150 + Math.random() * 200;
      lidsRef.current?.querySelectorAll('.lid').forEach((lid) => lid.setAttribute('transform', `translate(0 ${blinking ? 0 : -30})`));

      squish *= 0.94;
      const open = mouse.down ? 1 : squish;
      mouthRef.current?.setAttribute(
        'd',
        open > 0.15
          ? `M${C - 9},${C + 16} Q${C},${C + 16 + 16 * open} ${C + 9},${C + 16} Q${C},${C + 10} ${C - 9},${C + 16}Z`
          : `M${C - 12},${C + 14} Q${C},${C + 24} ${C + 12},${C + 14}`,
      );
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      svg.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [bump]);

  return (
    <svg ref={svgRef} viewBox="0 0 300 300" className="jelly" data-nosnap>
      <defs>
        <radialGradient id="jelly-g" cx="40%" cy="35%" r="75%">
          <stop offset="0" style={{ stopColor: '#ffe2a8' }} />
          <stop offset="0.35" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="0.8" style={{ stopColor: '#6b1a04' }} />
          <stop offset="1" style={{ stopColor: '#2a0a02' }} />
        </radialGradient>
        <clipPath id="eye-l">
          <circle cx={C - 24} cy={C - 10} r="12" />
        </clipPath>
        <clipPath id="eye-r">
          <circle cx={C + 24} cy={C - 10} r="12" />
        </clipPath>
      </defs>
      <ellipse cx={C} cy={C + R + 22} rx={R * 0.9} ry="10" fill="rgba(0,0,0,0.35)" />
      <path ref={bodyRef} fill="url(#jelly-g)" className="jelly-body" />
      <path ref={shineRef} d={`M${C - 50},${C - 40} Q${C - 40},${C - 70} ${C - 5},${C - 72}`} stroke="rgba(255,236,200,0.4)" strokeWidth="9" strokeLinecap="round" fill="none" />
      <g ref={faceRef}>
        <circle cx={C - 24} cy={C - 10} r="12" fill="#fff4e0" />
        <circle cx={C + 24} cy={C - 10} r="12" fill="#fff4e0" />
        <circle ref={pupilL} cx={C - 24} cy={C - 10} r="6" fill="#120800" />
        <circle ref={pupilR} cx={C + 24} cy={C - 10} r="6" fill="#120800" />
        <g ref={lidsRef}>
          <g clipPath="url(#eye-l)">
            <rect className="lid" x={C - 37} y={C - 23} width="26" height="26" fill="var(--accent)" />
          </g>
          <g clipPath="url(#eye-r)">
            <rect className="lid" x={C + 11} y={C - 23} width="26" height="26" fill="var(--accent)" />
          </g>
        </g>
        <path ref={mouthRef} stroke="#120800" strokeWidth="3.5" strokeLinecap="round" fill="#3a0d00" />
      </g>
    </svg>
  );
}
