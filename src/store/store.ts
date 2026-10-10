import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  completionKey,
  type AppNotification,
  type AttachmentMeta,
  type Completion,
  type FidgetStats,
  type Note,
  type Priority,
  type Settings,
  type Task,
  type Tombstones,
} from './types';
import { seedNotes, seedTasks } from './seed';
import { levelInfo, xpForTask } from '../lib/xp';
import { renameLinks, findNoteByTitle } from '../lib/links';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);

/* ---------- debounced IndexedDB storage, shared across tabs and editions ---------- */

let pendingWrite: { name: string; value: string } | null = null;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> = Promise.resolve();
/** The serialized state we last read or wrote; identical writes are skipped (no echo between tabs). */
let lastPersisted: string | null = null;

const TAB_ID = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mindpalace-state') : null;

function flushWrite(): Promise<void> {
  clearTimeout(writeTimer);
  if (pendingWrite) {
    const { name, value } = pendingWrite;
    pendingWrite = null;
    inflight = idbSet(name, value).then(() => {
      lastPersisted = value;
      channel?.postMessage({ type: 'state-written', from: TAB_ID });
    });
  }
  return inflight;
}

/** Write any debounced state now; await before navigating to another edition. */
export function flushPersist(): Promise<void> {
  return flushWrite();
}

const idbStorage: StateStorage = {
  getItem: async (name) => {
    const v = ((await idbGet(name)) as string | undefined) ?? null;
    lastPersisted = v;
    return v;
  },
  setItem: (name, value) => {
    if (value === lastPersisted && !pendingWrite) return;
    pendingWrite = { name, value };
    clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrite, 300);
  },
  removeItem: async (name) => {
    await idbDel(name);
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushWrite());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushWrite();
  });
  // Another tab (e.g. the other edition) saved: reload our copy unless we have unsaved edits.
  channel?.addEventListener('message', (e) => {
    if (e.data?.type !== 'state-written' || e.data.from === TAB_ID || pendingWrite) return;
    void useStore.persist.rehydrate();
  });
}

/* ---------- state ---------- */

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  accent: '#ff6a1a',
  cursor: 'embers',
  cursorMorph: true,
  sound: true,
  volume: 0.6,
  reduceMotion: false,
  notifications: false,
  noteMode: 'edit',
  leftOpen: true,
  rightOpen: true,
  termRain: true,
  termTrail: true,
};

/** Accent swatches from the original pastel theme; v2 moves anyone still on one to the forge theme. */
const LEGACY_ACCENTS = ['#8b7bff', '#4fd1c5', '#ff7ab6', '#ffc857', '#5ee6a0', '#7cc4ff', '#ff8a5c'];
const LEGACY_CURSORS: Record<string, Settings['cursor']> = { comet: 'embers', ribbon: 'tracer', minimal: 'reticle' };

const DEFAULT_FIDGET: FidgetStats = { pops: 0, flips: 0, bestRpm: 0, switches: 0, buttonPresses: 0, squishes: 0 };

export interface ToggleResult {
  completed: boolean;
  xp: number;
  leveledUp: boolean;
  level: number;
}

interface Data {
  notes: Record<string, Note>;
  folders: string[];
  expandedFolders: string[];
  tasks: Task[];
  completions: Completion[];
  attachments: Record<string, AttachmentMeta>;
  notifications: AppNotification[];
  xp: number;
  settings: Settings;
  fidget: FidgetStats;
  openTabs: string[];
  activeNoteId: string | null;
  tombstones: Tombstones;
  /** Last local change to synced profile fields (name, accent, folders). */
  profileUpdatedAt: number;
}

interface Actions {
  createNote(init?: { title?: string; folder?: string; content?: string }, open?: boolean): Note;
  updateNote(id: string, patch: Partial<Pick<Note, 'content' | 'folder'>>): void;
  renameNote(id: string, title: string): boolean;
  deleteNote(id: string): Note | undefined;
  restoreNote(note: Note): void;
  openNote(id: string): void;
  closeTab(id: string): void;
  openOrCreateByTitle(title: string, folder?: string): string;

  createFolder(path: string): void;
  deleteFolder(path: string): void;
  toggleFolder(path: string, open?: boolean): void;

  addTask(t: Partial<Task> & { title: string }): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleTask(id: string, combo: number): ToggleResult | null;
  deleteTask(id: string): Task | undefined;
  restoreTask(task: Task): void;

