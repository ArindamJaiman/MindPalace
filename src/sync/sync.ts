import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useStore, type StoreState } from '../store/store';
import { completionKey, type AttachmentMeta, type Completion, type FidgetStats, type Note, type Priority, type Task } from '../store/types';
import { attachmentBlob, setRemoteAttachmentFetcher } from '../lib/attachments';

/**
 * Local-first cloud sync.
 * - IndexedDB stays the source of truth for the UI; Supabase mirrors it per signed-in user.
 * - Sign-in pulls everything and merges last-writer-wins by updated_at (the server enforces the
 *   same rule with a trigger), deletions travel as soft-deleted rows ("tombstones").
 * - Afterwards local changes are diffed from the store and pushed in debounced batches, and
 *   Realtime streams other devices' changes back in.
 */

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  email: string | null;
  lastSyncedAt: number | null;
  error: string | null;
}

export const useSync = create<SyncState>()(() => ({
  status: supabase ? 'signed-out' : 'off',
  email: null,
  lastSyncedAt: null,
  error: null,
}));

const setSync = (patch: Partial<SyncState>) => useSync.setState(patch);

/* ---------------- row mapping ---------------- */

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : undefined);

interface NoteRow {
  user_id: string;
  id: string;
  title: string;
  content: string;
  folder: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}
interface TaskRow {
  user_id: string;
  id: string;
  title: string;
  details: string;
  done: boolean;
  priority: number;
  tags: string[];
  created_at: string;
  completed_at: string | null;
  due: string | null;
  due_has_time: boolean;
  remind_at: string | null;
  reminded: boolean;
  updated_at: string;
  deleted: boolean;
}
interface CompletionRow {
  user_id: string;
  id: string;
  task_id: string;
  title: string;
  at: string;
  tags: string[];
  priority: number;
  xp: number;
  updated_at: string;
  deleted: boolean;
}
interface AttachmentRow {
  user_id: string;
  id: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  deleted: boolean;
}
interface ProfileRow {
  id: string;
  display_name: string;
  accent: string;
  folders: string[];
  fidget: Partial<FidgetStats>;
  updated_at: string;
}

const noteToRow = (uid: string, n: Note): NoteRow => ({
  user_id: uid,
  id: n.id,
  title: n.title,
  content: n.content,
  folder: n.folder,
  created_at: iso(n.createdAt),
  updated_at: iso(n.updatedAt),
  deleted: false,
});
const deletedNoteRow = (uid: string, id: string, at: number): NoteRow => ({
  user_id: uid,
  id,
  title: '',
  content: '',
  folder: '',
  created_at: iso(at),
  updated_at: iso(at),
  deleted: true,
});
const rowToNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  content: r.content,
  folder: r.folder,
  createdAt: ms(r.created_at)!,
  updatedAt: ms(r.updated_at)!,
});

const taskTs = (t: Task) => t.updatedAt ?? t.createdAt;
const taskToRow = (uid: string, t: Task): TaskRow => ({
  user_id: uid,
  id: t.id,
  title: t.title,
  details: t.details,
  done: t.done,
  priority: t.priority,
  tags: t.tags,
  created_at: iso(t.createdAt),
  completed_at: t.completedAt ? iso(t.completedAt) : null,
  due: t.due !== undefined ? iso(t.due) : null,
  due_has_time: !!t.dueHasTime,
  remind_at: t.remindAt !== undefined ? iso(t.remindAt) : null,
  reminded: !!t.reminded,
  updated_at: iso(taskTs(t)),
  deleted: false,
});
const deletedTaskRow = (uid: string, id: string, at: number): TaskRow => ({
  user_id: uid,
  id,
  title: '',
  details: '',
  done: false,
  priority: 0,
  tags: [],
  created_at: iso(at),
  completed_at: null,
  due: null,
  due_has_time: false,
  remind_at: null,
  reminded: false,
  updated_at: iso(at),
  deleted: true,
});
const rowToTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  details: r.details,
  done: r.done,
  priority: r.priority as Priority,
  tags: r.tags ?? [],
  createdAt: ms(r.created_at)!,
  completedAt: ms(r.completed_at),
  due: ms(r.due),
  dueHasTime: r.due_has_time,
  remindAt: ms(r.remind_at),
  reminded: r.reminded,
  updatedAt: ms(r.updated_at),
});

