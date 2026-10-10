export interface Note {
  id: string;
  title: string;
  content: string;
  /** Folder path like "Projects/Web"; "" is the vault root. */
  folder: string;
  createdAt: number;
  updatedAt: number;
}

export type Priority = 0 | 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  details: string;
  done: boolean;
  priority: Priority;
  tags: string[];
  createdAt: number;
  completedAt?: number;
  due?: number;
  /** Whether `due` carries a meaningful time of day (vs. just a date). */
  dueHasTime?: boolean;
  remindAt?: number;
  reminded?: boolean;
  updatedAt?: number;
}

export interface Completion {
  taskId: string;
  title: string;
  at: number;
  tags: string[];
  priority: Priority;
  xp: number;
}

/** Stable id for a completion row (a task can be completed, undone and completed again). */
export const completionKey = (c: Pick<Completion, 'taskId' | 'at'>) => `${c.taskId}@${c.at}`;

/** When something was deleted locally, so the deletion can be synced. */
export interface Tombstones {
  notes: Record<string, number>;
  tasks: Record<string, number>;
  completions: Record<string, number>;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
  kind: 'reminder' | 'achievement' | 'info';
  link?: string;
}

export type CursorStyle = 'comet' | 'ribbon' | 'minimal' | 'off';
export type NoteMode = 'edit' | 'read' | 'split';

export interface Settings {
  name: string;
  accent: string;
  cursor: CursorStyle;
  cursorMorph: boolean;
  sound: boolean;
  volume: number;
  reduceMotion: boolean;
  notifications: boolean;
  noteMode: NoteMode;
  leftOpen: boolean;
  rightOpen: boolean;
}

export interface FidgetStats {
  pops: number;
  flips: number;
  bestRpm: number;
  switches: number;
  buttonPresses: number;
  squishes: number;
}