  addAttachment(meta: AttachmentMeta): void;
  removeAttachment(id: string): void;

  pushNotification(n: Omit<AppNotification, 'id' | 'at' | 'read'>): AppNotification;
  markNotificationsRead(): void;
  clearNotifications(): void;

  setSettings(patch: Partial<Settings>): void;
  bumpFidget(key: keyof FidgetStats, value?: number): void;

  exportData(): Data;
  importData(data: Partial<Data>): void;
  resetAll(): void;
}

export type StoreState = Data & Actions & { hydrated: boolean };

function uniqueTitle(notes: Record<string, Note>, wanted: string, exceptId?: string): string {
  const taken = new Set(
    Object.values(notes)
      .filter((n) => n.id !== exceptId)
      .map((n) => n.title.toLowerCase()),
  );
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let i = 1; ; i++) {
    const t = `${wanted} ${i}`;
    if (!taken.has(t.toLowerCase())) return t;
  }
}

function withParents(folders: string[], path: string): string[] {
  const set = new Set(folders);
  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
  return [...set].sort((a, b) => a.localeCompare(b));
}

function initialData(): Data {
  const notes = seedNotes();
  return {
    notes,
    folders: ['Guides', 'Inbox'],
    expandedFolders: ['Guides', 'Inbox'],
    tasks: seedTasks(),
    completions: [],
    attachments: {},
    notifications: [],
    xp: 0,
    settings: { ...DEFAULT_SETTINGS },
    fidget: { ...DEFAULT_FIDGET },
    openTabs: ['welcome'],
    activeNoteId: 'welcome',
    tombstones: { notes: {}, tasks: {}, completions: {} },
    profileUpdatedAt: 0,
  };
}

