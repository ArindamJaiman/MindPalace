import { useEffect, useRef, useState } from 'react';
import { gsap } from '../gsap';
import { useStore } from '../../store/store';
import { sfx } from '../../lib/sound';
import { complete, loadHistory, runCommand } from '../commands';
import { SECTIONS, useTerm, userHandle } from '../state';

/** The always-there prompt at the bottom, with output that slides up above it. */
export function Shell() {
  const output = useTerm((s) => s.output);
  const section = useTerm((s) => s.section);
  const focusSignal = useTerm((s) => s.shellFocus);
  const name = useStore((s) => s.settings.name);
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const histIdx = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const path = SECTIONS.find((s) => s.id === section)?.path ?? '~';

  useEffect(() => {
    if (focusSignal) input.current?.focus();
  }, [focusSignal]);

  // New output opens the panel; it tucks itself away after a while unless you're typing.
  useEffect(() => {
    if (!output.length) {
      setOpen(false);
      return;
    }
    setOpen(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      if (document.activeElement !== input.current) setOpen(false);
    }, 9000);
    requestAnimationFrame(() => log.current?.scrollTo({ top: log.current.scrollHeight }));
    const last = log.current?.lastElementChild;
    if (last) gsap.fromTo(last, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.18 });
  }, [output]);

  return (
    <div className={`shell${open ? ' open' : ''}${focused ? ' focused' : ''}`}>
      <div className="shell-log" ref={log}>
        {output.map((l) => (
          <div key={l.id} className={`out ${l.tone ?? ''}`}>
            {l.text}
          </div>
        ))}
      </div>
      <label className="shell-prompt">
        <div className="sp-1">
          <span className="pb">┌──(</span>
          <span className="pr">{userHandle(name)}㉿mindpalace</span>
          <span className="pb">)-[</span>
          <span className="pw">{path}</span>
          <span className="pb">]</span>
          <span className="sp-hint dim">{focused ? 'Tab complete · ↑↓ history · Esc close' : 'press / to type · help'}</span>
        </div>
        <div className="sp-2">
          <span className="pb">└─</span>
          <span className="pr">$ </span>
          <input
            ref={input}
            value={value}
            spellCheck={false}
            autoComplete="off"
            aria-label="Shell command"
            onFocus={() => {
              setFocused(true);
              if (output.length) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onChange={(e) => {
              setValue(e.target.value);
              sfx.key();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = value;
                setValue('');
                histIdx.current = null;
                void runCommand(v);
              } else if (e.key === 'Tab') {
                e.preventDefault();
                setValue(complete(value));
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const h = loadHistory();
                if (!h.length) return;
                const cur = histIdx.current ?? h.length;
                const next = Math.max(0, Math.min(h.length, cur + (e.key === 'ArrowUp' ? -1 : 1)));
                histIdx.current = next;
                setValue(h[next] ?? '');
              } else if (e.key === 'Escape') {
                input.current?.blur();
                setOpen(false);
              } else if (e.key === 'l' && e.ctrlKey) {
                e.preventDefault();
                useTerm.getState().clearOutput();
              }
            }}
          />
        </div>
      </label>
    </div>
  );
}
