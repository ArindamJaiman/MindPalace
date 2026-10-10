import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { BookOpen, Columns2, FilePlus2, FileText, PencilLine, Upload, X } from 'lucide-react';
import { useStore, selectActiveNote } from '../store/store';
import { toast } from '../store/ui';
import type { NoteMode } from '../store/types';
import { NoteEditor } from './NoteEditor';
import { NoteReader } from './NoteReader';
import { sfx } from '../lib/sound';
import { pickFiles } from '../lib/files';
import { importDropped } from '../components/DropZone';

function Tabs() {
  const openTabs = useStore((s) => s.openTabs);
  const notes = useStore((s) => s.notes);
  const activeId = useStore((s) => s.activeNoteId);
  const { openNote, closeTab, createNote } = useStore.getState();
  const tabs = openTabs.filter((id) => notes[id]);

  return (
    <div className="tabs">
      <Reorder.Group axis="x" values={tabs} onReorder={(order) => useStore.setState({ openTabs: order })} className="tab-strip">
        <AnimatePresence initial={false}>
          {tabs.map((id) => (
            <Reorder.Item
              key={id}
              value={id}
              className={`tab${id === activeId ? ' active' : ''}`}
              initial={{ opacity: 0, y: 8, width: 0 }}
              animate={{ opacity: 1, y: 0, width: 'auto' }}
              exit={{ opacity: 0, width: 0, transition: { duration: 0.15 } }}
              onPointerDown={() => openNote(id)}
              onAuxClick={(e) => e.button === 1 && closeTab(id)}
              data-snap
            >
              {id === activeId && <motion.span layoutId="tab-glow" className="tab-glow" />}
              <FileText size={13} />
              <span className="tab-title">{notes[id].title}</span>
              <button
                className="tab-close"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                  sfx.softClick();
                }}
                aria-label="Close tab"
              >
                <X size={12} />
              </button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <button
        className="tab-new"
        title="New note (Alt+N)"
        onClick={() => {
          createNote();
          sfx.add();
        }}
      >
        <FilePlus2 size={15} />
      </button>
    </div>
  );
}

function InlineTitle({ id, title }: { id: string; title: string }) {
  const [value, setValue] = useState(title);
  const renameNote = useStore((s) => s.renameNote);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(title), [title, id]);

  // Fresh "Untitled" notes get their title selected so you can just start typing.
  useEffect(() => {
    if (/^Untitled( \d+)?$/.test(title)) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [id]);

  const commit = () => {
    const v = value.trim();
    if (!v) return setValue(title);
    if (!renameNote(id, v)) {
      toast({ kind: 'error', title: 'A note with that name already exists' });
      setValue(title);
    }
  };

  return (
    <input
      ref={ref}
      className="inline-title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (document.querySelector('.note-editor .cm-content') as HTMLElement | null)?.focus();
        }
      }}
      spellCheck={false}
    />
  );
}

const MODES: { mode: NoteMode; icon: React.ReactNode; label: string }[] = [
  { mode: 'edit', icon: <PencilLine size={15} />, label: 'Edit' },
  { mode: 'split', icon: <Columns2 size={15} />, label: 'Split' },
  { mode: 'read', icon: <BookOpen size={15} />, label: 'Read' },
];

export function NotesView() {
  const note = useStore(selectActiveNote);
  const mode = useStore((s) => s.settings.noteMode);
  const setSettings = useStore((s) => s.setSettings);
  const updateNote = useStore((s) => s.updateNote);
  const createNote = useStore((s) => s.createNote);

  return (
    <div className="view notes-view">
      <Tabs />
      {note ? (
        <div className="note-pane">
          <div className="note-toolbar">
            <div className="note-crumbs">
              {note.folder ? note.folder.split('/').map((f, i) => <span key={i}>{f} /</span>) : null}
              <span className="crumb-current">{note.title}</span>
            </div>
            <div className="mode-switch">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  className={mode === m.mode ? 'active' : ''}
                  onClick={() => {
                    setSettings({ noteMode: m.mode });
                    sfx.tick();
                  }}
                  title={`${m.label} (Ctrl+E toggles)`}
                >
                  {mode === m.mode && <motion.span layoutId="mode-pill" className="mode-pill" transition={{ type: 'spring', stiffness: 600, damping: 35 }} />}
                  <span className="mode-icon">{m.icon}</span>
                  <span className="mode-label">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={note.id + mode}
              className={`note-body mode-${mode}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2 }}
            >
              {mode !== 'read' && (
                <div className="note-col editor-col">
                  <div className="note-title-wrap">
                    <InlineTitle id={note.id} title={note.title} />
                  </div>
                  <NoteEditor noteId={note.id} content={note.content} onChange={(v) => updateNote(note.id, { content: v })} />
                </div>
              )}
              {mode !== 'edit' && (
                <div className="note-col reader-col">
                  {mode === 'read' && (
                    <div className="note-title-wrap">
                      <InlineTitle id={note.id} title={note.title} />
                    </div>
                  )}
                  <NoteReader noteId={note.id} content={note.content} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="notes-empty">
          <motion.div className="notes-empty-card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="empty-orb">
              <span />
              <span />
              <span />
            </div>
            <h2>No note open</h2>
            <p>Pick one from the vault, press Ctrl+K, or start fresh.</p>
            <div className="notes-empty-actions">
              <button className="btn primary" data-magnetic onClick={() => createNote()}>
                <FilePlus2 size={16} /> New note
              </button>
              <button
                className="btn"
                data-magnetic
                onClick={async () => {
                  const files = await pickFiles({ accept: '.md,.markdown,.txt,image/*,application/pdf' });
                  if (files.length) void importDropped(files);
                }}
              >
                <Upload size={16} /> Upload notes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