const withoutKey = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
  if (!(key in rec)) return rec;
  const next = { ...rec };
  delete next[key];
  return next;
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      hydrated: false,

      /* ----- notes ----- */
      createNote(init = {}, open = true) {
        const now = Date.now();
        const s = get();
        const folder = init.folder ?? '';
        const note: Note = {
          id: uid(),
          title: uniqueTitle(s.notes, (init.title ?? 'Untitled').trim() || 'Untitled'),
          content: init.content ?? '',
          folder,
          createdAt: now,
          updatedAt: now,
        };
        set((st) => ({
          notes: { ...st.notes, [note.id]: note },
          folders: folder ? withParents(st.folders, folder) : st.folders,
          expandedFolders: folder ? withParents(st.expandedFolders, folder) : st.expandedFolders,
          ...(folder && !st.folders.includes(folder) ? { profileUpdatedAt: now } : {}),
          ...(open
            ? { openTabs: st.openTabs.includes(note.id) ? st.openTabs : [...st.openTabs, note.id], activeNoteId: note.id }
            : {}),
        }));
        return note;
      },

      updateNote(id, patch) {
        set((st) => {
          const n = st.notes[id];
          if (!n) return {};
          return {
            notes: { ...st.notes, [id]: { ...n, ...patch, updatedAt: Date.now() } },
            folders: patch.folder ? withParents(st.folders, patch.folder) : st.folders,
            ...(patch.folder && !st.folders.includes(patch.folder) ? { profileUpdatedAt: Date.now() } : {}),
          };
        });
      },

      renameNote(id, title) {
        const t = title.trim();
        const st = get();
        const n = st.notes[id];
        if (!n || !t) return false;
        if (t === n.title) return true;
        const clash = findNoteByTitle(st.notes, t);
        if (clash && clash.id !== id) return false;
        const old = n.title;
        const notes: Record<string, Note> = {};
        for (const [k, v] of Object.entries(st.notes)) {
          if (k === id) notes[k] = { ...v, title: t, updatedAt: Date.now() };
          else {
            const content = renameLinks(v.content, old, t);
            notes[k] = content === v.content ? v : { ...v, content };
          }
        }
        const tasks = st.tasks.map((task) => {
          const title2 = renameLinks(task.title, old, t);
          return title2 === task.title ? task : { ...task, title: title2, updatedAt: Date.now() };
        });
        set({ notes, tasks });
        return true;
      },

      deleteNote(id) {
        const st = get();
        const n = st.notes[id];
        if (!n) return undefined;
        const notes = { ...st.notes };
        delete notes[id];
        const openTabs = st.openTabs.filter((t) => t !== id);
        const idx = st.openTabs.indexOf(id);
        const activeNoteId =
          st.activeNoteId === id ? (openTabs[Math.min(idx, openTabs.length - 1)] ?? null) : st.activeNoteId;
        set({ notes, openTabs, activeNoteId, tombstones: { ...st.tombstones, notes: { ...st.tombstones.notes, [id]: Date.now() } } });
        return n;
      },

      restoreNote(note) {
        set((st) => ({
          notes: { ...st.notes, [note.id]: { ...note, updatedAt: Date.now() } },
          tombstones: { ...st.tombstones, notes: withoutKey(st.tombstones.notes, note.id) },
          folders: note.folder ? withParents(st.folders, note.folder) : st.folders,
          openTabs: [...st.openTabs, note.id],
          activeNoteId: note.id,
        }));
      },

      openNote(id) {
        set((st) => {
          const n = st.notes[id];
          if (!n) return {};
          return {
            openTabs: st.openTabs.includes(id) ? st.openTabs : [...st.openTabs, id],
            activeNoteId: id,
            expandedFolders: n.folder ? withParents(st.expandedFolders, n.folder) : st.expandedFolders,
          };
        });
      },

      closeTab(id) {
        set((st) => {
          const idx = st.openTabs.indexOf(id);
          const openTabs = st.openTabs.filter((t) => t !== id);
          const activeNoteId =
            st.activeNoteId === id ? (openTabs[Math.min(idx, openTabs.length - 1)] ?? null) : st.activeNoteId;
          return { openTabs, activeNoteId };
        });
      },

      openOrCreateByTitle(title, folder) {
        const existing = findNoteByTitle(get().notes, title);
        if (existing) {
          get().openNote(existing.id);
          return existing.id;
        }
        return get().createNote({ title, folder }).id;
      },

      /* ----- folders ----- */
      createFolder(path) {
        const p = path.replace(/^\/+|\/+$/g, '').trim();
        if (!p) return;
        set((st) => ({
          folders: withParents(st.folders, p),
          expandedFolders: withParents(st.expandedFolders, p),
          profileUpdatedAt: Date.now(),
        }));
      },

      deleteFolder(path) {
        set((st) => {
          const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          const inside = (f: string) => f === path || f.startsWith(path + '/');
          const notes: Record<string, Note> = {};
          for (const [k, n] of Object.entries(st.notes)) {
            notes[k] = inside(n.folder)
              ? { ...n, folder: parent + n.folder.slice(path.length).replace(/^\//, parent ? '/' : ''), updatedAt: Date.now() }
              : n;
          }
          const folders = st.folders
            .filter((f) => f !== path)
            .map((f) => (inside(f) ? parent + f.slice(path.length).replace(/^\//, parent ? '/' : '') : f))
            .filter(Boolean);
          return { notes, folders: [...new Set(folders)].sort((a, b) => a.localeCompare(b)), profileUpdatedAt: Date.now() };
        });
      },

      toggleFolder(path, open) {
        set((st) => {
          const isOpen = st.expandedFolders.includes(path);
          const want = open ?? !isOpen;
          if (want === isOpen) return {};
          return {
            expandedFolders: want ? [...st.expandedFolders, path] : st.expandedFolders.filter((f) => f !== path),
          };
        });
      },

      /* ----- tasks ----- */
      addTask(t) {
        const task: Task = {
          id: uid(),
          details: '',
          done: false,
          priority: 0,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...t,
        };
        if (task.due && task.dueHasTime && task.remindAt === undefined && task.due > Date.now()) task.remindAt = task.due;
        set((st) => ({ tasks: [task, ...st.tasks] }));
        return task;
      },

      updateTask(id, patch) {
        set((st) => ({
          tasks: st.tasks.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t, ...patch, updatedAt: Date.now() };
            if ('remindAt' in patch) next.reminded = false;
            return next;
          }),
        }));
      },

      toggleTask(id, combo) {
        const st = get();
        const task = st.tasks.find((t) => t.id === id);
        if (!task) return null;
        const before = levelInfo(st.xp).level;
        if (!task.done) {
          const now = Date.now();
          const xp = xpForTask(task.priority as Priority, combo);
          const completion: Completion = { taskId: id, title: task.title, at: now, tags: task.tags, priority: task.priority, xp };
          const total = st.xp + xp;
          set({
            tasks: st.tasks.map((t) => (t.id === id ? { ...t, done: true, completedAt: now, updatedAt: now } : t)),
            completions: [...st.completions, completion],
            xp: total,
          });
          const after = levelInfo(total).level;
          return { completed: true, xp, leveledUp: after > before, level: after };
        }
        let idx = -1;
        for (let i = st.completions.length - 1; i >= 0; i--) {
          if (st.completions[i].taskId === id) {
            idx = i;
            break;
          }
        }
        const lost = idx >= 0 ? st.completions[idx].xp : 0;
        const now = Date.now();
        set({
          tasks: st.tasks.map((t) => (t.id === id ? { ...t, done: false, completedAt: undefined, updatedAt: now } : t)),
          completions: idx >= 0 ? st.completions.filter((_, i) => i !== idx) : st.completions,
          xp: Math.max(0, st.xp - lost),
          tombstones:
            idx >= 0
              ? { ...st.tombstones, completions: { ...st.tombstones.completions, [completionKey(st.completions[idx])]: now } }
              : st.tombstones,
        });
        return { completed: false, xp: -lost, leveledUp: false, level: levelInfo(Math.max(0, st.xp - lost)).level };
      },

      deleteTask(id) {
        const task = get().tasks.find((t) => t.id === id);
        set((st) => ({
          tasks: st.tasks.filter((t) => t.id !== id),
          tombstones: { ...st.tombstones, tasks: { ...st.tombstones.tasks, [id]: Date.now() } },
        }));
        return task;
      },

      restoreTask(task) {
        set((st) => ({
          tasks: [{ ...task, updatedAt: Date.now() }, ...st.tasks.filter((t) => t.id !== task.id)],
          tombstones: { ...st.tombstones, tasks: withoutKey(st.tombstones.tasks, task.id) },
        }));
      },

      /* ----- attachments ----- */
      addAttachment(meta) {
        set((st) => ({ attachments: { ...st.attachments, [meta.id]: meta } }));
      },
      removeAttachment(id) {
        set((st) => {
          const attachments = { ...st.attachments };
          delete attachments[id];
          return { attachments };
        });
      },

      /* ----- notifications ----- */
      pushNotification(n) {
        const full: AppNotification = { ...n, id: uid(), at: Date.now(), read: false };
        set((st) => ({ notifications: [full, ...st.notifications].slice(0, 100) }));
        return full;
      },
      markNotificationsRead() {
        set((st) => ({ notifications: st.notifications.map((n) => (n.read ? n : { ...n, read: true })) }));
      },
      clearNotifications() {
        set({ notifications: [] });
      },

      /* ----- settings & fun ----- */
      setSettings(patch) {
        set((st) => ({
          settings: { ...st.settings, ...patch },
          ...('name' in patch || 'accent' in patch ? { profileUpdatedAt: Date.now() } : {}),
        }));
      },
      bumpFidget(key, value) {
        set((st) => ({
          fidget: {
            ...st.fidget,
            [key]: key === 'bestRpm' ? Math.max(st.fidget.bestRpm, value ?? 0) : st.fidget[key] + (value ?? 1),
          },
        }));
      },

      /* ----- data ----- */
      exportData() {
        const { hydrated: _h, ...rest } = get();
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') data[k] = v;
        return data as unknown as Data;
      },
      importData(data) {
        set((st) => ({
          ...st,
          ...data,
          settings: { ...st.settings, ...(data.settings ?? {}) },
          fidget: { ...st.fidget, ...(data.fidget ?? {}) },
        }));
      },
      resetAll() {
        set({ ...initialData() });
      },
    }),
    {
      name: 'mindpalace-v1',
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<Data>;
        if (version < 2 && p.settings) {
          const cursor = LEGACY_CURSORS[p.settings.cursor as string];
          if (cursor) p.settings = { ...p.settings, cursor };
          if (LEGACY_ACCENTS.includes(p.settings.accent)) {
            p.settings = { ...p.settings, accent: DEFAULT_SETTINGS.accent };
            // Count it as a fresh local change so an old synced accent doesn't win it back.
            p.profileUpdatedAt = Date.now();
          }
        }
        return p as StoreState;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s)) if (typeof v !== 'function' && k !== 'hydrated') out[k] = v;
        return out as Partial<StoreState>;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}) },
          fidget: { ...current.fidget, ...(p.fidget ?? {}) },
          tombstones: { ...current.tombstones, ...(p.tombstones ?? {}) },
        };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

export const selectActiveNote = (s: StoreState) => (s.activeNoteId ? s.notes[s.activeNoteId] : undefined);
