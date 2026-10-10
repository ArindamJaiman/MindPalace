import { useEffect, useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { useStore } from '../../store/store';
import { useSync } from '../../sync/sync';
import { isDueToday } from '../../lib/tasks';
import { levelInfo } from '../../lib/xp';
import { goToEdition } from '../../editions';
import { sfx } from '../../lib/sound';
import { jumpTo } from '../commands';
import { SECTIONS, useTerm } from '../state';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tb-clock">{now.toLocaleTimeString([], { hour12: false })}</span>;
}

/** Kali-style top panel: workspaces = sections, plus status and the edition switch. */
export function TopBar() {
  const section = useTerm((s) => s.section);
  const tasks = useStore((s) => s.tasks);
  const xp = useStore((s) => s.xp);
  const sound = useStore((s) => s.settings.sound);
  const setSettings = useStore((s) => s.setSettings);
  const { status } = useSync();
  const due = tasks.filter((t) => !t.done && isDueToday(t)).length;
  const lvl = levelInfo(xp);
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.to(bar.current, { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });
  });

  const syncLabel =
    status === 'synced' ? 'SYNC' : status === 'syncing' ? 'SYNC…' : status === 'error' ? 'SYNC ERR' : status === 'offline' ? 'OFFLINE' : 'LOCAL';

  return (
    <header className="topbar">
      <button className="tb-brand" onClick={() => jumpTo('boot')} data-cursor="HOME">
        <span className="tb-logo">▣</span> MINDPALACE<span className="dim">//term</span>
      </button>
      <nav className="tb-ws">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            className={`ws${section === s.id ? ' on' : ''}`}
            onClick={() => {
              sfx.key();
              jumpTo(s.id);
            }}
            title={`Alt+${i + 1}`}
          >
            <span className="ws-n">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>
      <div className="tb-status">
        <span className={`tb-chip ${status === 'synced' ? 'blue' : status === 'error' ? 'red' : 'dim'}`}>● {syncLabel}</span>
        <span className={`tb-chip${due ? ' red' : ' dim'}`}>▲ {due} DUE</span>
        <span className="tb-chip">LV{lvl.level}</span>
        <button className="tb-chip tb-btn" onClick={() => setSettings({ sound: !sound })} title="toggle audio">
          {sound ? '♪ ON' : '♪ OFF'}
        </button>
        <Clock />
        <button className="tb-switch" data-cursor="EXIT" onClick={() => void goToEdition('forge')} title="Switch to the Forge edition">
          ⇄ forge
        </button>
      </div>
      <div className="tb-progress" ref={bar} />
    </header>
  );
}
