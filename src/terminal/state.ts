import { create } from 'zustand';

export type SectionId = 'boot' | 'tasks' | 'notes' | 'recon' | 'net' | 'logs' | 'sys';

export const SECTIONS: { id: SectionId; label: string; path: string }[] = [
  { id: 'boot', label: 'boot', path: '~' },
  { id: 'tasks', label: 'tasks', path: '~/tasks' },
  { id: 'notes', label: 'vault', path: '~/vault' },
  { id: 'recon', label: 'recon', path: '~/recon' },
  { id: 'net', label: 'netmap', path: '~/netmap' },
  { id: 'logs', label: 'logs', path: '/var/log' },
  { id: 'sys', label: 'sys', path: '/etc/palace' },
];

export type Tone = 'dim' | 'red' | 'blue' | 'bright' | 'ok';

export interface OutLine {
  id: number;
  text: string;
  tone?: Tone;
}

export interface Overlay {
  kind: 'rank' | 'cleared';
  title: string;
  sub?: string;
}

interface TermState {
  section: SectionId;
  pager: { noteId: string; mode: 'read' | 'edit' } | null;
  overlay: Overlay | null;
  output: OutLine[];
  shellFocus: number;
  setSection(s: SectionId): void;
  openNote(noteId: string, mode?: 'read' | 'edit'): void;
  closePager(): void;
  showOverlay(o: Overlay): void;
  clearOverlay(): void;
  print(lines: (string | Omit<OutLine, 'id'>)[]): void;
  clearOutput(): void;
  focusShell(): void;
}

let lineId = 0;

export const useTerm = create<TermState>()((set) => ({
  section: 'boot',
  pager: null,
  overlay: null,
  output: [],
  shellFocus: 0,
  setSection: (section) => set({ section }),
  openNote: (noteId, mode = 'read') => set({ pager: { noteId, mode } }),
  closePager: () => set({ pager: null }),
  showOverlay: (overlay) => set({ overlay }),
  clearOverlay: () => set({ overlay: null }),
  print: (lines) =>
    set((s) => ({
      output: [...s.output, ...lines.map((l) => (typeof l === 'string' ? { id: ++lineId, text: l } : { ...l, id: ++lineId }))].slice(-200),
    })),
  clearOutput: () => set({ output: [] }),
  focusShell: () => set((s) => ({ shellFocus: s.shellFocus + 1 })),
}));

/** Short process-style id for a task, used in the table and in shell commands. */
export const pid = (id: string) => id.replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();

export function userHandle(name: string): string {
  return (name || 'operator').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'operator';
}

export function scrollToSection(id: SectionId) {
  document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
