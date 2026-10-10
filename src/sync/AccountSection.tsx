import { useState } from 'react';
import { motion } from 'framer-motion';
import { Cloud, CloudOff, LogOut, Mail, RefreshCw } from 'lucide-react';
import { supabase } from './supabase';
import { sendMagicLink, signOut, syncNow, useSync } from './sync';
import { relativeTime } from '../lib/dates';
import { toast } from '../store/ui';
import { sfx } from '../lib/sound';

const STATUS_LABEL = {
  off: 'Not configured',
  'signed-out': 'Signed out',
  syncing: 'Syncing…',
  synced: 'Synced',
  error: 'Sync error',
  offline: 'Offline (will retry)',
} as const;

/** Cloud sync account card shown at the top of Settings. */
export function AccountSection() {
  const { status, email, lastSyncedAt, error } = useSync();
  const [input, setInput] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!supabase) {
    return (
      <motion.section className="settings-card account-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h2>
          <CloudOff size={16} /> Cloud sync
        </h2>
        <p className="settings-row-desc">This build has no Supabase config, so everything stays on this device.</p>
      </motion.section>
    );
  }

  return (
    <motion.section className="settings-card account-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <h2>
        <Cloud size={16} /> Cloud sync
        <span className={`sync-pill s-${status}`}>{STATUS_LABEL[status]}</span>
      </h2>

      {email ? (
        <>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">{email}</div>
              <div className="settings-row-desc">
                Notes, tasks, progress and attachments sync across your devices in real time.
                {lastSyncedAt ? ` Last synced ${relativeTime(lastSyncedAt)}.` : ''}
                {error && status === 'error' ? ` (${error})` : ''}
              </div>
            </div>
            <div className="settings-row-control account-actions">
              <button
                className="btn"
                onClick={() => {
                  sfx.tick();
                  void syncNow();
                }}
              >
                <RefreshCw size={14} className={status === 'syncing' ? 'spinning' : ''} /> Sync now
              </button>
              <button className="btn" onClick={() => void signOut()}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </>
      ) : sent ? (
        <div className="magic-sent">
          <motion.div className="magic-envelope" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <Mail size={26} />
          </motion.div>
          <div>
            <div className="settings-row-title">Check your inbox ✨</div>
            <div className="settings-row-desc">
              We sent a sign-in link to {input}. Open it in this browser and you'll be synced.{' '}
              <button className="link-btn" onClick={() => setSent(false)}>
                Use another email
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form
          className="settings-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!input.trim()) return;
            setBusy(true);
            try {
              await sendMagicLink(input.trim());
              setSent(true);
              sfx.chime();
            } catch (err) {
              toast({ kind: 'error', title: 'Could not send the link', body: err instanceof Error ? err.message : String(err) });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <div className="settings-row-title">Sign in to sync</div>
            <div className="settings-row-desc">No password. We email you a magic link. Your local notes are merged in, not replaced.</div>
          </div>
          <div className="settings-row-control account-actions">
            <input className="text-input" type="email" required placeholder="you@example.com" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send link'}
            </button>
          </div>
        </form>
      )}
    </motion.section>
  );
}
