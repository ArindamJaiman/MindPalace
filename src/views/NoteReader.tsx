import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { renderMarkdown, toggleCheckboxInSource } from '../lib/markdown';
import { attachmentUrl, formatBytes } from '../lib/attachments';
import { findAttachment } from '../lib/files';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';

interface Props {
  noteId: string;
  content: string;
}

export function NoteReader({ noteId, content }: Props) {
  const notes = useStore((s) => s.notes);
  const attachments = useStore((s) => s.attachments);
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(content, notes), [content, notes]);

  // Resolve ![[file]] embeds to blob URLs (async, from IndexedDB).
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    root.querySelectorAll<HTMLElement>('[data-attachment]').forEach(async (el) => {
      const name = el.dataset.attachment!;
      const meta = findAttachment(name);
      if (!meta) {
        el.classList.add('missing');
        if (el.tagName === 'IMG') el.replaceWith(Object.assign(document.createElement('span'), { className: 'embed-missing', textContent: `Missing file: ${name}` }));
        return;
      }
      const url = await attachmentUrl(meta.id);
      if (cancelled || !url) return;
      if (el instanceof HTMLImageElement) {
        el.src = url;
        el.onload = () => el.classList.add('loaded');
      } else if (meta.type === 'application/pdf') {
        el.outerHTML = `<div class="embed-pdf"><iframe src="${url}" title="${meta.name}"></iframe></div>`;
      } else {
        el.innerHTML = '';
        const a = Object.assign(document.createElement('a'), { href: url, download: meta.name, className: 'embed-file-link' });
        a.textContent = `📎 ${meta.name} · ${formatBytes(meta.size)}`;
        el.appendChild(a);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html, attachments]);

  // Scroll to a heading when the outline asks for it.
  useEffect(() => {
    const onGoto = (e: Event) => {
      const i = (e as CustomEvent<{ index: number }>).detail.index;
      const h = ref.current?.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')[i] as HTMLElement | undefined;
      if (!h) return;
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h.classList.remove('flash');
      void h.offsetWidth;
      h.classList.add('flash');
    };
    window.addEventListener('mp:goto-heading', onGoto);
    return () => window.removeEventListener('mp:goto-heading', onGoto);
  }, []);

  const onClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const store = useStore.getState();

    const check = target.closest('input.md-check') as HTMLInputElement | null;
    if (check) {
      e.preventDefault();
      const idx = Number(check.dataset.task);
      const wasChecked = check.hasAttribute('checked');
      store.updateNote(noteId, { content: toggleCheckboxInSource(content, idx) });
      if (!wasChecked) {
        sfx.complete(1);
        fx.burstAt(check, { count: 16, speed: 4 });
      } else sfx.uncomplete();
      return;
    }

    const link = target.closest('a.wikilink') as HTMLElement | null;
    if (link) {
      e.preventDefault();
      store.openOrCreateByTitle(link.dataset.target!);
      sfx.softClick();
      return;
    }

    const tag = target.closest('a.tag') as HTMLElement | null;
    if (tag) {
      e.preventDefault();
      const ui = useUi.getState();
      ui.setSearch(`#${tag.dataset.tag}`);
      ui.setTagFilter(tag.dataset.tag!);
      store.setSettings({ leftOpen: true });
      return;
    }

    const copy = target.closest('.copy-btn') as HTMLButtonElement | null;
    if (copy) {
      const code = copy.parentElement?.querySelector('code')?.textContent ?? '';
      void navigator.clipboard?.writeText(code);
      copy.textContent = 'Copied!';
      fx.sparkle(e.clientX, e.clientY);
      sfx.tick();
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    }
  };

  return <div ref={ref} className="markdown-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
