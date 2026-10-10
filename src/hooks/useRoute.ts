import { useSyncExternalStore } from 'react';

export const VIEWS = ['tasks', 'notes', 'graph', 'orbit', 'fidget', 'settings'] as const;
export type View = (typeof VIEWS)[number];

function read(): View {
  const v = location.hash.replace(/^#\/?/, '').split('/')[0] as View;
  return VIEWS.includes(v) ? v : 'tasks';
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): View {
  return useSyncExternalStore(subscribe, read, () => 'tasks' as View);
}

export function navigate(view: View) {
  if (read() !== view || !location.hash) location.hash = `/${view}`;
}
