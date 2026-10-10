import { useMemo, useRef, useState } from 'react';
import { gsap, useGSAP } from '../gsap';
import { SectionHead } from '../components/SectionHead';
import { useStore } from '../../store/store';
import { useUi } from '../../store/ui';
import type { Note } from '../../store/types';
import { relativeTime } from '../../lib/dates';
import { pickFiles } from '../../lib/files';
import { sfx } from '../../lib/sound';
import { useTerm } from '../state';
import { importIntoVault } from '../importer';

interface TreeLine {
  key: string;
  prefix: string;
  kind: 'dir' | 'file';
  label: string;
  note?: Note;
  path: string;
}

const size = (n: number) => (n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}K`);

function buildTree(folders: string[], notes: Note[]): TreeLine[] {
  interface Dir {
    name: string;
    path: string;
    dirs: Map<string, Dir>;
    notes: Note[];
  }
  const root: Dir = { name: '', path: '', dirs: new Map(), notes: [] };
  const ensure = (path: string): Dir => {
    let d = root;
    for (const part of path.split('/').filter(Boolean)) {
      if (!d.dirs.has(part)) d.dirs.set(part, { name: part, path: d.path ? `${d.path}/${part}` : part, dirs: new Map(), notes: [] });
      d = d.dirs.get(part)!;
    }
    return d;
  };
  folders.forEach(ensure);
  for (const n of notes) ensure(n.folder).notes.push(n);

  const out: TreeLine[] = [];
  const walk = (d: Dir, indent: string) => {
    const dirs = [...d.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...d.notes].sort((a, b) => a.title.localeCompare(b.title));
    const items = [...dirs.map((x) => ({ dir: x })), ...files.map((n) => ({ note: n }))];
    items.forEach((it, i) => {
      const lastItem = i === items.length - 1;
      const branch = lastItem ? '└── ' : '├── ';
      if ('dir' in it && it.dir) {
        out.push({ key: `d:${it.dir.path}`, prefix: indent + branch, kind: 'dir', label: `${it.dir.name}/`, path: it.dir.path });
        walk(it.dir, indent + (lastItem ? '    ' : '│   '));
      } else if ('note' in it && it.note) {
        out.push({ key: it.note.id, prefix: indent + branch, kind: 'file', label: `${it.note.title}.md`, note: it.note, path: it.note.folder });
      }
    });
  };
  walk(root, '');
  return out;
}

function Grep({ query }: { query: string }) {
  const notes = useStore((s) => s.notes);
  const openNote = useTerm((s) => s.openNote);
  const hits = useMemo(() => {
    const q = query.toLowerCase();
    const out: { note: Note; line: number; text: string }[] = [];
    for (const n of Object.values(notes)) {
      if (n.title.toLowerCase().includes(q)) out.push({ note: n, line: 0, text: n.title });
      n.content.split('\n').forEach((text, i) => {
        if (text.toLowerCase().includes(q)) out.push({ note: n, line: i + 1, text });
      });
    }
    return out.slice(0, 60);
  }, [notes, query]);

  const q = query.toLowerCase();
  if (!hits.length) return <div className="dim">grep: no matches for "{query}"</div>;
  return (
    <div className="grep">
      {hits.map((h, i) => {
        const idx = h.text.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const snippet = h.text.slice(start, idx + q.length + 60);
        const j = idx - start;
        return (
          <button key={i} className="grep-hit" onClick={() => openNote(h.note.id)} data-cursor="OPEN">
            <span className="blue">{(h.note.folder ? `${h.note.folder}/` : '') + h.note.title}.md</span>
            <span className="dim">:{h.line || 'title'}:</span> {snippet.slice(0, j)}
            <span className="red bright">{snippet.slice(j, j + q.length)}</span>
            {snippet.slice(j + q.length)}
          </button>
        );
      })}
    </div>
  );
}

export function NotesSection({ reduce }: { reduce: boolean }) {
  const notes = useStore((s) => s.notes);
  const folders = useStore((s) => s.folders);
  const { search, setSearch } = useUi();
  const openNote = useTerm((s) => s.openNote);
  const [mkdir, setMkdir] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const lines = useMemo(() => buildTree(folders, Object.values(notes)), [folders, notes]);
  const total = Object.values(notes).reduce((n, x) => n + x.content.length, 0);

  useGSAP(
    () => {
      if (reduce) return;
      gsap.from('.tree-line', {
        opacity: 0,
        x: -14,
        duration: 0.3,
        stagger: 0.03,
        ease: 'power2.out',
        scrollTrigger: { trigger: '.tree', start: 'top 88%', once: true },
      });
    },
    { scope: root, dependencies: [] },
  );

  return (
    <section className="sec" id="sec-notes" ref={root}>
      <SectionHead index="02" title="VAULT" path="~/vault" cmd={search ? `grep -ri "${search}" .` : 'tree -h ~/vault'} reduce={reduce} />

      <div className="v-tools">
        <label className="v-grep">
          <span className="dim">grep -ri </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='"pattern"' spellCheck={false} />
          {search && (
            <button className="t-btn" onClick={() => setSearch('')}>
              [x]
            </button>
          )}
        </label>
        <button
          className="t-btn"
          data-cursor="CREATE"
          onClick={() => {
            const n = useStore.getState().createNote({}, false);
            sfx.granted(1);
            openNote(n.id, 'edit');
          }}
        >
          [ touch new.md ]
        </button>
        <button className="t-btn" data-cursor="MKDIR" onClick={() => setMkdir('')}>
          [ mkdir ]
        </button>
        <button
          className="t-btn"
          data-cursor="UPLOAD"
          onClick={async () => {
            const files = await pickFiles({ accept: '.md,.markdown,.txt,image/*,application/pdf' });
            if (files.length) void importIntoVault(files);
          }}
        >
          [ scp ↑ files ]
        </button>
        <button
          className="t-btn"
          data-cursor="UPLOAD"
          onClick={async () => {
            const files = await pickFiles({ directory: true });
            if (files.length) void importIntoVault(files);
          }}
        >
          [ scp -r ↑ dir ]
        </button>
      </div>
      {mkdir !== null && (
        <label className="v-mkdir">
          <span className="pr">$ </span>mkdir -p ~/vault/
          <input
            autoFocus
            value={mkdir}
            onChange={(e) => setMkdir(e.target.value)}
            onBlur={() => setMkdir(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mkdir.trim()) {
                useStore.getState().createFolder(mkdir.trim());
                sfx.granted(1);
                setMkdir(null);
              }
              if (e.key === 'Escape') setMkdir(null);
            }}
          />
        </label>
      )}

      {search ? (
        <Grep query={search} />
      ) : (
        <div className="tree">
          <div className="tree-line root">
            <span className="blue bright">~/vault</span>
          </div>
          {lines.map((l) =>
            l.kind === 'dir' ? (
              <div key={l.key} className="tree-line">
                <span className="dim">{l.prefix}</span>
                <span className="blue bright">{l.label}</span>
              </div>
            ) : (
              <button key={l.key} className="tree-line file" onClick={() => openNote(l.note!.id)} data-cursor="CAT">
                <span className="dim">{l.prefix}</span>
                <span className="t-file">{l.label}</span>
                <span className="t-meta dim">
                  {size(l.note!.content.length).padStart(6)} {relativeTime(l.note!.updatedAt).padStart(10)}
                </span>
              </button>
            ),
          )}
          <div className="tree-line dim">
            {'\n'}
            {folders.length} directories, {Object.keys(notes).length} files, {size(total)} total
          </div>
        </div>
      )}
      <div className="v-hint dim">tip: drop .md / images / whole folders anywhere on this page to upload them.</div>
    </section>
  );
}
