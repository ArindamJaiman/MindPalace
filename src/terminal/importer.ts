import { useStore } from '../store/store';
import { toast } from '../store/ui';
import { embedFor, importFiles } from '../lib/files';
import { sfx } from '../lib/sound';
import { fx } from '../lib/fx';
import { useTerm } from './state';

/** Upload files into the vault: text becomes notes, everything else becomes an embedded attachment. */
export async function importIntoVault(files: File[]) {
  if (!files.length) return;
  const term = useTerm.getState();
  term.print([{ text: `[*] receiving ${files.length} file${files.length > 1 ? 's' : ''}…`, tone: 'blue' }]);
  const res = await importFiles(files);
  const store = useStore.getState();
  let openId = res.noteIds[res.noteIds.length - 1];
  if (res.attachments.length) {
    const embeds = res.attachments.map(embedFor).join('\n\n');
    const open = term.pager ? store.notes[term.pager.noteId] : undefined;
    if (open) {
      store.updateNote(open.id, { content: `${open.content.replace(/\s*$/, '')}\n\n${embeds}\n` });
      openId = open.id;
    } else {
      const title = res.attachments.length === 1 ? res.attachments[0].name.replace(/\.[^.]+$/, '') : `upload-${new Date().toISOString().slice(0, 10)}`;
      openId = store.createNote({ title, folder: 'Imported', content: `${embeds}\n` }, false).id;
    }
  }
  sfx.granted(2);
  fx.confetti(0.3);
  term.print([
    ...res.noteIds.map((id) => ({ text: `[+] ~/vault/${store.notes[id]?.folder ?? ''}/${store.notes[id]?.title ?? id}.md`, tone: 'ok' as const })),
    ...res.attachments.map((a) => ({ text: `[+] blob ${a.name} (${a.size} bytes)`, tone: 'ok' as const })),
    { text: 'transfer complete.', tone: 'bright' },
  ]);
  toast({ kind: 'success', title: `scp: ${res.noteIds.length} notes, ${res.attachments.length} files`, body: 'written to ~/vault/Imported' });
  if (openId) term.openNote(openId);
}
