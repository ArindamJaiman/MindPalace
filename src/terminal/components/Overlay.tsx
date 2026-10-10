import { useEffect, useMemo, useRef } from 'react';
import { gsap } from '../gsap';
import { blockText, decryptFrames } from '../blockfont';
import { useTerm } from '../state';

/** Full-screen glitch celebration for rank-ups and a cleared day. */
export function Overlay() {
  const overlay = useTerm((s) => s.overlay);
  const clear = useTerm((s) => s.clearOverlay);
  const root = useRef<HTMLDivElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const block = useMemo(() => (overlay ? blockText(overlay.title) : ''), [overlay]);

  useEffect(() => {
    if (!overlay || !root.current || !pre.current) return;
    const frames = decryptFrames(block);
    const p = { v: 0 };
    const tl = gsap.timeline({ onComplete: clear });
    tl.fromTo(root.current, { opacity: 0 }, { opacity: 1, duration: 0.12 })
      .fromTo('.ov-flash', { opacity: 0.9 }, { opacity: 0, duration: 0.5 }, 0)
      .to(p, { v: 1, duration: 0.8, ease: 'power2.out', onUpdate: () => void (pre.current!.textContent = frames(p.v)) }, 0.05)
      .fromTo(pre.current, { '--split': '18px' }, { '--split': '2px', duration: 0.8, ease: 'power3.out' }, 0.05)
      .fromTo('.ov-sub', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3 }, 0.6)
      .fromTo('.ov-bar', { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: 'none' }, 0.6)
      .to(pre.current, { x: () => gsap.utils.random(-8, 8), duration: 0.05, repeat: 5, yoyo: true }, 1.6)
      .to(root.current, { opacity: 0, duration: 0.35 }, 2.4);
    return () => {
      tl.kill();
    };
  }, [overlay, block, clear]);

  if (!overlay) return null;
  return (
    <div className={`overlay ov-${overlay.kind}`} ref={root} onClick={clear} role="status">
      <div className="ov-flash" />
      <div className="ov-scan" />
      <pre className="ov-title" ref={pre} aria-label={overlay.title} />
      {overlay.sub && <div className="ov-sub">{overlay.sub}</div>}
      <div className="ov-bar" />
    </div>
  );
}
