import { useMemo, useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { useStore } from '../../store/store';
import { formatDue } from '../../lib/dates';
import { notificationPermission, notify, requestNotificationPermission } from '../../lib/notify';
import { pid } from '../state';
import { sfx } from '../../lib/sound';

const stamp = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function LogsSection({ reduce }: { reduce: boolean }) {
  const notifications = useStore((s) => s.notifications);
  const completions = useStore((s) => s.completions);
  const tasks = useStore((s) => s.tasks);
  const clear = useStore((s) => s.clearNotifications);
  const notifyOn = useStore((s) => s.settings.notifications);
  const setSettings = useStore((s) => s.setSettings);
  const [perm, setPerm] = useState(notificationPermission());
  const root = useRef<HTMLElement>(null);

  // One merged log: notifications plus every completion, newest last like a real tail.
  const log = useMemo(() => {
    const lines = [
      ...notifications.map((n) => ({ at: n.at, kind: n.kind === 'reminder' ? 'ALERT' : n.kind === 'achievement' ? 'RANK' : 'INFO', text: `${n.title}${n.body ? ` :: ${n.body}` : ''}` })),
      ...completions.map((c) => ({ at: c.at, kind: 'KILL', text: `${c.title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => b ?? a)} (+${c.xp}xp)` })),
    ];
    return lines.sort((a, b) => a.at - b.at).slice(-40);
  }, [notifications, completions]);

  const queue = useMemo(
    () =>
      tasks
        .filter((t) => !t.done && t.remindAt && t.remindAt > Date.now())
        .sort((a, b) => a.remindAt! - b.remindAt!)
        .slice(0, 8),
    [tasks],
  );

  useGSAP(
    () => {
      if (reduce) return;
      gsap.from('.log-line', { opacity: 0, duration: 0.05, stagger: 0.025, scrollTrigger: { trigger: '.log', start: 'top 85%', once: true } });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section className="sec" id="sec-logs" ref={root}>
      <SectionHead index="05" title="LOGS" path="/var/log" cmd="tail -f /var/log/palace.log" reduce={reduce} />
      <pre className="log">
        {log.length === 0 && <div className="dim">-- no entries yet --</div>}
        {log.map((l, i) => (
          <div key={i} className="log-line">
            <span className="dim">[{stamp(l.at)}]</span> <span className={`lk lk-${l.kind.toLowerCase()}`}>{l.kind.padEnd(5)}</span> {l.text}
          </div>
        ))}
        <div className="log-line">
          <span className="blink">█</span>
        </div>
      </pre>

      <div className="r-label">
        <span className="pr">$</span> atq <span className="dim">· scheduled reminders</span>
      </div>
      <pre className="log">
        {queue.length === 0 && <div className="dim">no jobs queued. add a time to a task (e.g. "at 5pm") to schedule one.</div>}
        {queue.map((t) => (
          <div key={t.id}>
            <span className="dim">{pid(t.id)}</span> <span className="blue">{formatDue(t.remindAt!).padEnd(22)}</span> {t.title}
          </div>
        ))}
      </pre>

      <div className="log-tools">
        {perm === 'granted' ? (
          <button
            className={`t-btn${notifyOn ? ' on' : ''}`}
            onClick={() => {
              setSettings({ notifications: !notifyOn });
              sfx.key();
            }}
          >
            [{notifyOn ? 'x' : ' '}] desktop alerts
          </button>
        ) : (
          <button
            className="t-btn"
            disabled={perm === 'unsupported' || perm === 'denied'}
            onClick={async () => setPerm(await requestNotificationPermission())}
            data-cursor="GRANT"
          >
            {perm === 'denied' ? '[ alerts blocked by browser ]' : '[ sudo enable-alerts ]'}
          </button>
        )}
        <button
          className="t-btn"
          onClick={() => notify({ kind: 'info', toastKind: 'reminder', title: '⏲ test alert', body: 'reminder pipeline nominal.', link: '/terminal/#logs' })}
        >
          [ send test alert ]
        </button>
        {notifications.length > 0 && (
          <button className="t-btn red" onClick={clear}>
            [ truncate log ]
          </button>
        )}
      </div>
    </section>
  );
}
