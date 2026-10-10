import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  CheckCheck,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Hash,
  Inbox,
  Layers,
  Pencil,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useStore } from '../store/store';
import { toast, useUi, type TaskList } from '../store/ui';
import type { Note } from '../store/types';
import { navigate, useRoute } from '../hooks/useRoute';
import { isDueToday } from '../lib/tasks';
import { endOfDay } from '../lib/dates';
import { extractTags, tagColor } from '../lib/links';
import { openContextMenu } from './ContextMenu';
import { sfx } from '../lib/sound';
import { pickFiles } from '../lib/files';
import { importDropped } from './DropZone';

const NOTE_DRAG = 'application/x-mindpalace-note';

const LISTS: { id: TaskList; label: string; icon: React.ReactNode }[] = [
  { id: 'today', label: 'Today', icon: <Sun size={16} /> },
  { id: 'upcoming', label: 'Upcoming', icon: <CalendarDays size={16} /> },
  { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} /> },
  { id: 'all', label: 'All tasks', icon: <Layers size={16} /> },
  { id: 'done', label: 'Completed', icon: <CheckCheck size={16} /> },
];

function TaskLists() {
  const tasks = useStore((s) => s.tasks);
  const route = useRoute();
  const { taskList, setTaskList } = useUi();
  const counts = useMemo(() => {
    const eod = endOfDay();
    const open = tasks.filter((t) => !t.done);
    return {
      today: open.filter(isDueToday).length,
      upcoming: open.filter((t) => t.due !== undefined && t.due > eod).length,
      inbox: open.filter((t) => t.due === undefined).length,
      all: open.length,
      done: tasks.length - open.length,
    } satisfies Record<TaskList, number>;
  }, [tasks]);

  return (
    <div className="side-section">
      <div className="side-heading">Tasks</div>
      {LISTS.map((l) => {
        const active = route === 'tasks' && taskList === l.id;
        return (
          <button
            key={l.id}
            className={`side-item${active ? ' active' : ''}`}
            onClick={() => {
              sfx.softClick();
              setTaskList(l.id);
              navigate('tasks');
            }}
          >
            {active && <motion.span layoutId="side-active" className="side-active" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="side-icon">{l.icon}</span>
            <span className="side-label">{l.label}</span>
            {counts[l.id] > 0 && (
              <motion.span key={counts[l.id]} className="side-count" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>
                {counts[l.id]}
              </motion.span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TagCloud() {
  const notes = useStore((s) => s.notes);
  const tasks = useStore((s) => s.tasks);
  const { tagFilter, setTagFilter, setSearch } = useUi();
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of Object.values(notes)) for (const t of extractTags(n.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of tasks) if (!t.done) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  }, [notes, tasks]);
  if (!tags.length) return null;
  return (
    <div className="side-section">
      <div className="side-heading">Tags</div>
      <div className="tag-cloud">
        {tags.map(([tag, n]) => (
          <button
            key={tag}
            className={`tag-pill${tagFilter === tag ? ' active' : ''}`}
            style={{ '--tag': tagColor(tag) } as React.CSSProperties}
            onClick={() => {
              sfx.softClick();
              const on = tagFilter !== tag;
              setTagFilter(on ? tag : null);
              setSearch(on ? `#${tag}` : '');
            }}
          >
            <Hash size={11} />
            {tag}
            <span className="tag-n">{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface TreeFolder {
  path: string;
  name: string;
  folders: TreeFolder[];
  notes: Note[];
}

function buildTree(folders: string[], notes: Note[]): TreeFolder {
  const root: TreeFolder = { path: '', name: '', folders: [], notes: [] };
  const map = new Map<string, TreeFolder>([['', root]]);
  const ensure = (path: string): TreeFolder => {
    const existing = map.get(path);
    if (existing) return existing;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const node: TreeFolder = { path, name: path.split('/').pop()!, folders: [], notes: [] };
    map.set(path, node);
    ensure(parentPath).folders.push(node);
    return node;
  };
  folders.forEach(ensure);
  for (const n of notes) ensure(n.folder).notes.push(n);
  const sort = (f: TreeFolder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.notes.sort((a, b) => a.title.localeCompare(b.title));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  return (
    <input
      className="tree-rename"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v);
        if (e.key === 'Escape') onDone(null);
      }}
    />
  );
}

function NoteRow({ note, depth }: { note: Note; depth: number }) {
  const active = useStore((s) => s.activeNoteId === note.id);
  const route = useRoute();
  const { openNote, renameNote, deleteNote, restoreNote, updateNote } = useStore.getState();
  const { renamingNoteId, setRenaming } = useUi();

  const del = () => {
    const removed = deleteNote(note.id);
    sfx.delete();
    if (removed) toast({ kind: 'info', title: `Deleted “${removed.title}”`, action: { label: 'Undo', run: () => restoreNote(removed) } });
  };

  return (
    <div
      className={`tree-row note${active && route === 'notes' ? ' active' : ''}`}
      style={{ paddingLeft: 12 + depth * 14 }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(NOTE_DRAG, note.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => {
        sfx.softClick();
        openNote(note.id);
        navigate('notes');
      }}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: 'Rename', icon: <Pencil size={14} />, run: () => setRenaming(note.id) },
          ...(note.folder ? [{ label: 'Move to root', icon: <FolderUp size={14} />, run: () => updateNote(note.id, { folder: '' }) }] : []),
          { label: 'Delete', icon: <Trash2 size={14} />, danger: true, run: del },
        ])
      }
      role="button"
      data-snap
    >
      <FileText size={14} className="tree-icon" />
      {renamingNoteId === note.id ? (
        <RenameInput
          initial={note.title}
          onDone={(v) => {
            setRenaming(null);
            if (v !== null && v.trim() && !renameNote(note.id, v)) toast({ kind: 'error', title: 'A note with that name already exists' });
          }}
        />
      ) : (
        <span className="tree-label">{note.title}</span>
      )}
    </div>
  );
}

function FolderRow({ folder, depth }: { folder: TreeFolder; depth: number }) {
  const open = useStore((s) => s.expandedFolders.includes(folder.path));
  const { toggleFolder, updateNote, createNote, deleteFolder } = useStore.getState();
  const [over, setOver] = useState(false);

  return (
    <div className="tree-folder">
      <div
        className={`tree-row folder${over ? ' drop-over' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          sfx.tick();
          toggleFolder(folder.path);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(NOTE_DRAG)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(NOTE_DRAG);
          setOver(false);
          if (!id) return;
          e.preventDefault();
          e.stopPropagation();
          updateNote(id, { folder: folder.path });
          toggleFolder(folder.path, true);
          sfx.pop(1.2);
        }}
        onContextMenu={(e) =>
          openContextMenu(e, [
            {
              label: 'New note here',
              icon: <FilePlus2 size={14} />,
              run: () => {
                const n = createNote({ folder: folder.path });
                useUi.getState().setRenaming(n.id);
                navigate('notes');
              },
            },
            { label: 'Delete folder (keep notes)', icon: <Trash2 size={14} />, danger: true, run: () => deleteFolder(folder.path) },
          ])
        }
        role="button"
        data-snap
      >
        <motion.span className="tree-chevron" animate={{ rotate: open ? 90 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
          <ChevronRight size={14} />
        </motion.span>
        {open ? <FolderOpen size={14} className="tree-icon folder-icon" /> : <Folder size={14} className="tree-icon folder-icon" />}
        <span className="tree-label">{folder.name}</span>
        <span className="tree-count">{countNotes(folder)}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tree-children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
          >
            <TreeBody folder={folder} depth={depth + 1} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function countNotes(f: TreeFolder): number {
  return f.notes.length + f.folders.reduce((n, c) => n + countNotes(c), 0);
}

function TreeBody({ folder, depth }: { folder: TreeFolder; depth: number }) {
  return (
    <>
      {folder.folders.map((f) => (
        <FolderRow key={f.path} folder={f} depth={depth} />
      ))}
      {folder.notes.map((n) => (
        <NoteRow key={n.id} note={n} depth={depth} />
      ))}
    </>
  );
}

function SearchResults({ query }: { query: string }) {
  const notes = useStore((s) => s.notes);
  const openNote = useStore((s) => s.openNote);
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return Object.values(notes)
      .map((n) => {
        const inTitle = n.title.toLowerCase().includes(q);
        const idx = n.content.toLowerCase().indexOf(q);
        if (!inTitle && idx < 0) return null;
        const snippet = idx >= 0 ? n.content.slice(Math.max(0, idx - 30), idx + q.length + 50).replace(/\n/g, ' ') : '';
        return { n, snippet, score: inTitle ? 2 : 1 };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score || b.n.updatedAt - a.n.updatedAt);
  }, [notes, query]);

  if (!results.length) return <div className="side-empty">No notes match “{query}”.</div>;
  const q = query.toLowerCase().trim();
  return (
    <div className="search-results">
      {results.map(({ n, snippet }) => {
        const i = snippet.toLowerCase().indexOf(q);
        return (
          <button
            key={n.id}
            className="search-hit"
            onClick={() => {
              openNote(n.id);
              navigate('notes');
            }}
          >
            <div className="search-hit-title">{n.title}</div>
            {snippet && (
              <div className="search-hit-snippet">
                …{snippet.slice(0, i)}
                <mark>{snippet.slice(i, i + q.length)}</mark>
                {snippet.slice(i + q.length)}…
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Vault() {
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const { createNote, createFolder } = useStore.getState();
  const { search, setSearch, setTagFilter, setRenaming } = useUi();
  const [newFolder, setNewFolder] = useState(false);
  const tree = useMemo(() => buildTree(folders, Object.values(notes)), [folders, notes]);
  const [rootOver, setRootOver] = useState(false);

  return (
    <div className="side-section vault">
      <div className="side-heading with-actions">
        <span>Vault</span>
        <div className="side-actions">
          <button
            title="New note (Alt+N)"
            onClick={() => {
              const n = createNote();
              setRenaming(n.id);
              navigate('notes');
              sfx.add();
            }}
          >
            <FilePlus2 size={15} />
          </button>
          <button title="New folder" onClick={() => setNewFolder(true)}>
            <FolderPlus size={15} />
          </button>
          <button
            title="Import a folder of notes"
            onClick={async () => {
              const files = await pickFiles({ directory: true });
              if (files.length) void importDropped(files);
            }}
          >
            <FolderUp size={15} />
          </button>
        </div>
      </div>
      <div className="side-search">
        <Search size={14} />
        <input
          placeholder="Search notes…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) setTagFilter(null);
          }}
        />
        {search && (
          <button
            className="side-search-clear"
            onClick={() => {
              setSearch('');
              setTagFilter(null);
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {search ? (
        <SearchResults query={search} />
      ) : (
        <div
          className={`tree${rootOver ? ' drop-over' : ''}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(NOTE_DRAG)) {
              e.preventDefault();
              setRootOver(true);
            }
          }}
          onDragLeave={() => setRootOver(false)}
          onDrop={(e) => {
            setRootOver(false);
            const id = e.dataTransfer.getData(NOTE_DRAG);
            if (id) {
              e.preventDefault();
              useStore.getState().updateNote(id, { folder: '' });
            }
          }}
        >
          {newFolder && (
            <div className="tree-row folder" style={{ paddingLeft: 8 }}>
              <FolderPlus size={14} className="tree-icon folder-icon" />
              <RenameInput
                initial="New folder"
                onDone={(v) => {
                  setNewFolder(false);
                  if (v?.trim()) {
                    createFolder(v.trim());
                    sfx.add();
                  }
                }}
              />
            </div>
          )}
          <TreeBody folder={tree} depth={0} />
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const open = useStore((s) => s.settings.leftOpen);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          className="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 264, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        >
          <div className="sidebar-inner">
            <TaskLists />
            <TagCloud />
            <Vault />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
