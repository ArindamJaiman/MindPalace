import { motion } from 'framer-motion';
import { Gamepad2, ListTodo, Network, NotebookPen, Orbit, PanelLeft, Search, Settings, Upload } from 'lucide-react';
import { navigate, useRoute, type View } from '../hooks/useRoute';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { sfx } from '../lib/sound';
import { importDropped } from './DropZone';
import { pickFiles } from '../lib/files';

const ITEMS: { view: View; icon: React.ReactNode; label: string }[] = [
  { view: 'tasks', icon: <ListTodo size={20} />, label: 'Tasks' },
  { view: 'notes', icon: <NotebookPen size={20} />, label: 'Notes' },
  { view: 'graph', icon: <Network size={20} />, label: 'Graph' },
  { view: 'orbit', icon: <Orbit size={20} />, label: 'Orbit' },
  { view: 'fidget', icon: <Gamepad2 size={20} />, label: 'Fidget Lab' },
];

export function Ribbon() {
  const route = useRoute();
  const leftOpen = useStore((s) => s.settings.leftOpen);
  const setSettings = useStore((s) => s.setSettings);
  const setPalette = useUi((s) => s.setPalette);

  const go = (v: View) => {
    sfx.softClick();
    navigate(v);
  };

  return (
    <nav className="ribbon">
      <div className="ribbon-logo" data-magnetic title="MindPalace">
        <svg viewBox="0 0 64 64" width="26" height="26">
          <defs>
            <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c4b5fd" />
              <stop offset="0.5" stopColor="var(--accent)" />
              <stop offset="1" stopColor="#4fd1c5" />
            </linearGradient>
          </defs>
          <path d="M32 8 L54 21 L54 43 L32 56 L10 43 L10 21 Z" fill="none" stroke="url(#logo-g)" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="8" fill="url(#logo-g)" className="logo-core" />
        </svg>
      </div>

      <button
        className="ribbon-btn"
        data-magnetic
        title="Toggle sidebar"
        onClick={() => {
          sfx.softClick();
          setSettings({ leftOpen: !leftOpen });
        }}
      >
        <PanelLeft size={19} />
      </button>
      <button className="ribbon-btn" data-magnetic title="Search & commands (Ctrl+K)" onClick={() => setPalette(true)}>
        <Search size={19} />
      </button>

      <div className="ribbon-sep" />

      {ITEMS.map((it, i) => (
        <button
          key={it.view}
          className={`ribbon-btn${route === it.view ? ' active' : ''}`}
          data-magnetic
          title={`${it.label} (Alt+${i + 1})`}
          onClick={() => go(it.view)}
        >
          {route === it.view && (
            <motion.span layoutId="ribbon-active" className="ribbon-active" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          <span className="ribbon-icon">{it.icon}</span>
        </button>
      ))}

      <div className="ribbon-spacer" />

      <button
        className="ribbon-btn"
        data-magnetic
        title="Upload notes or files"
        onClick={async () => {
          const files = await pickFiles({ accept: '.md,.markdown,.txt,image/*,application/pdf' });
          if (files.length) void importDropped(files);
        }}
      >
        <Upload size={19} />
      </button>
      <button className={`ribbon-btn${route === 'settings' ? ' active' : ''}`} data-magnetic title="Settings (Alt+6)" onClick={() => go('settings')}>
        {route === 'settings' && (
          <motion.span layoutId="ribbon-active" className="ribbon-active" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
        )}
        <span className="ribbon-icon">
          <Settings size={19} />
        </span>
      </button>
    </nav>
  );
}
