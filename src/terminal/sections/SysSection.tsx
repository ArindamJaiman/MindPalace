import { useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { useStore } from '../../store/store';
import { toast } from '../../store/ui';
import { useSync, sendMagicLink, signOut, syncNow } from '../../sync/sync';
import { supabase } from '../../sync/supabase';
import { relativeTime } from '../../lib/dates';
import { downloadBlob, pickFiles } from '../../lib/files';
import { goToEdition } from '../../editions';
import { sfx } from '../../lib/sound';

function Check({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`t-check${on ? ' on' : ''}`}
      onClick={() => {
        onChange(!on);
        sfx.key();
      }}
    >
      [{on ? 'x' : ' '}] {label}
    </button>
  );
}

export function SysSection({ reduce }: { reduce: boolean }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [armed, setArmed] = useState(false);
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (reduce) return;
      gsap.from('.sys-block', { opacity: 0, y: 20, stagger: 0.1, duration: 0.45, scrollTrigger: { trigger: '.sys-grid', start: 'top 85%', once: true } });
    },
    { scope: root, dependencies: [] },
  );

  const active = sync.status === 'synced' || sync.status === 'syncing';
  const vol = Math.round(settings.volume * 10);

  return (
    <section className="sec" id="sec-sys" ref={root}>
      <SectionHead index="06" title="SYS" path="/etc/palace" cmd="systemctl status palace-sync" reduce={reduce} />
      <div className="sys-grid">
        <div className="sys-block">
          <div className="r-label">
            <span className="pr">$</span> systemctl status palace-sync
          </div>
          <pre className="log">
            <span className={active ? 'blue' : sync.status === 'error' ? 'red' : 'dim'}>●</span> palace-sync.service - MindPalace cloud sync{'\n'}
            {'     '}Loaded: {supabase ? 'loaded (supabase)' : 'not configured'}{'\n'}
            {'     '}Active:{' '}
            {active ? <span className="blue">active (running)</span> : sync.status === 'error' ? <span className="red">failed</span> : <span className="dim">inactive (dead)</span>}
            {sync.lastSyncedAt ? ` since ${relativeTime(sync.lastSyncedAt)}` : ''}
            {'\n'}
            {'       '}User: {sync.email ?? '-'}
            {sync.error && sync.status === 'error' ? `\n      Error: ${sync.error}` : ''}
          </pre>
          {supabase &&
            (sync.email ? (
              <div className="log-tools">
                <button className="t-btn" onClick={() => void syncNow()}>
                  [ sync --now ]
                </button>
                <button className="t-btn red" onClick={() => void signOut()}>
                  [ logout ]
                </button>
              </div>
            ) : sent ? (
              <div className="bright">magic link dispatched to {email}. open it in this browser.</div>
            ) : (
              <form
                className="login"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await sendMagicLink(email.trim());
                    setSent(true);
                    sfx.granted(2);
                  } catch (err) {
                    sfx.denied();
                    toast({ kind: 'error', title: 'login failed', body: err instanceof Error ? err.message : String(err) });
                  }
                }}
              >
                <span className="pr">login:</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                <button className="t-btn">[ send magic link ]</button>
              </form>
            ))}
        </div>

        <div className="sys-block">
          <div className="r-label">
            <span className="pr">$</span> cat /etc/palace/config
          </div>
          <label className="kv">
            <span>whoami</span>
            <input value={settings.name} onChange={(e) => setSettings({ name: e.target.value })} placeholder="operator" spellCheck={false} />
          </label>
          <div className="sys-checks">
            <Check on={settings.sound} label="audio" onChange={(v) => setSettings({ sound: v })} />
            <Check on={settings.termRain} label="code rain" onChange={(v) => setSettings({ termRain: v })} />
            <Check on={settings.termTrail} label="cursor trail" onChange={(v) => setSettings({ termTrail: v })} />
            <Check on={settings.reduceMotion} label="reduce motion" onChange={(v) => setSettings({ reduceMotion: v })} />
          </div>
          <div className="kv">
            <span>volume</span>
            <div className="kv-row">
              <button className="t-btn" onClick={() => setSettings({ volume: Math.max(0, (vol - 1) / 10) })}>
                [-]
              </button>
              <span className="m-fill">{'='.repeat(vol)}</span>
              <span className="dim">{'-'.repeat(10 - vol)}</span>
              <button
                className="t-btn"
                onClick={() => {
                  setSettings({ volume: Math.min(1, (vol + 1) / 10) });
                  sfx.granted(3);
                }}
              >
                [+]
              </button>
            </div>
          </div>
        </div>

        <div className="sys-block">
          <div className="r-label">
            <span className="pr">$</span> tar / dd
          </div>
          <div className="log-tools">
            <button
              className="t-btn"
              onClick={() => {
                const data = useStore.getState().exportData();
                downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `mindpalace-${new Date().toISOString().slice(0, 10)}.json`);
              }}
            >
              [ tar -czf backup.json ]
            </button>
            <button
              className="t-btn"
              onClick={async () => {
                const [file] = await pickFiles({ accept: '.json,application/json', multiple: false });
                if (!file) return;
                try {
                  const data = JSON.parse(await file.text());
                  if (!data || !('notes' in data) || !('tasks' in data)) throw new Error('bad');
                  useStore.getState().importData(data);
                  toast({ kind: 'success', title: 'backup restored' });
                } catch {
                  toast({ kind: 'error', title: 'tar: not a MindPalace backup' });
                }
              }}
            >
              [ tar -xzf backup.json ]
            </button>
            <button
              className={`t-btn red${armed ? ' armed' : ''}`}
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  setTimeout(() => setArmed(false), 3000);
                  return;
                }
                useStore.getState().resetAll();
                setArmed(false);
                void syncNow();
                toast({ kind: 'info', title: 'dd if=/dev/zero: device wiped' });
              }}
            >
              {armed ? '[ confirm wipe ]' : '[ dd if=/dev/zero ]'}
            </button>
          </div>
        </div>

        <div className="sys-block edition">
          <div className="r-label">
            <span className="pr">$</span> switch-edition
          </div>
          <div className="dim">same tasks, notes and xp. different world.</div>
          <div className="log-tools">
            <button className="t-btn big" data-cursor="EXIT" onClick={() => void goToEdition('forge')}>
              [ exit → FORGE ]
            </button>
            <button className="t-btn" data-cursor="EXIT" onClick={() => void goToEdition('gateway')}>
              [ gateway ]
            </button>
          </div>
        </div>
      </div>
      <pre className="eof dim">{'\n'}-- EOF -- logout to leave the terminal · palace-sh 1.0</pre>
    </section>
  );
}
