import { useEffect, useMemo, useRef } from 'react';
import { gsap, useGSAP, SCRAMBLE_CHARS } from '../gsap';
import { blockText, decryptFrames } from '../blockfont';
import { useStore } from '../../store/store';
import { userHandle } from '../state';

interface Props {
  index: string;
  title: string;
  path: string;
  cmd: string;
  reduce: boolean;
}

/** Kali-style two-line prompt plus a block-letter title that decrypts when it scrolls into view. */
export function SectionHead({ index, title, path, cmd, reduce }: Props) {
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLPreElement>(null);
  const cmdRef = useRef<HTMLSpanElement>(null);
  const revealed = useRef(false);
  const name = useStore((s) => s.settings.name);
  const block = useMemo(() => blockText(title), [title]);

  useGSAP(
    () => {
      const pre = titleRef.current!;
      const cmdEl = cmdRef.current!;
      if (reduce) {
        pre.textContent = block;
        cmdEl.textContent = cmd;
        revealed.current = true;
        return;
      }
      pre.textContent = '';
      cmdEl.textContent = '';
      const frames = decryptFrames(block);
      const proxy = { p: 0 };
      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: 'top 82%', once: true },
          onComplete: () => {
            revealed.current = true;
          },
        })
        .to(proxy, {
          p: 1,
          duration: 1.1,
          ease: 'power2.out',
          onUpdate: () => {
            pre.textContent = frames(proxy.p);
          },
        })
        .to(cmdEl, { duration: 0.7, scrambleText: { text: cmd, chars: SCRAMBLE_CHARS, speed: 0.9 } }, 0.35)
        .from(root.current!.querySelector('.sh-index'), { opacity: 0, x: -20, duration: 0.4 }, 0);
    },
    { scope: root, dependencies: [] },
  );

  // Changing filters re-types the command line.
  useEffect(() => {
    if (!revealed.current || !cmdRef.current) return;
    if (reduce) {
      cmdRef.current.textContent = cmd;
      return;
    }
    gsap.to(cmdRef.current, { duration: 0.45, scrambleText: { text: cmd, chars: SCRAMBLE_CHARS, speed: 1 } });
  }, [cmd, reduce]);

  return (
    <header className="sh" ref={root}>
      <div className="sh-index">
        <span className="r">{index}</span> // {title.toLowerCase()}
      </div>
      <pre className="sh-title" ref={titleRef} aria-label={title} />
      <div className="sh-prompt">
        <span className="pb">┌──(</span>
        <span className="pr">{userHandle(name)}㉿mindpalace</span>
        <span className="pb">)-[</span>
        <span className="pw">{path}</span>
        <span className="pb">]</span>
        <br />
        <span className="pb">└─</span>
        <span className="pr">$ </span>
        <span ref={cmdRef} className="sh-cmd" />
        <span className="blink">█</span>
      </div>
    </header>
  );
}
