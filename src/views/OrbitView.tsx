import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, Flame, Sparkles, Trophy, Zap } from 'lucide-react';
import { useStore } from '../store/store';
import type { Completion } from '../store/types';
import { DAY, dayKey, daysAgo, formatTime, startOfDay } from '../lib/dates';
import { countByDay, levelInfo, streak } from '../lib/xp';
import { hueFor } from '../lib/links';
import { todayProgress } from '../lib/tasks';

const RINGS = 14;

interface Planet {
  c: Completion;
  ring: number;
  angle: number;
  size: number;
  hue: number;
  phase: number;
  delay: number;
}

function bestStreak(completions: Completion[]): number {
  const days = [...new Set(completions.map((c) => startOfDay(c.at)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && Math.round((days[i] - days[i - 1]) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function OrbitCanvas({ completions, progress, accent }: { completions: Completion[]; progress: number; accent: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; p: Planet } | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const planets = useMemo<Planet[]>(() => {
    const list = completions
      .map((c) => ({ c, ring: daysAgo(c.at) }))
      .filter((x) => x.ring >= 0 && x.ring < RINGS)
      .sort((a, b) => b.ring - a.ring || a.c.at - b.c.at);
    return list.map(({ c, ring }, i) => {
      const d = new Date(c.at);
      const minutes = d.getHours() * 60 + d.getMinutes();
      return {
        c,
        ring,
        angle: (minutes / 1440) * Math.PI * 2 - Math.PI / 2,
        size: 2.6 + c.priority * 1.1,
        hue: c.tags[0] ? hueFor(c.tags[0]) : -1,
        phase: Math.random() * Math.PI * 2,
        delay: 300 + i * Math.max(18, 900 / Math.max(1, list.length)),
      };
    });
  }, [completions]);

  const planetsRef = useRef(planets);
  planetsRef.current = planets;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars: { x: number; y: number; r: number; tw: number }[] = [];
    const ro = new ResizeObserver(() => {
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      stars = Array.from({ length: Math.round((w * h) / 4500) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        tw: Math.random() * Math.PI * 2,
      }));
    });
    ro.observe(wrap);

    const start = performance.now();
    let mouse: { x: number; y: number } | null = null;
    const positions: { x: number; y: number; p: Planet }[] = [];

    const geometry = () => {
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) / 2 - 36;
      const sunR = Math.max(18, maxR * 0.11);
      const inner = sunR + 26;
      const gap = (maxR - inner) / (RINGS - 1);
      return { cx, cy, maxR, sunR, inner, gap };
    };

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
    let lastTip: Planet | null = null;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!w || !h) return;
      const t = now - start;
      const { cx, cy, maxR, sunR, inner, gap } = geometry();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // starfield
      for (const s of stars) {
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.0012 + s.tw));
        ctx.fillStyle = '#cfd2ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // rings
      for (let i = 0; i < RINGS; i++) {
        const r = inner + i * gap;
        ctx.strokeStyle = i === 0 ? `${accent}8c` : `rgba(180,180,255,${0.11 - i * 0.005})`;
        ctx.lineWidth = i === 0 ? 1.4 : 1;
        ctx.setLineDash(i === 0 ? [] : [2, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // hour ticks + labels around the outside
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let hr = 0; hr < 24; hr++) {
        const a = (hr / 24) * Math.PI * 2 - Math.PI / 2;
        const major = hr % 6 === 0;
        const r1 = maxR + 6;
        const r2 = maxR + (major ? 14 : 10);
        ctx.strokeStyle = major ? 'rgba(220,220,255,0.45)' : 'rgba(220,220,255,0.15)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
        if (major) {
          ctx.fillStyle = 'rgba(220,220,255,0.55)';
          const label = hr === 0 ? '00' : hr === 6 ? '06' : hr === 12 ? '12' : '18';
          ctx.fillText(label, cx + Math.cos(a) * (maxR + 26), cy + Math.sin(a) * (maxR + 26));
        }
      }

      // the "now" hand sweeping today's ring and beyond
      const nowD = new Date();
      const nowA = ((nowD.getHours() * 60 + nowD.getMinutes() + nowD.getSeconds() / 60) / 1440) * Math.PI * 2 - Math.PI / 2;
      const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(nowA) * maxR, cy + Math.sin(nowA) * maxR);
      grad.addColorStop(0, 'rgba(255,200,87,0.0)');
      grad.addColorStop(1, 'rgba(255,200,87,0.55)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(nowA) * sunR, cy + Math.sin(nowA) * sunR);
      ctx.lineTo(cx + Math.cos(nowA) * (maxR + 4), cy + Math.sin(nowA) * (maxR + 4));
      ctx.stroke();
      ctx.fillStyle = '#ffc857';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(nowA) * (maxR + 4), cy + Math.sin(nowA) * (maxR + 4), 3, 0, Math.PI * 2);
      ctx.fill();

      // sun: grows and brightens with today's progress
      const prog = progressRef.current;
      const pulse = 1 + Math.sin(t * 0.003) * 0.04;
      const sr = sunR * (0.75 + prog * 0.35) * pulse;
      const corona = ctx.createRadialGradient(cx, cy, sr * 0.4, cx, cy, sr * (2.6 + prog));
      corona.addColorStop(0, `rgba(255,214,120,${0.55 + prog * 0.3})`);
      corona.addColorStop(0.35, `rgba(255,140,90,${0.18 + prog * 0.15})`);
      corona.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(cx, cy, sr * (2.6 + prog), 0, Math.PI * 2);
      ctx.fill();
      // rotating rays
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.00015);
      ctx.strokeStyle = `rgba(255,220,140,${0.12 + prog * 0.25})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const len = sr * (1.5 + 0.25 * Math.sin(t * 0.002 + i));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * sr * 1.1, Math.sin(a) * sr * 1.1);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
      const core = ctx.createRadialGradient(cx - sr * 0.3, cy - sr * 0.3, sr * 0.1, cx, cy, sr);
      core.addColorStop(0, '#fff6d8');
      core.addColorStop(0.5, '#ffc857');
      core.addColorStop(1, '#ff8a5c');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, sr, 0, Math.PI * 2);
      ctx.fill();

      // planets
      positions.length = 0;
      ctx.globalCompositeOperation = 'lighter';
      for (const p of planetsRef.current) {
        const local = t - p.delay;
        if (local < 0) continue;
        const e = Math.min(1, local / 900);
        const ease = 1 - Math.pow(1 - e, 4);
        const targetR = inner + p.ring * gap;
        const wobble = Math.sin(t * 0.0009 + p.phase) * 0.012;
        const a = p.angle + wobble - (1 - ease) * 1.2;
        const r = sunR + (targetR - sunR) * ease;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        positions.push({ x, y, p });
        const color = p.hue < 0 ? accent : `hsl(${p.hue} 90% 66%)`;
        const isTip = lastTip === p;
        const size = p.size * (isTip ? 1.8 : 1) * (0.5 + ease * 0.5);
        // trail while launching
        if (ease < 1) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.35 * (1 - ease);
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a - 0.4 * (1 - ease), a);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // ring labels for today / yesterday
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('today', cx + 4, cy - inner - 7);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(`${RINGS} days ago`, cx + 4, cy - (inner + (RINGS - 1) * gap) - 7);

      // hover
      let found: { x: number; y: number; p: Planet } | null = null;
      if (mouse) {
        let best = 14;
        for (const pos of positions) {
          const d = Math.hypot(pos.x - mouse.x, pos.y - mouse.y);
          if (d < best) {
            best = d;
            found = pos;
          }
        }
      }
      if ((found?.p ?? null) !== lastTip) {
        lastTip = found?.p ?? null;
        setTip(found);
        canvas.style.cursor = found ? 'pointer' : 'default';
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [accent]);

  return (
    <div ref={wrapRef} className="orbit-canvas">
      <canvas ref={canvasRef} />
      {tip && (
        <div className="orbit-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="orbit-tip-title">{tip.p.c.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)}</div>
          <div className="orbit-tip-meta">
            {tip.p.ring === 0 ? 'Today' : tip.p.ring === 1 ? 'Yesterday' : `${tip.p.ring} days ago`} · {formatTime(tip.p.c.at)} · +{tip.p.c.xp} XP
          </div>
        </div>
      )}
    </div>
  );
}

function HeatGrid({ completions }: { completions: Completion[] }) {
  const weeks = 18;
  const counts = useMemo(() => countByDay(completions), [completions]);
  const today = startOfDay();
  const start = today - (weeks * 7 - 1 - (6 - new Date(today).getDay())) * DAY;
  const max = Math.max(1, ...counts.values());
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const t = start + i * DAY;
    const n = counts.get(dayKey(t)) ?? 0;
    const future = t > today;
    cells.push(
      <motion.span
        key={i}
        className={`heat-cell${future ? ' future' : ''}${t === today ? ' today' : ''}`}
        title={future ? '' : `${new Date(t).toLocaleDateString()}: ${n} done`}
        style={{ '--v': future ? 0 : n / max } as React.CSSProperties}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: i * 0.003, type: 'spring', stiffness: 500, damping: 20 }}
      />,
    );
  }
  return <div className="heat-grid">{cells}</div>;
}

function WeekBars({ completions }: { completions: Completion[] }) {
  const counts = useMemo(() => countByDay(completions), [completions]);
  const days = Array.from({ length: 7 }, (_, i) => startOfDay() - (6 - i) * DAY);
  const values = days.map((d) => counts.get(dayKey(d)) ?? 0);
  const max = Math.max(1, ...values);
  return (
    <div className="week-bars">
      {days.map((d, i) => (
        <div key={d} className="week-bar">
          <div className="week-bar-track">
            <motion.div
              className="week-bar-fill"
              initial={{ height: 0 }}
              animate={{ height: `${(values[i] / max) * 100}%` }}
              transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 120, damping: 14 }}
            />
            {values[i] > 0 && <span className="week-bar-n">{values[i]}</span>}
          </div>
          <span className={`week-bar-day${i === 6 ? ' today' : ''}`}>{new Date(d).toLocaleDateString([], { weekday: 'narrow' })}</span>
        </div>
      ))}
    </div>
  );
}

export function OrbitView() {
  const completions = useStore((s) => s.completions);
  const tasks = useStore((s) => s.tasks);
  const xp = useStore((s) => s.xp);
  const accent = useStore((s) => s.settings.accent);
  const lvl = levelInfo(xp);
  const st = streak(completions);
  const best = useMemo(() => bestStreak(completions), [completions]);
  const progress = todayProgress(tasks);
  const counts = useMemo(() => countByDay(completions), [completions]);
  const bestDay = Math.max(0, ...counts.values());
  const topTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of completions) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [completions]);

  return (
    <div className="view orbit-view">
      <div className="orbit-stage">
        <div className="orbit-head">
          <h1>Orbit</h1>
          <p>Every finished task becomes a planet. Rings are days (today is closest to the sun), and position is the time you finished it. The sun grows as you clear today.</p>
        </div>
        <OrbitCanvas completions={completions} progress={progress.ratio} accent={accent} />
        {completions.length === 0 && (
          <div className="orbit-empty">
            <Sparkles size={18} /> Complete a task to launch your first planet.
          </div>
        )}
      </div>

      <aside className="orbit-side">
        <motion.div className="stat-card level-card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="level-badge">
            <Trophy size={18} />
            <span>{lvl.level}</span>
          </div>
          <div className="level-text">
            <div className="level-title">{lvl.title}</div>
            <div className="level-sub">{xp.toLocaleString()} XP total</div>
          </div>
          <div className="xp-bar big">
            <motion.div className="xp-fill" initial={{ width: 0 }} animate={{ width: `${lvl.progress * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} />
            <span className="xp-text">
              {lvl.into} / {lvl.needed} XP to level {lvl.level + 1}
            </span>
          </div>
        </motion.div>

        <div className="stat-row">
          <motion.div className="stat-card mini" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Flame size={20} className={st ? 'flame-on' : ''} />
            <div className="mini-value">{st}</div>
            <div className="mini-label">day streak</div>
          </motion.div>
          <motion.div className="stat-card mini" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Award size={20} className="gold" />
            <div className="mini-value">{best}</div>
            <div className="mini-label">best streak</div>
          </motion.div>
          <motion.div className="stat-card mini" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Zap size={20} className="teal" />
            <div className="mini-value">{completions.length}</div>
            <div className="mini-label">tasks done</div>
          </motion.div>
        </div>

        <div className="stat-card">
          <div className="card-title">This week</div>
          <WeekBars completions={completions} />
        </div>

        <div className="stat-card">
          <div className="card-title">
            Last 18 weeks <span className="card-sub">best day: {bestDay}</span>
          </div>
          <HeatGrid completions={completions} />
        </div>

        {topTags.length > 0 && (
          <div className="stat-card">
            <div className="card-title">Where your energy goes</div>
            {topTags.map(([tag, n]) => (
              <div key={tag} className="tag-bar">
                <span className="tag-bar-label" style={{ color: `hsl(${hueFor(tag)} 85% 70%)` }}>
                  #{tag}
                </span>
                <div className="tag-bar-track">
                  <motion.div
                    className="tag-bar-fill"
                    style={{ background: `hsl(${hueFor(tag)} 85% 62%)` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / topTags[0][1]) * 100}%` }}
                  />
                </div>
                <span className="tag-bar-n">{n}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