const completionToRow = (uid: string, c: Completion): CompletionRow => ({
  user_id: uid,
  id: completionKey(c),
  task_id: c.taskId,
  title: c.title,
  at: iso(c.at),
  tags: c.tags,
  priority: c.priority,
  xp: c.xp,
  updated_at: iso(c.at),
  deleted: false,
});
const deletedCompletionRow = (uid: string, key: string, at: number): CompletionRow => {
  const sep = key.lastIndexOf('@');
  return {
    user_id: uid,
    id: key,
    task_id: key.slice(0, sep),
    title: '',
    at: iso(Number(key.slice(sep + 1)) || at),
    tags: [],
    priority: 0,
    xp: 0,
    updated_at: iso(at),
    deleted: true,
  };
};
const rowToCompletion = (r: CompletionRow): Completion => ({
  taskId: r.task_id,
  title: r.title,
  at: ms(r.at)!,
  tags: r.tags ?? [],
  priority: r.priority as Priority,
  xp: r.xp,
});

const attachmentToRow = (uid: string, a: AttachmentMeta): AttachmentRow => ({
  user_id: uid,
  id: a.id,
  name: a.name,
  type: a.type,
  size: a.size,
  created_at: iso(a.createdAt),
  deleted: false,
});

/* ---------------- engine state ---------------- */

let uid: string | null = null;
let unsubscribeStore: (() => void) | null = null;
let channel: RealtimeChannel | null = null;
let applyingRemote = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
let flushAgain = false;

const dirty = {
  notes: new Set<string>(),
  tasks: new Set<string>(),
  completions: new Set<string>(),
  attachments: new Set<string>(),
  profile: false,
};

/** Apply a state change that came from the server without echoing it back as a local edit. */
function applyRemote(fn: (s: StoreState) => Partial<StoreState>) {
  applyingRemote = true;
  try {
    useStore.setState(fn);
  } finally {
    applyingRemote = false;
  }
}

const sumXp = (cs: Completion[]) => cs.reduce((n, c) => n + c.xp, 0);

