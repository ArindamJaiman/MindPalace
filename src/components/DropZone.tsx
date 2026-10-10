import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, FolderOpen, Image } from 'lucide-react';
import { useStore } from '../store/store';
import { toast } from '../store/ui';
import { embedFor, importFiles } from '../lib/files';
import { navigate } from '../hooks/useRoute';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';

const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);

async function walkEntry(entry: FileSystemEntry, prefix: string, out: File[]) {
  if (entry.name.startsWith('.') && entry.name !== '.') {
    if (entry.isDirectory || SKIP_DIRS.has(entry.name)) return;
  }
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    if (prefix) Object.defineProperty(file, 'webkitRelativePath', { value: prefix + file.name });
    out.push(file);
  } else if (entry.isDirectory) {
    if (SKIP_DIRS.has(entry.name)) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    // readEntries returns results in batches; keep reading until it's empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      children.push(...batch);
    }
    for (const child of children) await walkEntry(child, `${prefix}${entry.name}/`, out);
  }
}

/** Import files (from drop, picker or paste) and show the result with some fanfare. */
export async function importDropped(files: File[], entries?: FileSystemEntry[]) {
  let all = files;
  if (entries?.length) {
    all = [];
    for (const e of entries) await walkEntry(e, '', all);
  }
  if (!all.length) return;
  const res = await importFiles(all);
  const store = useStore.getState();

  if (res.attachments.length) {
    const embeds = res.attachments.map(embedFor).join('\n\n');
    const onNotes = location.hash.startsWith('#/notes');
    const active = store.activeNoteId ? store.notes[store.activeNoteId] : undefined;
    if (onNotes && active) {
      store.updateNote(active.id, { content: `${active.content.replace(/\s*$/, '')}\n\n${embeds}\n` });
    } else {
      const title = res.attachments.length === 1 ? res.attachments[0].name.replace(/\.[^.]+$/, '') : `Uploads ${new Date().toLocaleDateString()}`;
      store.createNote({ title, folder: 'Imported', content: `# ${title}\n\n${embeds}\n` });
    }
  }
  if (res.noteIds.length) store.openNote(res.noteIds[res.noteIds.length - 1]);
  navigate('notes');

  const parts = [];
  if (res.noteIds.length) parts.push(`${res.noteIds.length} note${res.noteIds.length > 1 ? 's' : ''}`);
  if (res.attachments.length) parts.push(`${res.attachments.length} file${res.attachments.length > 1 ? 's' : ''}`);
  sfx.chime();
  fx.confetti(0.35);
  toast({ kind: 'success', title: `Imported ${parts.join(' & ')} ✨`, body: 'Find them in the Imported folder.' });
}

export function DropZone() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const dt = e.dataTransfer!;
      // Entries must be grabbed synchronously, before the event finishes.
      const entries = [...dt.items]
        .filter((i) => i.kind === 'file')
        .map((i) => i.webkitGetAsEntry?.())
        .filter((x): x is FileSystemEntry => !!x);
      void importDropped([...dt.files], entries.some((en) => en.isDirectory) ? entries : undefined);
      fx.burst(e.clientX, e.clientY, { count: 40, speed: 8 });
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div className="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="dropzone-portal"
            initial={{ scale: 0.6, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="portal-ring" />
            <div className="portal-core">
              <div className="portal-icons">
                <FileText size={28} />
                <FolderOpen size={34} />
                <Image size={28} />
              </div>
              <div className="portal-title">Drop it into your MindPalace</div>
              <div className="portal-sub">.md & .txt become notes · images get embedded · whole folders work too</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
