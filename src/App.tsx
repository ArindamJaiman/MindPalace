import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store/store';
import { useRoute, type View } from './hooks/useRoute';
import { useGlobalHotkeys } from './hooks/useHotkeys';
import { configureSound } from './lib/sound';
import { startReminderLoop } from './lib/notify';
import { Background } from './components/Background';
import { Ribbon } from './components/Ribbon';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenu } from './components/ContextMenu';
import { DropZone } from './components/DropZone';
import { Toasts } from './components/Toasts';
import { FxLayer } from './components/FxLayer';
import { Cursor } from './components/Cursor';
import { TasksView } from './views/TasksView';
import { NotesView } from './views/NotesView';
import { GraphView } from './views/GraphView';
import { OrbitView } from './views/OrbitView';
import { FidgetView } from './views/FidgetView';
import { SettingsView } from './views/SettingsView';

const VIEWS: Record<View, () => React.ReactElement> = {
  tasks: TasksView,
  notes: NotesView,
  graph: GraphView,
  orbit: OrbitView,
  fidget: FidgetView,
  settings: SettingsView,
};

function Splash() {
  return (
    <div className="splash">
      <motion.div className="splash-logo" animate={{ scale: [1, 1.08, 1], rotate: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        <svg viewBox="0 0 64 64" width="64" height="64">
          <path d="M32 8 L54 21 L54 43 L32 56 L10 43 L10 21 Z" fill="none" stroke="#8b7bff" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="8" fill="#8b7bff" />
        </svg>
      </motion.div>
      <div className="splash-text">Opening your MindPalace…</div>
    </div>
  );
}

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const accent = useStore((s) => s.settings.accent);
  const sound = useStore((s) => s.settings.sound);
  const volume = useStore((s) => s.settings.volume);
  const reduce = useStore((s) => s.settings.reduceMotion);
  const route = useRoute();

  useGlobalHotkeys();

  useEffect(() => configureSound(sound, volume), [sound, volume]);
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
  }, [accent]);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduce);
  }, [reduce]);
  useEffect(() => {
    if (hydrated) return startReminderLoop();
  }, [hydrated]);

  if (!hydrated) return <Splash />;

  const ViewComponent = VIEWS[route];
  return (
    <>
      <Background />
      <div className="app">
        <Ribbon />
        <Sidebar />
        <main className="main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              className="view-wrap"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <ViewComponent />
            </motion.div>
          </AnimatePresence>
        </main>
        <RightPanel />
      </div>
      <StatusBar />
      <CommandPalette />
      <ContextMenu />
      <DropZone />
      <Toasts />
      <FxLayer />
      <Cursor />
    </>
  );
}