async function fetchAll<T>(table: string): Promise<T[]> {
  const sb = supabase!;
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Last-writer-wins merge of one entity type. Returns merged items, ids to push, and surviving tombstones. */
function mergeLww<T>(
  local: T[],
  idOf: (t: T) => string,
  tsOf: (t: T) => number,
  tombs: Record<string, number>,
  remote: { id: string; updated_at: string; deleted: boolean }[],
  fromRow: (r: never) => T,
) {
  const result = new Map(local.map((t) => [idOf(t), t]));
  const push = new Set<string>();
  const nextTombs = { ...tombs };
  const seen = new Set<string>();
  for (const r of remote) {
    seen.add(r.id);
    const rts = Date.parse(r.updated_at);
    const l = result.get(r.id);
    const tomb = tombs[r.id];
    if (r.deleted) {
      if (l && tsOf(l) > rts) push.add(r.id);
      else {
        result.delete(r.id);
        delete nextTombs[r.id];
      }
      continue;
    }
    if (tomb !== undefined && tomb >= rts) {
      push.add(r.id);
      continue;
    }
    if (tomb !== undefined) delete nextTombs[r.id];
    if (!l || rts > tsOf(l)) result.set(r.id, fromRow(r as never));
    else if (tsOf(l) > rts) push.add(r.id);
  }
  for (const id of result.keys()) if (!seen.has(id)) push.add(id);
  for (const id of Object.keys(nextTombs)) if (!seen.has(id)) delete nextTombs[id];
  return { items: [...result.values()], push, tombs: nextTombs };
}

async function pullAndMerge() {
  const sb = supabase!;
  const [noteRows, taskRows, completionRows, attachmentRows, profileRes] = await Promise.all([
    fetchAll<NoteRow>('notes'),
    fetchAll<TaskRow>('tasks'),
    fetchAll<CompletionRow>('completions'),
    fetchAll<AttachmentRow>('attachments'),
    sb.from('profiles').select('*').eq('id', uid!).maybeSingle(),
  ]);
  if (profileRes.error) throw profileRes.error;
  const profile = profileRes.data as ProfileRow | null;

  const st = useStore.getState();
  const notes = mergeLww(Object.values(st.notes), (n) => n.id, (n) => n.updatedAt, st.tombstones.notes, noteRows, rowToNote);
  const tasks = mergeLww(st.tasks, (t) => t.id, taskTs, st.tombstones.tasks, taskRows, rowToTask);
  const completions = mergeLww(st.completions, completionKey, (c) => c.at, st.tombstones.completions, completionRows, rowToCompletion);

  const attachments = { ...st.attachments };
  const remoteAttachmentIds = new Set<string>();
  for (const r of attachmentRows) {
    remoteAttachmentIds.add(r.id);
    if (!r.deleted && !attachments[r.id]) {
      attachments[r.id] = { id: r.id, name: r.name, type: r.type, size: Number(r.size), createdAt: ms(r.created_at)! };
    }
  }
  for (const id of Object.keys(st.attachments)) if (!remoteAttachmentIds.has(id)) dirty.attachments.add(id);

  // Profile: name/accent/folders are last-writer-wins; fidget stats only ever go up.
  const fidget = { ...st.fidget };
  let pushProfile = !profile;
  if (profile?.fidget) {
    for (const k of Object.keys(fidget) as (keyof FidgetStats)[]) {
      const rv = Number(profile.fidget[k] ?? 0);
      if (rv > fidget[k]) fidget[k] = rv;
      else if (fidget[k] > rv) pushProfile = true;
    }
  }
  const remoteProfileNewer = !!profile && Date.parse(profile.updated_at) > st.profileUpdatedAt;
  if (profile && !remoteProfileNewer && st.profileUpdatedAt > Date.parse(profile.updated_at)) pushProfile = true;

  const noteMap = Object.fromEntries(notes.items.map((n) => [n.id, n]));
  const completionList = completions.items.sort((a, b) => a.at - b.at);

  applyRemote((s) => ({
    notes: noteMap,
    tasks: tasks.items,
    completions: completionList,
    xp: sumXp(completionList),
    attachments,
    fidget,
    tombstones: { notes: notes.tombs, tasks: tasks.tombs, completions: completions.tombs },
    openTabs: s.openTabs.filter((id) => noteMap[id]),
    activeNoteId: s.activeNoteId && noteMap[s.activeNoteId] ? s.activeNoteId : (s.openTabs.find((id) => noteMap[id]) ?? null),
    ...(remoteProfileNewer
      ? {
          settings: { ...s.settings, name: profile!.display_name, accent: profile!.accent || s.settings.accent },
          folders: [...new Set([...(profile!.folders ?? []), ...notes.items.map((n) => n.folder).filter(Boolean)])].sort(),
          profileUpdatedAt: Date.parse(profile!.updated_at),
        }
      : {}),
  }));

  notes.push.forEach((id) => dirty.notes.add(id));
  tasks.push.forEach((id) => dirty.tasks.add(id));
  completions.push.forEach((id) => dirty.completions.add(id));
  if (pushProfile) dirty.profile = true;
}

async function upsertChunks(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase!.from(table).upsert(rows.slice(i, i + 500), { onConflict: table === 'profiles' ? 'id' : 'user_id,id' });
    if (error) throw error;
  }
}

