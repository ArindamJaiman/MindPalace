import { Fragment } from 'react';
import { useStore } from '../store/store';
import { navigate } from '../hooks/useRoute';
import { findNoteByTitle } from '../lib/links';

/** Renders a task title, turning [[Note]] references into clickable links. */
export function TaskTitle({ title }: { title: string }) {
  const notes = useStore((s) => s.notes);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of title.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(<Fragment key={last}>{title.slice(last, idx)}</Fragment>);
    const target = m[1].trim();
    const exists = !!findNoteByTitle(notes, target);
    parts.push(
      <a
        key={idx}
        href="#"
        className={`task-link${exists ? '' : ' unresolved'}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          useStore.getState().openOrCreateByTitle(target);
          navigate('notes');
        }}
      >
        {m[2] ?? target}
      </a>,
    );
    last = idx + m[0].length;
  }
  if (last < title.length) parts.push(<Fragment key={last}>{title.slice(last)}</Fragment>);
  return <>{parts}</>;
}
