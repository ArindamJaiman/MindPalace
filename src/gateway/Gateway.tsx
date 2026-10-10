import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../store/store';
import { EDITIONS, goToEdition, lastEdition, type Edition } from '../editions';
import { todayProgress } from '../lib/tasks';
import { levelInfo, streak } from '../lib/xp';
import { isDueToday, sortTasks } from '../lib/tasks';

gsap.registerPlugin(useGSAP);

function useStats() {
  const tasks = useStore((s) => s.tasks);
  const completions = useStore((s) => s.completions);
  const xp = useStore((s) => s.xp);
  const notes = useStore((s) => s.notes);
  return useMemo(() => {
    const p = todayProgress(tasks);
    const lvl = levelInfo(xp);
    return {
      progress: p,
      level: lvl,
      streak: streak(completions),
      notes: Object.keys(notes).length,
      today: tasks.filter((t) => !t.done && isDueToday(t)).sort(sortTasks).slice(0, 4),
    };
  }, [tasks, completions, xp, notes]);
}

/** Tiny ember field for the Forge panel. */
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = c.width = c.clientWidth;
      h = c.height = c.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const ps = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: 0.0006 + Math.random() * 0.0014, s: Math.random() * 2 + 0.6, f: Math.random() * 6 }));
    let raf = 0;
    let t = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t++;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        p.y -= p.v;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        const life = p.y;
        const a = 0.25 + 0.5 * Math.sin(t * 0.05 + p.f) ** 2;
        ctx.fillStyle = life > 0.6 ? `rgba(255,${120 + life * 100},40,${a})` : `rgba(255,${80 + life * 60},20,${a * life * 1.6})`;
        ctx.beginPath();
        ctx.arc(p.x * w + Math.sin(t * 0.02 + p.f) * 6, p.y * h, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="gw-embers" aria-hidden />;
}