async function flush() {
  if (!uid || !supabase) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setSync({ status: 'offline' });
    return;
  }
  flushing = true;
  const me = uid;
  const batch = {
    notes: [...dirty.notes],
    tasks: [...dirty.tasks],
    completions: [...dirty.completions],
    attachments: [...dirty.attachments],
    profile: dirty.profile,
  };
  dirty.notes.clear();
  dirty.tasks.clear();
  dirty.completions.clear();
  dirty.attachments.clear();
  dirty.profile = false;
  const nothing = !batch.notes.length && !batch.tasks.length && !batch.completions.length && !batch.attachments.length && !batch.profile;

  try {
    if (!nothing) setSync({ status: 'syncing' });
    const st = useStore.getState();
    const byKey = new Map(st.completions.map((c) => [completionKey(c), c]));
    const taskMap = new Map(st.tasks.map((t) => [t.id, t]));

    const noteRows = batch.notes
      .map((id) => (st.notes[id] ? noteToRow(me, st.notes[id]) : st.tombstones.notes[id] ? deletedNoteRow(me, id, st.tombstones.notes[id]) : null))
      .filter((r): r is NoteRow => !!r);
    const taskRows = batch.tasks
      .map((id) => (taskMap.has(id) ? taskToRow(me, taskMap.get(id)!) : st.tombstones.tasks[id] ? deletedTaskRow(me, id, st.tombstones.tasks[id]) : null))
      .filter((r): r is TaskRow => !!r);
    const completionRows = batch.completions
      .map((k) =>
        byKey.has(k) ? completionToRow(me, byKey.get(k)!) : st.tombstones.completions[k] ? deletedCompletionRow(me, k, st.tombstones.completions[k]) : null,
      )
      .filter((r): r is CompletionRow => !!r);

    await upsertChunks('notes', noteRows);
    await upsertChunks('tasks', taskRows);
    await upsertChunks('completions', completionRows);

    for (const id of batch.attachments) {
      const meta = st.attachments[id];
      if (!meta) continue;
      const blob = await attachmentBlob(id);
      if (blob) {
        const { error } = await supabase.storage.from('attachments').upload(`${me}/${id}`, blob, { upsert: true, contentType: meta.type });
        if (error) throw error;
      }
      await upsertChunks('attachments', [attachmentToRow(me, meta)]);
    }

    if (batch.profile) {
      const row: ProfileRow = {
        id: me,
        display_name: st.settings.name,
        accent: st.settings.accent,
        folders: st.folders,
        fidget: st.fidget,
        updated_at: iso(st.profileUpdatedAt || Date.now()),
      };
      await upsertChunks('profiles', [row]);
    }

    // Tombstones that reached the server are no longer needed locally.
    const pushedNoteTombs = noteRows.filter((r) => r.deleted).map((r) => r.id);
    const pushedTaskTombs = taskRows.filter((r) => r.deleted).map((r) => r.id);
    const pushedCompletionTombs = completionRows.filter((r) => r.deleted).map((r) => r.id);
    if (pushedNoteTombs.length || pushedTaskTombs.length || pushedCompletionTombs.length) {
      const drop = (rec: Record<string, number>, ids: string[]) => {
        const next = { ...rec };
        ids.forEach((id) => delete next[id]);
        return next;
      };
      applyRemote((s) => ({
        tombstones: {
          notes: drop(s.tombstones.notes, pushedNoteTombs),
          tasks: drop(s.tombstones.tasks, pushedTaskTombs),
          completions: drop(s.tombstones.completions, pushedCompletionTombs),
        },
      }));
    }
    setSync({ status: 'synced', lastSyncedAt: Date.now(), error: null });
  } catch (e) {
    batch.notes.forEach((id) => dirty.notes.add(id));
    batch.tasks.forEach((id) => dirty.tasks.add(id));
    batch.completions.forEach((id) => dirty.completions.add(id));
    batch.attachments.forEach((id) => dirty.attachments.add(id));
    if (batch.profile) dirty.profile = true;
    setSync({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 15_000);
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      scheduleFlush(200);
    }
  }
}

