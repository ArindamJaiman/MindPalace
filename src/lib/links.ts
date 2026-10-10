import type { Note } from '../store/types';

export const WIKILINK_RE = /(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g;
export const TAG_RE = /(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu;

/** Blank out fenced code blocks and inline code so links/tags inside them are ignored. */
export function stripCode(md: string): string {
  return md
    .replace(/```[\s\S]*?(```|$)/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

export function extractLinks(md: string): { target: string; embed: boolean }[] {
  const out: { target: string; embed: boolean }[] = [];
  for (const m of stripCode(md).matchAll(WIKILINK_RE)) {
    out.push({ target: m[2].trim(), embed: m[1] === '!' });
  }
  return out;
}

export function extractTags(md: string): string[] {
  const set = new Set<string>();
  for (const m of stripCode(md).matchAll(TAG_RE)) set.add(m[2].toLowerCase());
  return [...set];
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export function extractHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  stripCode(md)
    .split('\n')
    .forEach((line, i) => {
      const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
      if (m) out.push({ level: m[1].length, text: m[2], line: i });
    });
  return out;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

export function findNoteByTitle(notes: Record<string, Note>, title: string): Note | undefined {
  const t = title.trim().toLowerCase();
  for (const n of Object.values(notes)) if (n.title.toLowerCase() === t) return n;
  return undefined;
}

export interface Backlink {
  note: Note;
  snippets: string[];
}

export function backlinksFor(notes: Record<string, Note>, target: Note): Backlink[] {
  const t = target.title.toLowerCase();
  const out: Backlink[] = [];
  for (const n of Object.values(notes)) {
    if (n.id === target.id) continue;
    const snippets: string[] = [];
    for (const line of n.content.split('\n')) {
      for (const m of line.matchAll(WIKILINK_RE)) {
        if (m[2].trim().toLowerCase() === t) {
          snippets.push(line.trim());
          break;
        }
      }
    }
    if (snippets.length) out.push({ note: n, snippets });
  }
  return out.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
}

/** Rewrite [[Old]], [[Old|alias]] and [[Old#heading]] to point at a renamed note. */
export function renameLinks(md: string, oldTitle: string, newTitle: string): string {
  const esc = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return md.replace(new RegExp(`(!?\\[\\[)\\s*${esc}\\s*(?=[\\]|#])`, 'gi'), `$1${newTitle}`);
}

/** Stable, pleasant hue for any string (used for tag colors). */
export function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Tags draw from a fixed forge palette (fire, steel, signal colours) rather than any hue. */
const TAG_PALETTE = ['#ff8a3d', '#ffb020', '#ff5a4a', '#22d3ee', '#3ddc84', '#9fb3c8', '#f5d06f', '#5eead4'];

export function tagColor(tag: string): string {
  return TAG_PALETTE[hueFor(tag) % TAG_PALETTE.length];
}

export function wordCount(md: string): number {
  const m = md.trim().match(/\S+/g);
  return m ? m.length : 0;
}
