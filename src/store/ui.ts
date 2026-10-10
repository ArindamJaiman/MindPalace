import { create } from 'zustand';
import { uid } from './store';

export interface Toast {
  id: string;
  title: string;
  body?: string;
  kind: 'success' | 'info' | 'xp' | 'reminder' | 'level' | 'error';
  action?: { label: string; run: () => void };
  duration: number;
}

export type TaskList = 'today' | 'upcoming' | 'inbox' | 'all' | 'done';

interface UiState {
  toasts: Toast[];
  taskList: TaskList;
  tagFilter: string | null;
  renamingNoteId: string | null;
  paletteOpen: boolean;
  bellOpen: boolean;
  search: string;
  /** Incremented to ask the quick-add input to focus itself. */
  focusQuickAdd: number;
  toast(t: Omit<Toast, 'id' | 'duration'> & { duration?: number }): string;
  dismissToast(id: string): void;
  setPalette(open: boolean): void;
  setBell(open: boolean): void;
  setSearch(q: string): void;
  requestQuickAdd(): void;
  setTaskList(l: TaskList): void;
  setTagFilter(t: string | null): void;
  setRenaming(id: string | null): void;
}

export const useUi = create<UiState>()((set) => ({
  toasts: [],
  taskList: 'today',
  tagFilter: null,
  renamingNoteId: null,
  paletteOpen: false,
  bellOpen: false,
  search: '',
  focusQuickAdd: 0,
  toast(t) {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts.slice(-4), { duration: 3800, ...t, id }] }));
    return id;
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setPalette(open) {
    set({ paletteOpen: open });
  },
  setBell(open) {
    set({ bellOpen: open });
  },
  setSearch(q) {
    set({ search: q });
  },
  requestQuickAdd() {
    set((s) => ({ focusQuickAdd: s.focusQuickAdd + 1 }));
  },
  setTaskList(l) {
    set({ taskList: l });
  },
  setTagFilter(t) {
    set({ tagFilter: t });
  },
  setRenaming(id) {
    set({ renamingNoteId: id });
  },
}));

export const toast = (t: Parameters<UiState['toast']>[0]) => useUi.getState().toast(t);