function scheduleFlush(delay = 1200) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

/** Watch the store and mark whatever changed locally as dirty. */
function watchStore() {
  return useStore.subscribe((s, p) => {
    if (applyingRemote || !uid) return;
    let changed = false;
    if (s.notes !== p.notes) {
      for (const id in s.notes) if (s.notes[id] !== p.notes[id]) (dirty.notes.add(id), (changed = true));
    }
    if (s.tombstones.notes !== p.tombstones.notes) {
      for (const id in s.tombstones.notes) if (!(id in p.tombstones.notes)) (dirty.notes.add(id), (changed = true));
    }
    if (s.tasks !== p.tasks) {
      const prev = new Map(p.tasks.map((t) => [t.id, t]));
      for (const t of s.tasks) if (prev.get(t.id) !== t) (dirty.tasks.add(t.id), (changed = true));
    }
    if (s.tombstones.tasks !== p.tombstones.tasks) {
      for (const id in s.tombstones.tasks) if (!(id in p.tombstones.tasks)) (dirty.tasks.add(id), (changed = true));
    }
    if (s.completions !== p.completions) {
      const prev = new Set(p.completions.map(completionKey));
      for (const c of s.completions) {
        const k = completionKey(c);
        if (!prev.has(k)) (dirty.completions.add(k), (changed = true));
      }
    }
    if (s.tombstones.completions !== p.tombstones.completions) {
      for (const k in s.tombstones.completions) if (!(k in p.tombstones.completions)) (dirty.completions.add(k), (changed = true));
    }
    if (s.attachments !== p.attachments) {
      for (const id in s.attachments) if (!p.attachments[id]) (dirty.attachments.add(id), (changed = true));
    }
    if (s.settings.name !== p.settings.name || s.settings.accent !== p.settings.accent || s.folders !== p.folders || s.fidget !== p.fidget) {
      dirty.profile = true;
      changed = true;
    }
    if (changed) scheduleFlush();
  });
}

function removeNoteLocally(s: StoreState, id: string): Partial<StoreState> {
  const notes = { ...s.notes };
  delete notes[id];
  const openTabs = s.openTabs.filter((t) => t !== id);
  return { notes, openTabs, activeNoteId: s.activeNoteId === id ? (openTabs[0] ?? null) : s.activeNoteId };
}

