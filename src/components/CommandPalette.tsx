import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Command,
  FilePlus2,
  FileText,
  Gamepad2,
  ListPlus,
  ListTodo,
  MousePointer2,
  Network,
  Orbit,
  Search,
  Settings,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { navigate } from '../hooks/useRoute';
import { parseTask } from '../lib/parseTask';
import { pickFiles } from '../lib/files';
import { importDropped } from './DropZone';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';
import type { CursorStyle } from '../store/types';

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  group: 'Notes' | 'Commands' | 'Create';
  run: () => void;
}

/** Subsequence fuzzy match; higher is better, -1 means no match. */
function fuzzy(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 100 - direct + (direct === 0 ? 50 : 0);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2;
    ti = found + 1;
  }
  return score;
}

const CURSORS: CursorStyle[] = ['embers', 'tracer', 'reticle', 'off'];

export function CommandPalette() {
  const { paletteOpen, setPalette } = useUi();
  const notes = useStore((s) => s.notes);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ('');
      setSel(0);
    }
  }, [paletteOpen]);

  const items = useMemo<Item[]>(() => {
    const st = useStore.getState();
    const close = () => setPalette(false);
    const commands: Item[] = [
      { id: 'c-tasks', label: 'Go to Tasks', hint: 'Alt+1', icon: <ListTodo size={16} />, group: 'Commands', run: () => navigate('tasks') },
      { id: 'c-notes', label: 'Go to Notes', hint: 'Alt+2', icon: <FileText size={16} />, group: 'Commands', run: () => navigate('notes') },
      { id: 'c-graph', label: 'Open Graph view', hint: 'Alt+3', icon: <Network size={16} />, group: 'Commands', run: () => navigate('graph') },
      { id: 'c-orbit', label: 'Open Orbit (progress)', hint: 'Alt+4', icon: <Orbit size={16} />, group: 'Commands', run: () => navigate('orbit') },
      { id: 'c-fidget', label: 'Open Fidget Lab', hint: 'Alt+5', icon: <Gamepad2 size={16} />, group: 'Commands', run: () => navigate('fidget') },
      { id: 'c-settings', label: 'Open Settings', hint: 'Alt+6', icon: <Settings size={16} />, group: 'Commands', run: () => navigate('settings') },
      {
        id: 'c-new-note',
        label: 'New note',
        hint: 'Alt+N',
        icon: <FilePlus2 size={16} />,
        group: 'Commands',
        run: () => {
          st.createNote();
          navigate('notes');
        },
      },
      {
        id: 'c-import',
        label: 'Upload notes & files…',
        icon: <Upload size={16} />,
        group: 'Commands',
        run: async () => {
          const files = await pickFiles({ accept: '.md,.markdown,.txt,image/*,application/pdf' });
          if (files.length) void importDropped(files);
        },
      },
      {
        id: 'c-cursor',
        label: 'Cycle cursor style',
        hint: st.settings.cursor,
        icon: <MousePointer2 size={16} />,
        group: 'Commands',
        run: () => {
          const next = CURSORS[(CURSORS.indexOf(st.settings.cursor) + 1) % CURSORS.length];
          st.setSettings({ cursor: next });
          useUi.getState().toast({ kind: 'info', title: `Cursor: ${next}` });
        },
      },
      {
        id: 'c-sound',
        label: st.settings.sound ? 'Mute sounds' : 'Unmute sounds',
        icon: <Volume2 size={16} />,
        group: 'Commands',
        run: () => st.setSettings({ sound: !st.settings.sound }),
      },
      {
        id: 'c-confetti',
        label: 'Throw confetti',
        hint: 'because you deserve it',
        icon: <Sparkles size={16} />,
        group: 'Commands',
        run: () => {
          fx.confetti();
          sfx.levelUp();
        },
      },
    ];

    const noteItems: Item[] = Object.values(notes).map((n) => ({
      id: n.id,
      label: n.title,
      hint: n.folder || undefined,
      icon: <FileText size={16} />,
      group: 'Notes',
      run: () => {
        st.openNote(n.id);
        navigate('notes');
      },
    }));

    const query = q.trim().toLowerCase();
    const scored = [...noteItems, ...commands]
      .map((it) => ({ it, s: fuzzy(query, it.label + ' ' + (it.hint ?? '')) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || (a.it.group === 'Notes' ? -1 : 1))
      .map((x) => x.it);

    const list = query ? scored.slice(0, 12) : [...noteItems.slice(0, 5), ...commands];
    if (query) {
      const parsed = parseTask(q);
      list.push(
        {
          id: 'create-task',
          label: `Add task: ${parsed.title}`,
          hint: parsed.chips.map((c) => c.label).join(' '),
          icon: <ListPlus size={16} />,
          group: 'Create',
          run: () => {
            st.addTask({ title: parsed.title, tags: parsed.tags, priority: parsed.priority, due: parsed.due, dueHasTime: parsed.dueHasTime });
            sfx.add();
            useUi.getState().toast({ kind: 'success', title: 'Task added', body: parsed.title });
          },
        },
        {
          id: 'create-note',
          label: `Create note “${q.trim()}”`,
          icon: <FilePlus2 size={16} />,
          group: 'Create',
          run: () => {
            st.openOrCreateByTitle(q.trim());
            navigate('notes');
          },
        },
      );
    }
    return list.map((it) => ({
      ...it,
      run: () => {
        close();
        it.run();
      },
    }));
  }, [notes, q, setPalette]);

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    listRef.current?.querySelector('.pal-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  let lastGroup = '';

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          className="palette-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && setPalette(false)}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            <div className="pal-input">
              <Search size={18} />
              <input
                autoFocus
                placeholder="Search notes, run a command, or type a task…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSel((s) => Math.min(items.length - 1, s + 1));
                    sfx.tick();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSel((s) => Math.max(0, s - 1));
                    sfx.tick();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    items[sel]?.run();
                  }
                }}
              />
              <kbd>
                <Command size={11} />
                Ctrl K
              </kbd>
            </div>
            <div className="pal-list" ref={listRef}>
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <div key={it.id}>
                    {header && <div className="pal-group">{header}</div>}
                    <button className={`pal-item${i === sel ? ' selected' : ''}`} onMouseMove={() => i !== sel && setSel(i)} onClick={() => it.run()}>
                      {i === sel && <motion.span layoutId="pal-sel" className="pal-sel" transition={{ type: 'spring', stiffness: 700, damping: 40 }} />}
                      <span className="pal-icon">{it.icon}</span>
                      <span className="pal-label">{it.label}</span>
                      {it.hint && <span className="pal-hint">{it.hint}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
