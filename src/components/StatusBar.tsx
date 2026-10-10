import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, Bell, BellRing, Flame, PanelRight, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useStore, selectActiveNote } from '../store/store';
import { useUi } from '../store/ui';
import { useRoute } from '../hooks/useRoute';
import { wordCount } from '../lib/links';
import { levelInfo, streak } from '../lib/xp';
import { relativeTime } from '../lib/dates';
import { sfx } from '../lib/sound';

function BellPanel() {
  const notifications = useStore((s) => s.notifications);
  const clear = useStore((s) => s.clearNotifications);
  const setBell = useUi((s) => s.setBell);
  return (
    <motion.div
      className="bell-panel"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
    >
      <div className="bell-head">
        <span>Notifications</span>
        <div>
          {notifications.length > 0 && (
            <button className="link-btn" onClick={clear}>
              Clear all
            </button>
          )}
          <button className="icon-btn" onClick={() => setBell(false)} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="bell-list">
        {notifications.length === 0 && <div className="rp-empty">All quiet. Reminders and achievements land here.</div>}
        {notifications.map((n) => (
          <div key={n.id} className={`bell-item kind-${n.kind}${n.read ? '' : ' unread'}`}>
            <div className="bell-icon">{n.kind === 'reminder' ? <AlarmClock size={14} /> : n.kind === 'achievement' ? <Trophy size={14} /> : <Bell size={14} />}</div>
            <div>
              <div className="bell-title">{n.title}</div>
              <div className="bell-body">
                {n.body} · {relativeTime(n.at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function StatusBar() {
  const route = useRoute();
  const note = useStore(selectActiveNote);
  const completions = useStore((s) => s.completions);
  const xp = useStore((s) => s.xp);
  const sound = useStore((s) => s.settings.sound);
  const rightOpen = useStore((s) => s.settings.rightOpen);
  const setSettings = useStore((s) => s.setSettings);
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length);
  const markRead = useStore((s) => s.markNotificationsRead);
  const { bellOpen, setBell } = useUi();
  const st = useMemo(() => streak(completions), [completions]);
  const lvl = levelInfo(xp);

  return (
    <footer className="statusbar">
      <div className="sb-left">
        {route === 'notes' && note && (
          <>
            <span>{wordCount(note.content)} words</span>
            <span>{note.content.length} characters</span>
          </>
        )}
        {route !== 'notes' && <span className="sb-hint">Ctrl+K to search · drop files anywhere to import</span>}
      </div>
      <div className="sb-right">
        <span className={`sb-chip${st > 0 ? ' hot' : ''}`} title="Daily streak">
          <Flame size={13} /> {st}
        </span>
        <span className="sb-chip" title={`${lvl.into}/${lvl.needed} XP to next level`}>
          <Trophy size={13} /> Lv {lvl.level}
          <span className="sb-xp">
            <span style={{ width: `${lvl.progress * 100}%` }} />
          </span>
        </span>
        <button
          className="sb-btn"
          title={sound ? 'Mute sounds' : 'Unmute sounds'}
          onClick={() => {
            setSettings({ sound: !sound });
            if (!sound) setTimeout(() => sfx.pop(), 30);
          }}
        >
          {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button className="sb-btn" title="Toggle right panel (Ctrl+\)" onClick={() => setSettings({ rightOpen: !rightOpen })}>
          <PanelRight size={14} />
        </button>
        <div className="sb-bell-wrap">
          <button
            className={`sb-btn${unread ? ' ringing' : ''}`}
            title="Notifications"
            onClick={() => {
              setBell(!bellOpen);
              if (!bellOpen) setTimeout(markRead, 1200);
            }}
          >
            {unread ? <BellRing size={14} /> : <Bell size={14} />}
            {unread > 0 && <span className="sb-badge">{unread}</span>}
          </button>
          <AnimatePresence>{bellOpen && <BellPanel />}</AnimatePresence>
        </div>
      </div>
    </footer>
  );
}