/** Live updates from other devices. Our own writes come back too, but are ignored as not newer. */
function subscribeRealtime(me: string) {
  const sb = supabase!;
  channel = sb
    .channel(`mindpalace:${me}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${me}` }, ({ new: row }) => {
      const r = row as NoteRow;
      if (!r?.id) return;
      const rts = Date.parse(r.updated_at);
      const s = useStore.getState();
      const l = s.notes[r.id];
      if (r.deleted) {
        if (l && l.updatedAt <= rts) applyRemote((st) => removeNoteLocally(st, r.id));
        return;
      }
      if ((s.tombstones.notes[r.id] ?? 0) >= rts) return;
      if (!l || rts > l.updatedAt) applyRemote((st) => ({ notes: { ...st.notes, [r.id]: rowToNote(r) } }));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${me}` }, ({ new: row }) => {
      const r = row as TaskRow;
      if (!r?.id) return;
      const rts = Date.parse(r.updated_at);
      const s = useStore.getState();
      const l = s.tasks.find((t) => t.id === r.id);
      if (r.deleted) {
        if (l && taskTs(l) <= rts) applyRemote((st) => ({ tasks: st.tasks.filter((t) => t.id !== r.id) }));
        return;
      }
      if ((s.tombstones.tasks[r.id] ?? 0) >= rts) return;
      if (!l) applyRemote((st) => ({ tasks: [rowToTask(r), ...st.tasks] }));
      else if (rts > taskTs(l)) applyRemote((st) => ({ tasks: st.tasks.map((t) => (t.id === r.id ? rowToTask(r) : t)) }));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'completions', filter: `user_id=eq.${me}` }, ({ new: row }) => {
      const r = row as CompletionRow;
      if (!r?.id) return;
      const s = useStore.getState();
      const has = s.completions.some((c) => completionKey(c) === r.id);
      if (r.deleted && has) {
        applyRemote((st) => {
          const completions = st.completions.filter((c) => completionKey(c) !== r.id);
          return { completions, xp: sumXp(completions) };
        });
      } else if (!r.deleted && !has && !s.tombstones.completions[r.id]) {
        applyRemote((st) => {
          const completions = [...st.completions, rowToCompletion(r)].sort((a, b) => a.at - b.at);
          return { completions, xp: sumXp(completions) };
        });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `user_id=eq.${me}` }, ({ new: row }) => {
      const r = row as AttachmentRow;
      if (!r?.id || r.deleted || useStore.getState().attachments[r.id]) return;
      applyRemote((st) => ({
        attachments: { ...st.attachments, [r.id]: { id: r.id, name: r.name, type: r.type, size: Number(r.size), createdAt: ms(r.created_at)! } },
      }));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${me}` }, ({ new: row }) => {
      const r = row as ProfileRow;
      if (!r?.id) return;
      const rts = Date.parse(r.updated_at);
      applyRemote((st) => {
        const fidget = { ...st.fidget };
        for (const k of Object.keys(fidget) as (keyof FidgetStats)[]) fidget[k] = Math.max(fidget[k], Number(r.fidget?.[k] ?? 0));
        if (rts <= st.profileUpdatedAt) return { fidget };
        return {
          fidget,
          settings: { ...st.settings, name: r.display_name, accent: r.accent || st.settings.accent },
          folders: r.folders ?? st.folders,
          profileUpdatedAt: rts,
        };
      });
    })
    .subscribe();
}

async function start(me: string, email: string | null) {
  if (uid === me) return;
  stop();
  uid = me;
  setSync({ status: 'syncing', email, error: null });
  setRemoteAttachmentFetcher(async (id) => {
    if (!uid || !supabase) return undefined;
    const { data } = await supabase.storage.from('attachments').download(`${uid}/${id}`);
    return data ?? undefined;
  });
  try {
    await pullAndMerge();
    if (uid !== me) return;
    unsubscribeStore = watchStore();
    subscribeRealtime(me);
    await flush();
  } catch (e) {
    setSync({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    // Still watch for changes so nothing is lost; the next flush retries.
    unsubscribeStore ??= watchStore();
    scheduleFlush(15_000);
  }
}

function stop() {
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (channel) void supabase?.removeChannel(channel);
  channel = null;
  clearTimeout(flushTimer);
  uid = null;
  setRemoteAttachmentFetcher(null);
}

function whenHydrated(): Promise<void> {
  if (useStore.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useStore.subscribe((s) => {
      if (s.hydrated) {
        unsub();
        resolve();
      }
    });
  });
}

/** Boot sync: restores an existing session (or finishes a magic-link sign-in) and starts syncing. */
export async function initSync() {
  const sb = supabase;
  if (!sb) return;
  await whenHydrated();

  sb.auth.onAuthStateChange((_event, session) => {
    // Supabase recommends not awaiting other client calls inside this callback.
    setTimeout(() => {
      if (session?.user) {
        if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
        void start(session.user.id, session.user.email ?? null);
      } else {
        stop();
        setSync({ status: 'signed-out', email: null });
      }
    }, 0);
  });

  window.addEventListener('online', () => {
    if (uid) void syncNow();
  });
}

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('Cloud sync is not configured');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export async function syncNow() {
  if (!uid) return;
  setSync({ status: 'syncing' });
  try {
    await pullAndMerge();
    await flush();
  } catch (e) {
    setSync({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
