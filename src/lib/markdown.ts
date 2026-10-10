import { Marked, type TokenizerAndRendererExtension } from 'marked';
import DOMPurify from 'dompurify';
import type { Note } from '../store/types';
import { findNoteByTitle } from './links';

/**
 * Obsidian-flavoured markdown: [[wikilinks]], ![[embeds]], #tags, ==highlights==,
 * > [!callouts] and clickable task checkboxes.
 */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

let ctxNotes: Record<string, Note> = {};

const wikilink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src) {
    const i = src.search(/!?\[\[/);
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/.exec(src);
    if (!m) return undefined;
    return { type: 'wikilink', raw: m[0], embed: m[1] === '!', target: m[2].trim(), heading: m[3] ?? '', alias: m[4] };
  },
  renderer(tok) {
    const target = tok.target as string;
    if (tok.embed) {
      if (IMAGE_EXT.test(target)) return `<img class="embed-img" data-attachment="${esc(target)}" alt="${esc(target)}">`;
      if (/\.[a-z0-9]{2,5}$/i.test(target) && !findNoteByTitle(ctxNotes, target))
        return `<span class="embed-file" data-attachment="${esc(target)}">${esc(target)}</span>`;
      return `<div class="embed-note" data-note="${esc(target)}"></div>`;
    }
    const exists = !!findNoteByTitle(ctxNotes, target);
    const label = (tok.alias as string | undefined) ?? target + (tok.heading ? ` › ${(tok.heading as string).slice(1)}` : '');
    return `<a href="#" class="wikilink${exists ? '' : ' unresolved'}" data-target="${esc(target)}">${esc(label)}</a>`;
  },
};

const tag: TokenizerAndRendererExtension = {
  name: 'tag',
  level: 'inline',
  start(src) {
    const m = /(^|\s)#[\p{L}_]/u.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src) {
    const m = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u.exec(src);
    if (!m) return undefined;
    return { type: 'tag', raw: m[0], tag: m[1] };
  },
  renderer(tok) {
    return `<a href="#" class="tag" data-tag="${esc((tok.tag as string).toLowerCase())}">#${esc(tok.tag as string)}</a>`;
  },
};

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start(src) {
    const i = src.indexOf('==');
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^==(?=\S)([^\n]*?\S)==/.exec(src);
    if (!m) return undefined;
    return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(tok) {
    return `<mark>${this.parser.parseInline(tok.tokens ?? [])}</mark>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  extensions: [wikilink, tag, highlight],
  renderer: {
    checkbox({ checked }) {
      return `<input type="checkbox" class="md-check"${checked ? ' checked' : ''}> `;
    },
  },
});

const ICONS: Record<string, string> = {
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  success: '<path d="M20 6 9 17l-5-5"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
};
const ALIASES: Record<string, string> = {
  abstract: 'info', summary: 'info', todo: 'info', hint: 'tip', important: 'tip', check: 'success', done: 'success',
  caution: 'warning', attention: 'warning', error: 'danger', bug: 'danger', failure: 'danger', fail: 'danger',
  help: 'question', faq: 'question', cite: 'quote', example: 'note',
};

function upgradeCallouts(root: HTMLElement) {
  root.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') return;
    const m = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)\n?([\s\S]*)$/.exec(first.innerHTML);
    if (!m) return;
    const raw = m[1].toLowerCase();
    const kind = ICONS[raw] ? raw : (ALIASES[raw] ?? 'note');
    const div = document.createElement('div');
    div.className = 'callout';
    div.dataset.callout = kind;
    const title = m[3].trim() || raw.charAt(0).toUpperCase() + raw.slice(1);
    div.innerHTML =
      `<div class="callout-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg><span>${title}</span></div>` +
      `<div class="callout-content"></div>`;
    const content = div.querySelector('.callout-content')!;
    if (m[4].trim()) {
      const p = document.createElement('p');
      p.innerHTML = m[4];
      content.appendChild(p);
    }
    first.remove();
    while (bq.firstChild) content.appendChild(bq.firstChild);
    bq.replaceWith(div);
  });
}

function decorate(root: HTMLElement, depth: number) {
  upgradeCallouts(root);

  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (/^https?:/i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.classList.add('external');
    }
  });

  root.querySelectorAll('input.md-check').forEach((input, i) => {
    (input as HTMLElement).dataset.task = String(i);
    input.closest('li')?.classList.add('task-li');
    if ((input as HTMLInputElement).checked) input.closest('li')?.classList.add('is-done');
  });

  root.querySelectorAll('pre').forEach((pre) => {
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    pre.replaceWith(wrap);
    wrap.append(btn, pre);
  });

  root.querySelectorAll<HTMLElement>('.embed-note').forEach((el) => {
    const title = el.dataset.note ?? '';
    const note = findNoteByTitle(ctxNotes, title);
    if (!note || depth > 0) {
      el.outerHTML = `<a href="#" class="wikilink${note ? '' : ' unresolved'}" data-target="${esc(title)}">${esc(title)}</a>`;
      return;
    }
    el.innerHTML =
      `<div class="embed-note-head"><a href="#" class="wikilink" data-target="${esc(note.title)}">${esc(note.title)}</a></div>` +
      `<div class="embed-note-body">${renderInner(note.content, depth + 1)}</div>`;
  });
}

function renderInner(md: string, depth: number): string {
  const html = marked.parse(md, { async: false }) as string;
  const body = DOMPurify.sanitize(html, { RETURN_DOM: true }) as HTMLElement;
  decorate(body, depth);
  return body.innerHTML;
}

export function renderMarkdown(md: string, notes: Record<string, Note>): string {
  ctxNotes = notes;
  return renderInner(md, 0);
}

/** Flip the nth task checkbox (document order, ignoring fenced code). */
export function toggleCheckboxInSource(md: string, index: number): string {
  const lines = md.split('\n');
  let inFence = false;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(lines[i]);
    if (!m) continue;
    if (n === index) {
      lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3] + lines[i].slice(m[0].length);
      return lines.join('\n');
    }
    n++;
  }
  return md;
}
