import { useEffect, useRef } from 'react';
import { gsap } from '../gsap';
import { useUi, type Toast } from '../../store/ui';

const TAG: Record<Toast['kind'], string> = {
  success: '  OK  ',
  info: ' INFO ',
  xp: '  XP  ',
  reminder: 'ALERT ',
  level: ' RANK ',
  error: ' FAIL ',
};

function Item({ t }: { t: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) gsap.fromTo(ref.current, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power3.out' });
    const id = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(id);
  }, [t.id, t.duration, dismiss]);
  return (
    <div className={`tt tt-${t.kind}`} ref={ref}>
      <span className="tt-tag">[{TAG[t.kind]}]</span>
      <div className="tt-body">
        <div className="bright">{t.title}</div>
        {t.body && <div className="dim">{t.body}</div>}
      </div>
      {t.action && (
        <button
          className="t-btn"
          onClick={() => {
            t.action!.run();
            dismiss(t.id);
          }}
        >
          [{t.action.label}]
        </button>
      )}
      <button className="t-btn dim" onClick={() => dismiss(t.id)} aria-label="Dismiss">
        [x]
      </button>
    </div>
  );
}

export function TermToasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="tts">
      {toasts.map((t) => (
        <Item key={t.id} t={t} />
      ))}
    </div>
  );
}