/** Monochrome code rain for the Terminal panel. */
function Rain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const size = 14;
    let cols: number[] = [];
    let w = 0;
    let h = 0;
    const resize = () => {
      w = c.width = c.clientWidth;
      h = c.height = c.clientHeight;
      cols = Array.from({ length: Math.ceil(w / size) }, () => Math.random() * -50);
    };
    resize();
    window.addEventListener('resize', resize);
    const chars = '01アカサタナ#$%&<>/\\|{}[]=+*ABCDEF';
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 50) return;
      last = now;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px "JetBrains Mono", monospace`;
      cols.forEach((y, i) => {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const r = Math.random();
        ctx.fillStyle = r > 0.985 ? '#ff2b2b' : r > 0.97 ? '#3b82f6' : `rgba(220,220,220,${0.25 + Math.random() * 0.35})`;
        ctx.fillText(ch, i * size, y * size);
        cols[i] = y * size > h && Math.random() > 0.97 ? 0 : y + 1;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="gw-rain" aria-hidden />;
}

export function Gateway() {
  const hydrated = useStore((s) => s.hydrated);
  const name = useStore((s) => s.settings.name);
  const stats = useStats();
  const [last] = useState(lastEdition);
  const [hover, setHover] = useState<Edition | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);

  const { contextSafe } = useGSAP(
    () => {
      const tl = gsap.timeline();
      tl.from('.gw-panel', { yPercent: (i) => (i ? 100 : -100), duration: 0.9, ease: 'expo.out', stagger: 0.08 })
        .from('.gw-forge .gw-title', { y: 60, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
        .from('.gw-term .gw-title', { opacity: 0, duration: 0.05, repeat: 5, yoyo: true }, '<')
        .from('.gw-head', { y: -30, opacity: 0, duration: 0.5 }, '<0.1')
        .from('.gw-detail', { opacity: 0, y: 14, stagger: 0.05, duration: 0.4 }, '-=0.3');
    },
    { scope: root },
  );

  const expand = contextSafe((e: Edition | null) => {
    if (leaving.current) return;
    setHover(e);
    gsap.to('.gw-forge', { flexGrow: e === 'forge' ? 1.55 : e ? 0.75 : 1, duration: 0.7, ease: 'expo.out' });
    gsap.to('.gw-term', { flexGrow: e === 'terminal' ? 1.55 : e ? 0.75 : 1, duration: 0.7, ease: 'expo.out' });
  });

  const choose = contextSafe((e: Edition) => {
    if (leaving.current) return;
    leaving.current = true;
    const keep = e === 'forge' ? '.gw-forge' : '.gw-term';
    const drop = e === 'forge' ? '.gw-term' : '.gw-forge';
    gsap
      .timeline({ onComplete: () => void goToEdition(e) })
      .to(drop, { flexGrow: 0.0001, opacity: 0, duration: 0.55, ease: 'expo.inOut' }, 0)
      .to(keep, { flexGrow: 1, duration: 0.55, ease: 'expo.inOut' }, 0)
      .to(`${keep} .gw-inner`, { scale: 1.06, opacity: 0, duration: 0.45, ease: 'power2.in' }, 0.25)
      .to('.gw-head', { opacity: 0, duration: 0.2 }, 0);
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === '1' || ev.key === 'ArrowLeft') expand('forge');
      if (ev.key === '2' || ev.key === 'ArrowRight') expand('terminal');
      if (ev.key === 'Enter') {
        const target = hover ?? last;
        if (target) choose(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover, last, expand, choose]);

  const pct = Math.round(stats.progress.ratio * 100);
  const user = (name || 'operator').toLowerCase().replace(/\s+/g, '');

  return (
    <div className="gw" ref={root}>
      <header className="gw-head">
        <span className="gw-brand">MINDPALACE</span>
        <span className="gw-ask">choose your edition</span>
        <span className="gw-keys">
          <kbd>1</kbd> forge · <kbd>2</kbd> terminal · <kbd>↵</kbd> open
        </span>
      </header>

      <div className="gw-split">
        <section
          className={`gw-panel gw-forge${hover === 'terminal' ? ' dim' : ''}`}
          onMouseEnter={() => expand('forge')}
          onMouseLeave={() => expand(null)}
          onClick={() => choose('forge')}
          role="button"
          tabIndex={0}
          aria-label="Open the Forge edition"
        >
          <Embers />
          <div className="gw-glow" />
          <div className="gw-inner">
            {last === 'forge' && <span className="gw-last">LAST USED</span>}
            <div className="gw-index">01</div>
            <h1 className="gw-title">Forge</h1>
            <p className="gw-tag gw-detail">{EDITIONS.forge.tagline}</p>
            <div className="gw-forge-stats gw-detail">
              <div className="gw-ring" style={{ '--p': pct } as React.CSSProperties}>
                <span>{hydrated && stats.progress.total ? `${pct}%` : '—'}</span>
              </div>
              <ul>
                <li>
                  <b>{stats.progress.total - stats.progress.done}</b> due today
                </li>
                <li>
                  <b>Lv {stats.level.level}</b> {stats.level.title}
                </li>
                <li>
                  <b>{stats.streak}d</b> streak
                </li>
              </ul>
            </div>
            <span className="gw-cta gw-detail">Enter the Forge →</span>
          </div>
        </section>

        <section
          className={`gw-panel gw-term${hover === 'forge' ? ' dim' : ''}`}
          onMouseEnter={() => expand('terminal')}
          onMouseLeave={() => expand(null)}
          onClick={() => choose('terminal')}
          role="button"
          tabIndex={0}
          aria-label="Open the Terminal edition"
        >
          <Rain />
          <div className="gw-scan" />
          <div className="gw-inner">
            {last === 'terminal' && <span className="gw-last">LAST USED</span>}
            <div className="gw-index">02</div>
            <h1 className="gw-title" data-text="TERMINAL">
              TERMINAL
            </h1>
            <p className="gw-tag gw-detail">{EDITIONS.terminal.tagline}</p>
            <pre className="gw-shell gw-detail">
              <span className="b">┌──(</span>
              <span className="r">{user}㉿mindpalace</span>
              <span className="b">)-[</span>~<span className="b">]</span>
              {'\n'}
              <span className="b">└─</span>
              <span className="r">$</span> todo ls --today{'\n'}
              {hydrated &&
                (stats.today.length
                  ? stats.today.map((t) => `  [ ] ${t.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a).slice(0, 38)}\n`).join('')
                  : '  0 targets. system idle.\n')}
              {`  ${stats.notes} notes indexed · rank ${stats.level.title.toUpperCase()}\n`}
              <span className="b">└─</span>
              <span className="r">$</span> <span className="gw-caret">█</span>
            </pre>
            <span className="gw-cta gw-detail">./enter_terminal.sh</span>
          </div>
        </section>
      </div>

      <footer className="gw-foot">Both editions share the same tasks, notes, XP and cloud sync. Switch any time.</footer>
    </div>
  );
}
