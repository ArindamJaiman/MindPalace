import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { useStore } from '../store/store';
import { embedFor, saveAttachment } from '../lib/files';
import { sfx } from '../lib/sound';

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700', color: 'var(--h1)' },
  { tag: t.heading2, fontSize: '1.4em', fontWeight: '700', color: 'var(--h2)' },
  { tag: t.heading3, fontSize: '1.2em', fontWeight: '600', color: 'var(--h3)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600', color: 'var(--h3)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--text-strong)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-faint)' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-faint)' },
  { tag: t.monospace, fontFamily: 'var(--mono)', color: '#ff9ecf', fontSize: '0.92em' },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--text-faint)' },
]);

const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--text)', fontSize: '15.5px', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: '1.75', overflow: 'auto' },
    '.cm-content': { padding: '8px 0 40vh', caretColor: 'var(--accent)', maxWidth: '760px', margin: '0 auto' },
    '.cm-line': { padding: '0 4px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent) !important',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: '6px' },
    '.cm-gutters': { display: 'none' },
    '.cm-tooltip': { background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: '10px', overflow: 'hidden' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important', fontFamily: 'var(--font)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--accent) !important', color: 'white' },
  },
  { dark: true },
);

/** Image paste/drop straight into the editor: stored as an attachment, embedded at the cursor. */
function attachmentHandlers() {
  const insertFiles = async (view: EditorView, files: File[], pos?: number) => {
    const embeds: string[] = [];
    for (const f of files) embeds.push(embedFor(await saveAttachment(f)));
    if (!embeds.length) return;
    const at = pos ?? view.state.selection.main.head;
    const text = `\n${embeds.join('\n')}\n`;
    view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
    sfx.pop(1.2);
  };
  return EditorView.domEventHandlers({
    paste(e, view) {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return false;
      e.preventDefault();
      void insertFiles(view, files);
      return true;
    },
  });
}

interface Props {
  noteId: string;
  content: string;
  onChange: (v: string) => void;
}

export function NoteEditor({ noteId, content, onChange }: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);

  const linkCompletion = useMemo(
    () =>
      autocompletion({
        override: [
          (ctx: CompletionContext): CompletionResult | null => {
            const m = ctx.matchBefore(/!?\[\[[^\]\n]*/);
            if (!m) return null;
            const start = m.from + m.text.indexOf('[[') + 2;
            const { notes, attachments } = useStore.getState();
            const embed = m.text.startsWith('!');
            const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
            const close = after === ']]' ? '' : ']]';
            const options = [
              ...Object.values(notes)
                .filter((n) => n.id !== noteId)
                .map((n) => ({ label: n.title, type: 'text', detail: n.folder || 'note', apply: n.title + close, boost: 1 })),
              ...(embed
                ? Object.values(attachments).map((a) => ({ label: a.name, type: 'variable', detail: 'file', apply: a.name + close }))
                : []),
            ];
            return { from: start, options, validFor: /^[^\]\n]*$/ };
          },
        ],
        icons: false,
      }),
    [noteId],
  );

  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      syntaxHighlighting(highlight),
      theme,
      linkCompletion,
      attachmentHandlers(),
    ],
    [linkCompletion],
  );

  // Scroll to a heading when the outline asks for it.
  useEffect(() => {
    const onGoto = (e: Event) => {
      const view = ref.current?.view;
      const line = (e as CustomEvent<{ line: number }>).detail.line;
      if (!view) return;
      const pos = view.state.doc.line(Math.min(line + 1, view.state.doc.lines)).from;
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) });
      view.focus();
    };
    window.addEventListener('mp:goto-heading', onGoto);
    return () => window.removeEventListener('mp:goto-heading', onGoto);
  }, []);

  return (
    <CodeMirror
      ref={ref}
      key={noteId}
      value={content}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        searchKeymap: true,
        bracketMatching: false,
        closeBrackets: true,
        highlightActiveLine: true,
      }}
      className="note-editor"
      height="100%"
    />
  );
}
