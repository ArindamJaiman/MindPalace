import { uid, useStore } from '../store/store';
import type { AttachmentMeta } from '../store/types';
import { saveAttachmentBlob } from './attachments';

const TEXT_EXT = /\.(md|markdown|mdown|txt|text)$/i;

export function isTextFile(f: File) {
  return TEXT_EXT.test(f.name) || f.type === 'text/markdown' || f.type === 'text/plain';
}

export function findAttachment(name: string): AttachmentMeta | undefined {
  const n = name.trim().toLowerCase();
  return Object.values(useStore.getState().attachments).find((a) => a.name.toLowerCase() === n);
}

function uniqueAttachmentName(name: string): string {
  if (!findAttachment(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; ; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!findAttachment(candidate)) return candidate;
  }
}

export async function saveAttachment(file: File | Blob, name?: string): Promise<AttachmentMeta> {
  const fallback = file instanceof File ? file.name : `pasted-${Date.now()}.${(file.type.split('/')[1] || 'bin').replace('jpeg', 'jpg')}`;
  const meta: AttachmentMeta = {
    id: uid(),
    name: uniqueAttachmentName(name ?? fallback),
    type: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: Date.now(),
  };
  await saveAttachmentBlob(meta.id, file);
  useStore.getState().addAttachment(meta);
  return meta;
}

export interface ImportResult {
  noteIds: string[];
  attachments: AttachmentMeta[];
}

/** Turn dropped/picked files into notes (text) and attachments (everything else). */
export async function importFiles(files: Iterable<File>, defaultFolder = 'Imported'): Promise<ImportResult> {
  const store = useStore.getState();
  const result: ImportResult = { noteIds: [], attachments: [] };
  for (const file of files) {
    if (isTextFile(file)) {
      const text = await file.text();
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const folder = rel && rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : defaultFolder;
      const title = file.name.replace(TEXT_EXT, '');
      const note = store.createNote({ title, folder, content: text }, false);
      result.noteIds.push(note.id);
    } else {
      result.attachments.push(await saveAttachment(file));
    }
  }
  return result;
}

export function embedFor(meta: AttachmentMeta): string {
  return `![[${meta.name}]]`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFiles(opts: { accept?: string; multiple?: boolean; directory?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.multiple ?? true;
    if (opts.accept) input.accept = opts.accept;
    if (opts.directory) input.setAttribute('webkitdirectory', '');
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.click();
  });
}
