import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { useStore } from '../../store/store';
import type { Completion } from '../../store/types';
import { DAY, dayKey, daysAgo, formatTime, startOfDay } from '../../lib/dates';
import { countByDay, levelInfo, streak } from '../../lib/xp';
import { todayProgress } from '../../lib/tasks';

const RINGS = 14;

function bar(ratio: number, width = 34): string {
  const n = Math.round(Math.max(0, Math.min(1, ratio)) * width);
  return '|'.repeat(n) + ' '.repeat(width - n);
}

function bestStreak(cs: Completion[]): number {
  const days = [...new Set(cs.map((c) => startOfDay(c.at)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i && Math.round((d - days[i - 1]) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** Radar sweep: rings are days (today innermost), angle is time of day, blips flare as the beam passes. */
function Radar({ completions, progress }: { completions: Completion[]; progress: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const power = useRef({ v: 0 });
  const [tip, setTip] = useState<{ x: number; y: number; c: Completion; ring: number } | null>(null);

  const blips = useMemo(
    () =>
      completions
        .map((c) => ({ c, ring: daysAgo(c.at) }))
        .filter((b) => b.ring >= 0 && b.ring < RINGS)
        .map((b) => {
          const d = new Date(b.c.at);
          return { ...b, angle: ((d.getHours() * 60 + d.getMinutes()) / 1440) * Math.PI * 2 - Math.PI / 2, heat: 0 };
        }),
    [completions],
  );
  const blipsRef = useRef(blips);
  blipsRef.current = blips;
  const progRef = useRef(progress);
  progRef.current = progress;

  useGSAP(
    () => {
      gsap.to(power.current, { v: 1, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: wrap.current, start: 'top 80%', once: true } });
    },
    { scope: wrap },
  );

  useEffect(() => {
    const canvas = cv.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const ro = new ResizeObserver(() => {
      w = wrap.current!.clientWidth;
      h = wrap.current!.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    });
    ro.observe(wrap.current!);
    let mouse: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      mouse = null;
      setTip(null);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);

    let raf = 0;
    let lastTip: Completion | null = null;
    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!w) return;
      const p = power.current.v;
      const cx = w / 2;
      const cy = h / 2;
      const R = (Math.min(w, h) / 2 - 26) * (0.6 + 0.4 * p);
      const inner = R * 0.14;
      const gap = (R - inner) / (RINGS - 1);
      const sweep = ((now - t0) / 4000) * Math.PI * 2 - Math.PI / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = p;

      // grid: rings, crosshair and hour ticks
      ctx.strokeStyle = 'rgba(200,200,200,0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < RINGS; i++) {
        ctx.setLineDash(i === 0 ? [] : [2, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, inner + i * gap, 0, Math.PI * 2 * p);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(200,200,200,0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, R + 4, 0, Math.PI * 2 * p);
      ctx.moveTo(cx - R - 10, cy);
      ctx.lineTo(cx + R + 10, cy);
      ctx.moveTo(cx, cy - R - 10);
      ctx.lineTo(cx, cy + R + 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,200,200,0.5)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [
        ['00', 0],
        ['06', 1],
        ['12', 2],
        ['18', 3],
      ].forEach(([label, q]) => {
        const a = (Number(q) / 4) * Math.PI * 2 - Math.PI / 2;
        ctx.fillText(String(label), cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16));
      });

      // sweep beam with a fading wake
      for (let i = 0; i < 28; i++) {
        const a = sweep - i * 0.02;
        ctx.strokeStyle = `rgba(245,245,245,${(1 - i / 28) * 0.22})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      ctx.stroke();

      // blips flare when the beam passes over them
      const positions: { x: number; y: number; b: (typeof blips)[number] }[] = [];
      const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (const b of blipsRef.current) {
        const diff = norm(sweep - b.angle);
        if (diff < 0.06) b.heat = 1;
        b.heat *= 0.985;
        const r = inner + b.ring * gap;
        const x = cx + Math.cos(b.angle) * r;
        const y = cy + Math.sin(b.angle) * r;
        positions.push({ x, y, b });
        const hot = b.c.priority >= 2;
        const base = hot ? '255,43,43' : b.c.priority === 1 ? '47,123,255' : '240,240,240';
        const s = 2 + b.c.priority * 0.8;
        ctx.fillStyle = `rgba(${base},${0.25 + b.heat * 0.75})`;
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
        if (b.heat > 0.4) {
          ctx.strokeStyle = `rgba(${base},${b.heat * 0.6})`;
          ctx.strokeRect(x - s - 4 * b.heat, y - s - 4 * b.heat, (s + 4 * b.heat) * 2, (s + 4 * b.heat) * 2);
        }
      }

      // core: today's completion %
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, cy, inner - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = progRef.current >= 1 ? '#ff2b2b' : '#f5f5f5';
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillText(`${Math.round(progRef.current * 100)}%`, cx, cy);

      let found: (typeof positions)[number] | null = null;
      if (mouse) {
        let best = 12;
        for (const pos of positions) {
          const d = Math.hypot(pos.x - mouse.x, pos.y - mouse.y);
          if (d < best) {
            best = d;
            found = pos;
          }
        }
      }
      const c = found?.b.c ?? null;
      if (c !== lastTip) {
        lastTip = c;
        setTip(found ? { x: found.x, y: found.y, c: found.b.c, ring: found.b.ring } : null);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="radar" ref={wrap}>
      <canvas ref={cv} />
      {tip && (
        <div className="radar-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="bright">TARGET: {tip.c.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)}</div>
          <div className="dim">
            {tip.ring === 0 ? 'today' : `T-${tip.ring}d`} · {formatTime(tip.c.at)} · +{tip.c.xp}xp
          </div>
        </div>
      )}
      {completions.length === 0 && <div className="radar-empty dim">no contacts. neutralize a target to light up the scope.</div>}
    </div>
  );
}

export function ReconSection({ reduce }: { reduce: boolean }) {
  const completions = useStore((s) => s.completions);
  const tasks = useStore((s) => s.tasks);
  const xp = useStore((s) => s.xp);
  const root = useRef<HTMLElement>(null);
  const lvl = levelInfo(xp);
  const prog = todayProgress(tasks);
  const st = streak(completions);
  const best = useMemo(() => bestStreak(completions), [completions]);
  const counts = useMemo(() => countByDay(completions), [completions]);

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => startOfDay() - (6 - i) * DAY);
    const vals = days.map((d) => counts.get(dayKey(d)) ?? 0);
    const max = Math.max(1, ...vals);
    const rows = 6;
    const lines: string[] = [];
    for (let r = rows; r >= 1; r--) lines.push(vals.map((v) => (v / max) * rows >= r ? ' ███ ' : (v / max) * rows >= r - 0.5 ? ' ▄▄▄ ' : '     ').join(''));
    lines.push(days.map((d) => `  ${new Date(d).toLocaleDateString([], { weekday: 'narrow' })}  `).join(''));
    lines.push(vals.map((v) => `  ${String(v).padEnd(3)}`).join(''));
    return lines.join('\n');
  }, [counts]);

  const heat = useMemo(() => {
    const weeks = 18;
    const today = startOfDay();
    const start = today - (weeks * 7 - 1 - (6 - new Date(today).getDay())) * DAY;
    const max = Math.max(1, ...counts.values());
    const cells: { ch: string; cls: string; title: string }[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < weeks * 7; i++) {
      const t = start + i * DAY;
      const n = counts.get(dayKey(t)) ?? 0;
      const v = n / max;
      const ch = t > today ? ' ' : n === 0 ? '·' : v < 0.34 ? '░' : v < 0.67 ? '▒' : v < 1 ? '▓' : '█';
      cells[i % 7].push({ ch, cls: t === today ? 'red' : '', title: `${new Date(t).toLocaleDateString()}: ${n}` });
    }
    return cells;
  }, [counts]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of completions) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [completions]);

  useGSAP(
    () => {
      if (reduce) return;
      gsap.from('.meter', { opacity: 0, x: -24, stagger: 0.08, duration: 0.4, scrollTrigger: { trigger: '.htop', start: 'top 85%', once: true } });
      gsap.utils.toArray<HTMLElement>('.count-up').forEach((el) => {
        const end = Number(el.dataset.value ?? 0);
        const o = { v: 0 };
        gsap.to(o, {
          v: end,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: () => (el.textContent = String(Math.round(o.v))),
        });
      });
      gsap.from('.r-block', { opacity: 0, y: 24, stagger: 0.12, duration: 0.5, scrollTrigger: { trigger: '.r-grid', start: 'top 80%', once: true } });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section className="sec" id="sec-recon" ref={root}>
      <SectionHead index="03" title="RECON" path="~/recon" cmd={`htop --user ${'operator'} && radar --scan 14d`} reduce={reduce} />
      <div className="r-grid">
        <div className="r-left">
          <pre className="htop r-block">
            <div className="meter">
              <span className="bright">LVL</span> [<span className="m-fill">{bar(lvl.progress)}</span>] {lvl.into}/{lvl.needed}xp
            </div>
            <div className="meter">
              <span className="bright">OPS</span> [<span className={`m-fill${prog.ratio >= 1 ? ' red' : ''}`}>{bar(prog.ratio)}</span>] {prog.done}/{prog.total} today
            </div>
            <div className="meter">
              <span className="bright">RNK</span> {`lvl ${lvl.level}`.padEnd(7)} <span className="red">{lvl.title.toUpperCase()}</span>
            </div>
            <div className="meter stats-line">
              STREAK <b className="count-up" data-value={st}>{st}</b>d · BEST <b className="count-up" data-value={best}>{best}</b>d · KILLS{' '}
              <b className="count-up" data-value={completions.length}>{completions.length}</b> · XP <b className="count-up" data-value={xp}>{xp}</b>
            </div>
          </pre>

          <div className="r-block">
            <div className="r-label">
              <span className="pr">$</span> chart --last 7d
            </div>
            <pre className="week">{week}</pre>
          </div>

          <div className="r-block">
            <div className="r-label">
              <span className="pr">$</span> heatmap --weeks 18
            </div>
            <pre className="heat">
              {heat.map((row, r) => (
                <div key={r}>
                  {row.map((c, i) => (
                    <span key={i} className={c.cls} title={c.title}>
                      {c.ch}
                    </span>
                  ))}
                </div>
              ))}
            </pre>
          </div>

          {tags.length > 0 && (
            <div className="r-block">
              <div className="r-label">
                <span className="pr">$</span> du -sh --by-tag
              </div>
              <pre className="du">
                {tags.map(([t, n]) => (
                  <div key={t}>
                    <span className="bright">{String(n).padStart(4)}</span> <span className="m-fill">{'█'.repeat(Math.max(1, Math.round((n / tags[0][1]) * 24)))}</span> #{t}
                  </div>
                ))}
              </pre>
            </div>
          )}
        </div>
        <div className="r-right r-block">
          <div className="r-label">
            <span className="pr">$</span> radar --scan 14d <span className="dim">· rings = days · angle = time · ■ red = high priority</span>
          </div>
          <Radar completions={completions} progress={prog.ratio} />
        </div>
      </div>
    </section>
  );
}
