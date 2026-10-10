import { useMemo, useRef } from 'react';
import { gsap, useGSAP, SCRAMBLE_CHARS } from '../gsap';
import { blockText, decryptFrames } from '../blockfont';
import { useStore } from '../../store/store';
import { useSync } from '../../sync/sync';
import { isDueToday, isOverdue } from '../../lib/tasks';
import { levelInfo, streak } from '../../lib/xp';
import { userHandle } from '../state';
import { sfx } from '../../lib/sound';

type LogLine = { stamp: string; tag: 'OK' | 'WARN' | 'INFO' | ''; text: string };

function useBootLog(): LogLine[] {
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const tasks = useStore((s) => s.tasks);
  const xp = useStore((s) => s.xp);
  const { status, email } = useSync();
  return useMemo(() => {
    const open = tasks.filter((t) => !t.done);
    const overdue = open.filter((t) => isOverdue(t)).length;
    const lvl = levelInfo(xp);
    const sync =
      status === 'synced' || status === 'syncing'
        ? `cloud link up (${email ?? 'signed in'})`
        : status === 'off'
          ? 'local only'
          : 'cloud link down, running local';
    return [
      { stamp: '    0.000000', tag: '', text: 'palace-kernel 6.10.0-mindpalace #1 SMP PREEMPT_DYNAMIC' },
      { stamp: '    0.004217', tag: '', text: 'Command line: BOOT_IMAGE=/vmlinuz-palace root=/dev/mind ro quiet' },
      { stamp: '    0.120034', tag: 'OK', text: `Mounted /dev/mind on /vault (${Object.keys(notes).length} notes, ${folders.length} dirs)` },
      { stamp: '    0.181145', tag: 'OK', text: `Started palace-taskd.service (${open.length} open, ${open.filter(isDueToday).length} due today)` },
      { stamp: '    0.204480', tag: 'OK', text: `Started palace-xpd.service (lvl ${lvl.level} ${lvl.title.toUpperCase()}, ${xp} xp)` },
      { stamp: '    0.233918', tag: status === 'error' ? 'WARN' : 'OK', text: `Started palace-sync.service: ${sync}` },
      overdue
        ? { stamp: '    0.260001', tag: 'WARN', text: `${overdue} target${overdue > 1 ? 's' : ''} overdue. engage immediately.` }
        : { stamp: '    0.260001', tag: 'OK', text: 'No overdue targets.' },
      { stamp: '    0.301377', tag: 'INFO', text: 'Reached target Focus Mode.' },
    ] as LogLine[];
  }, [notes, folders, tasks, xp, status, email]);
}

export function Hero({ reduce }: { reduce: boolean }) {
  const root = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLPreElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const log = useBootLog();
  const name = useStore((s) => s.settings.name);
  const xp = useStore((s) => s.xp);
  const completions = useStore((s) => s.completions);
  const banner = useMemo(() => blockText('MINDPALACE'), []);
  const lvl = levelInfo(xp);
  const sub = `operator ${userHandle(name)} // rank ${lvl.title.toUpperCase()} // ${xp} xp // streak ${streak(completions)}d`;

  useGSAP(
    () => {
      const pre = bannerRef.current!;
      if (reduce) {
        pre.textContent = banner;
        subRef.current!.textContent = sub;
        return;
      }
      pre.textContent = '';
      const frames = decryptFrames(banner);
      const proxy = { p: 0 };
      // Boot: log lines stream in, then the banner decrypts.
      gsap
        .timeline({ delay: 0.15, onStart: () => sfx.boot() })
        .from('.boot-line', { opacity: 0, x: -8, duration: 0.05, stagger: 0.11, ease: 'none' })
        .to(proxy, { p: 1, duration: 1.3, ease: 'power2.out', onUpdate: () => (pre.textContent = frames(proxy.p)) }, '-=0.3')
        .to(subRef.current, { duration: 0.9, scrambleText: { text: sub, chars: SCRAMBLE_CHARS, speed: 0.7 } }, '-=0.6')
        .from('.hero-cue', { opacity: 0, y: 10, duration: 0.4 });

      // Scroll: pin the hero, split the banner into red/blue channels, flash ACCESS GRANTED.
      gsap
        .timeline({ scrollTrigger: { trigger: root.current, start: 'top top', end: '+=110%', scrub: 0.6, pin: '.hero-pin' } })
        .to('.boot-log', { yPercent: -60, opacity: 0.08, ease: 'none' }, 0)
        .to(pre, { scale: 1.3, '--split': '16px', ease: 'none' }, 0)
        .fromTo('.granted', { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power3.out' }, 0.35)
        .to('.granted', { opacity: 0, duration: 0.2 }, 0.8)
        .to(pre, { opacity: 0, duration: 0.25 }, 0.75)
        .to('.hero-cue, .hero-sub', { opacity: 0, duration: 0.2 }, 0.1);
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section className="sec hero" id="sec-boot" ref={root}>
      <div className="hero-pin">
        <pre className="boot-log">
          {log.map((l, i) => (
            <div key={i} className="boot-line">
              <span className="dim">[{l.stamp}]</span>{' '}
              {l.tag && <span className={`tag-${l.tag.toLowerCase()}`}>[{l.tag === 'OK' ? '  OK  ' : l.tag === 'WARN' ? ' WARN ' : ' INFO '}]</span>} {l.text}
            </div>
          ))}
        </pre>
        <pre className="banner" ref={bannerRef} aria-label="MindPalace" />
        <div className="hero-sub" ref={subRef} />
        <div className="granted" aria-hidden>
          ACCESS GRANTED
        </div>
        <div className="hero-cue">
          <span className="blink">▼</span> scroll to breach <span className="dim">·</span> press <kbd>/</kbd> for shell
        </div>
      </div>
    </section>
  );
}
