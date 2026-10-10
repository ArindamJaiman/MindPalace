import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Database, DoorOpen, Download, MousePointer2, Palette, RotateCcw, Terminal, Upload, User, Volume2 } from 'lucide-react';
import { useStore } from '../store/store';
import { toast } from '../store/ui';
import type { CursorStyle } from '../store/types';
import { notificationPermission, notify, requestNotificationPermission } from '../lib/notify';
import { downloadBlob, pickFiles } from '../lib/files';
import { sfx } from '../lib/sound';
import { fx } from '../lib/fx';
import { AccountSection } from '../sync/AccountSection';
import { syncNow } from '../sync/sync';
import { goToEdition } from '../editions';

const ACCENTS = ['#ff6a1a', '#ff3b30', '#ffb020', '#22d3ee', '#3ddc84', '#8fa3b8', '#a855f7'];
const CURSORS: { id: CursorStyle; label: string; desc: string }[] = [
  { id: 'embers', label: 'Embers', desc: 'Sparks fly off your cursor' },
  { id: 'tracer', label: 'Tracer', desc: 'Hot plasma streak' },
  { id: 'reticle', label: 'Reticle', desc: 'Just the lock-on sight' },
  { id: 'off', label: 'Off', desc: 'Your normal cursor' },
];

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className={`toggle${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        onChange(!on);
        sfx.toggle(!on);
      }}
    >
      <motion.span className="toggle-thumb" layout transition={{ type: 'spring', stiffness: 700, damping: 30 }} />
    </button>
  );
}

function Card({ icon, title, children, delay = 0 }: { icon: React.ReactNode; title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section className="settings-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <h2>
        {icon}
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">{title}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [perm, setPerm] = useState(notificationPermission());
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="view settings-view">
      <div className="settings-inner">
        <h1>Settings</h1>

        <AccountSection />

        <Card icon={<Terminal size={16} />} title="Edition" delay={0.02}>
          <Row title="Terminal edition" desc="Same tasks and notes in a black-screen operator console. Switch back any time.">
            <button className="btn primary" onClick={() => void goToEdition('terminal')}>
              <Terminal size={14} /> Open Terminal
            </button>
          </Row>
          <Row title="Gateway" desc="The chooser at the front door.">
            <button className="btn" onClick={() => void goToEdition('gateway')}>
              <DoorOpen size={14} /> Choose edition
            </button>
          </Row>
        </Card>

        <Card icon={<User size={16} />} title="You" delay={0.03}>
          <Row title="Your name" desc="Used in greetings.">
            <input className="text-input" value={settings.name} placeholder="e.g. Arindam" onChange={(e) => setSettings({ name: e.target.value })} />
          </Row>
        </Card>

        <Card icon={<Palette size={16} />} title="Look & feel" delay={0.06}>
          <Row title="Accent color">
            <div className="swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  className={`swatch${settings.accent === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={(e) => {
                    setSettings({ accent: c });
                    sfx.pop(1.2);
                    fx.burstAt(e.currentTarget, { count: 14, speed: 4, colors: [c] });
                  }}
                  aria-label={`Accent ${c}`}
                />
              ))}
            </div>
          </Row>
          <Row title="Reduce motion" desc="Fewer particles and calmer animations.">
            <Toggle on={settings.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} label="Reduce motion" />
          </Row>
        </Card>

        <Card icon={<MousePointer2 size={16} />} title="Cursor" delay={0.09}>
          <div className="cursor-options">
            {CURSORS.map((c) => (
              <button
                key={c.id}
                className={`cursor-option${settings.cursor === c.id ? ' active' : ''}`}
                onClick={() => {
                  setSettings({ cursor: c.id });
                  sfx.tick();
                }}
              >
                <span className={`cursor-preview cp-${c.id}`}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="cursor-option-label">{c.label}</span>
                <span className="cursor-option-desc">{c.desc}</span>
              </button>
            ))}
          </div>
          <Row title="Lock on to buttons" desc="The reticle snaps its brackets around whatever you hover.">
            <Toggle on={settings.cursorMorph} onChange={(v) => setSettings({ cursorMorph: v })} label="Cursor morph" />
          </Row>
        </Card>

        <Card icon={<Volume2 size={16} />} title="Sound" delay={0.12}>
          <Row title="Sound effects" desc="Pops, chimes and clicks, all generated live.">
            <Toggle on={settings.sound} onChange={(v) => setSettings({ sound: v })} label="Sound" />
          </Row>
          <Row title="Volume">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              className="range"
              onChange={(e) => setSettings({ volume: Number(e.target.value) })}
              onPointerUp={() => sfx.complete(3)}
            />
          </Row>
        </Card>

        <Card icon={<Bell size={16} />} title="Notifications" delay={0.15}>
          <Row
            title="Desktop notifications"
            desc={
              perm === 'unsupported'
                ? 'This browser does not support notifications.'
                : perm === 'denied'
                  ? 'Blocked in your browser settings. Allow them for this site to enable.'
                  : 'Get pinged when a task reminder fires (while MindPalace is open).'
            }
          >
            {perm === 'granted' ? (
              <Toggle on={settings.notifications} onChange={(v) => setSettings({ notifications: v })} label="Notifications" />
            ) : (
              <button
                className="btn primary"
                disabled={perm === 'unsupported' || perm === 'denied'}
                onClick={async () => {
                  const p = await requestNotificationPermission();
                  setPerm(p);
                  if (p === 'granted') toast({ kind: 'success', title: 'Notifications on 🔔' });
                }}
              >
                Enable
              </button>
            )}
          </Row>
          <Row title="Test it" desc="Sends a sample reminder right now.">
            <button
              className="btn"
              onClick={() =>
                notify({ kind: 'info', toastKind: 'reminder', title: '🔔 Test reminder', body: 'This is what a reminder looks like.', link: '/#/tasks' })
              }
            >
              Send test
            </button>
          </Row>
        </Card>

        <Card icon={<Database size={16} />} title="Your data" delay={0.18}>
          <Row title="Export backup" desc="Notes, tasks and progress as one JSON file (attachments not included).">
            <button
              className="btn"
              onClick={() => {
                const data = useStore.getState().exportData();
                downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `mindpalace-${new Date().toISOString().slice(0, 10)}.json`);
                sfx.chime();
              }}
            >
              <Download size={14} /> Export
            </button>
          </Row>
          <Row title="Import backup" desc="Replaces current notes and tasks with a backup file.">
            <button
              className="btn"
              onClick={async () => {
                const [file] = await pickFiles({ accept: '.json,application/json', multiple: false });
                if (!file) return;
                try {
                  const data = JSON.parse(await file.text());
                  if (!data || typeof data !== 'object' || !('notes' in data) || !('tasks' in data)) throw new Error('not a backup');
                  useStore.getState().importData(data);
                  toast({ kind: 'success', title: 'Backup restored ✨' });
                  fx.confetti(0.5);
                } catch {
                  toast({ kind: 'error', title: 'That file is not a MindPalace backup' });
                }
              }}
            >
              <Upload size={14} /> Import
            </button>
          </Row>
          <Row title="Reset this device" desc="Wipes local notes, tasks and progress here. If you're signed in, your cloud copy is pulled back down.">
            <button
              className={`btn danger${confirmReset ? ' armed' : ''}`}
              onClick={() => {
                if (!confirmReset) {
                  setConfirmReset(true);
                  setTimeout(() => setConfirmReset(false), 3000);
                  return;
                }
                useStore.getState().resetAll();
                setConfirmReset(false);
                toast({ kind: 'info', title: 'Fresh start' });
                // If signed in, pull the cloud copy back down onto this device.
                void syncNow();
              }}
            >
              <RotateCcw size={14} /> {confirmReset ? 'Click again to confirm' : 'Reset'}
            </button>
          </Row>
        </Card>
      </div>
    </div>
  );
}
