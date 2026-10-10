import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from '../gsap';
import { useStore } from '../../store/store';
import { toast, useUi } from '../../store/ui';
import { NoteReader } from '../../views/NoteReader';
import { backlinksFor, wordCount } from '../../lib/links';
import { embedFor, pickFiles, saveAttachment } from '../../lib/files';
import { sfx } from '../../lib/sound';
import { scrollToSection, useTerm } from '../state';

const NoteEditor = lazy(() => import('../../views/NoteEditor').then((m) => ({ default: m.NoteEditor })));

function TitleInput({ id, title }: { id: string; title: string }) {
  const [v, setV] = useState(title);
  useEffect(() => setV(title), [title]);
  const commit = () => {
    if (!v.trim() || v === title) return setV(title);
    if (!useStore.getState().renameNote(id, v)) {
      toast({ kind: 'error', title: 'mv: target exists' });
      setV(title);
    }
  };
  return (
    <input
      className="nano-title"
      value={v}
      spellCheck={false}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

/** `less`-style reader with a nano-style editor, full screen over the page. */
export function Pager() {
  const pager = useTerm((s) => s.pager);
  const { openNote, closePager } = useTerm.getState();
  const note = useStore((s) => (pager ? s.notes[pager.noteId] : undefined));
  const notes = useStore((s) => s.notes);
  const [armed, setArmed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const backlinks = useMemo(() => (note ? backlinksFor(notes, note) : []), [notes, note]);
  const mode = pager?.mode ?? 'read';

  // Following a [[link]] inside the reader opens (or creates) that note: show it here.
  useEffect(
    () =>
      useStore.subscribe((s, p) => {
        if (useTerm.getState().pager && s.activeNoteId && s.activeNoteId !== p.activeNoteId) openNote(s.activeNoteId);
      }),
    [openNote],
  );

  useEffect(() => {
    if (!pager || !rootRef.current) return;
    gsap.fromTo(rootRef.current, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.35, ease: 'power3.out' });
    bodyRef.current?.scrollTo(0, 0);
  }, [pager?.noteId]);

  useEffect(() => {
    if (!pager) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, .cm-editor');
      if (mode === 'edit') {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          sfx.granted(1);
          toast({ kind: 'success', title: `[ wrote ${note?.content.split('\n').length ?? 0} lines ]` });
        }
        if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') || e.key === 'Escape') {
          e.preventDefault();
          openNote(pager.noteId, 'read');
        }
        return;
      }
      if (typing) return;
      if (e.key === 'q' || e.key === 'Escape') closePager();
      if (e.key === 'e') {
        e.preventDefault();
        openNote(pager.noteId, 'edit');
      }
      if (e.key === 'j') bodyRef.current?.scrollBy({ top: 80 });
      if (e.key === 'k') bodyRef.current?.scrollBy({ top: -80 });
      if (e.key === ' ') {
        e.preventDefault();
        bodyRef.current?.scrollBy({ top: bodyRef.current.clientHeight * 0.9, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pager, mode, note, openNote, closePager]);

  if (!pager || !note) return null;
  const path = `~/vault/${note.folder ? `${note.folder}/` : ''}${note.title}.md`;

  return (
    <div className="pager" ref={rootRef} role="dialog" aria-label={note.title}>
      {mode === 'read' ? (
        <>
          <div className="pg-head">
            <span>
              <span className="pr">less</span> {path}
            </span>
            <span className="pg-keys">
              <button className="t-btn" onClick={() => openNote(note.id, 'edit')} data-cursor="EDIT">
                [e] edit
              </button>
              <button
                className={`t-btn red${armed ? ' armed' : ''}`}
                data-cursor="DELETE"
                onClick={() => {
                  if (!armed) {
                    setArmed(true);
                    setTimeout(() => setArmed(false), 2500);
                    return;
                  }
                  const removed = useStore.getState().deleteNote(note.id);
                  closePager();
                  sfx.denied();
                  if (removed) toast({ kind: 'info', title: `rm ${removed.title}.md`, action: { label: 'undo', run: () => useStore.getState().restoreNote(removed) } });
                }}
              >
                {armed ? '[ confirm rm ]' : '[d] rm'}
              </button>
              <button className="t-btn" onClick={closePager} data-cursor="QUIT">
                [q] quit
              </button>
            </span>
          </div>
          <div
            className="pg-body"
            ref={bodyRef}
            onClickCapture={(e) => {
              // #tags grep the vault instead of opening the Forge sidebar.
              const tag = (e.target as HTMLElement).closest('a.tag') as HTMLElement | null;
              if (!tag) return;
              e.preventDefault();
              e.stopPropagation();
              useUi.getState().setSearch(`#${tag.dataset.tag}`);
              closePager();
              scrollToSection('notes');
            }}
          >
            <h1 className="pg-title"># {note.title}</h1>
            <NoteReader noteId={note.id} content={note.content} />
            <div className="pg-refs">
              <div className="dim">── referenced by ({backlinks.length}) ──</div>
              {backlinks.length === 0 && <div className="dim">no inbound links.</div>}
              {backlinks.map((b) => (
                <button key={b.note.id} className="t-btn link" onClick={() => openNote(b.note.id)} data-cursor="OPEN">
                  ← {b.note.title}.md
                </button>
              ))}
            </div>
            <div className="pg-end">
              <span>(END)</span>
            </div>
          </div>
          <div className="pg-foot dim">
            {wordCount(note.content)} words · {note.content.length} bytes · <kbd>j</kbd>/<kbd>k</kbd> scroll · <kbd>space</kbd> page · <kbd>e</kbd> edit · <kbd>q</kbd> quit
          </div>
        </>
      ) : (
        <div className="nano">
          <div className="nano-head">
            <span>GNU nano 7.2</span>
            <span className="nano-path">
              ~/vault/{note.folder ? `${note.folder}/` : ''}
              <TitleInput id={note.id} title={note.title} />
              .md
            </span>
            <span className="dim">autosave</span>
          </div>
          <div className="nano-body">
            <Suspense fallback={<div className="dim">loading editor…</div>}>
              <NoteEditor noteId={note.id} content={note.content} onChange={(v) => useStore.getState().updateNote(note.id, { content: v })} />
            </Suspense>
          </div>
          <div className="nano-foot">
            <button className="t-btn" onClick={() => toast({ kind: 'success', title: 'saved (autosave is always on)' })}>
              <b>^S</b> Save
            </button>
            <button className="t-btn" onClick={() => openNote(note.id, 'read')}>
              <b>^X</b> Exit
            </button>
            <button
              className="t-btn"
              onClick={async () => {
                const files = await pickFiles({ accept: 'image/*,application/pdf,.md,.txt' });
                if (!files.length) return;
                const embeds: string[] = [];
                for (const f of files) embeds.push(embedFor(await saveAttachment(f)));
                useStore.getState().updateNote(note.id, { content: `${note.content.replace(/\s*$/, '')}\n\n${embeds.join('\n')}\n` });
                sfx.granted(1);
              }}
            >
              <b>^R</b> Insert file
            </button>
            <span className="dim">[[ autocompletes links · paste images inline</span>
          </div>
        </div>
      )}
    </div>
  );
}
