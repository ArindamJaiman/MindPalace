import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';

const ROWS = ['#ff5d73', '#ff9f43', '#ffd93d', '#5ee6a0', '#4fc3f7', '#a78bfa'];
const COLS = 6;

/** Rainbow pop-it. Swipe across it while holding the mouse to pop a whole row; it flips when all are popped. */
export function PopIt() {
  const [popped, setPopped] = useState<boolean[]>(() => Array(ROWS.length * COLS).fill(false));
  const [side, setSide] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const down = useRef(false);
  const bump = useStore((s) => s.bumpFidget);

  const pop = (i: number, el: HTMLElement) => {
    if (popped[i] || flipping) return;
    const next = popped.slice();
    next[i] = true;
    setPopped(next);
    sfx.pop(0.9 + Math.random() * 0.3);
    bump('pops');
    const color = ROWS[Math.floor(i / COLS)];
    fx.burstAt(el, { count: 7, speed: 2.6, colors: [color, '#ffffff'], gravity: 0.08, size: 3, shapes: ['circle'] });
    if (next.every(Boolean)) {
      setFlipping(true);
      setTimeout(() => {
        sfx.boing();
        bump('flips');
        fx.burstAt(el.closest('.popit'), { count: 50, speed: 9 });
        setSide((s) => s + 1);
        setTimeout(() => {
          setPopped(Array(ROWS.length * COLS).fill(false));
          setFlipping(false);
        }, 320);
      }, 250);
    }
  };

  return (
    <div className="popit-wrap" onPointerUp={() => (down.current = false)} onPointerLeave={() => (down.current = false)}>
      <motion.div className="popit" animate={{ rotateY: side * 180 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <div className="popit-face" style={{ transform: side % 2 ? 'rotateY(180deg)' : undefined }}>
          {ROWS.map((color, r) => (
            <div key={r} className="popit-row">
              {Array.from({ length: COLS }, (_, c) => {
                const i = r * COLS + c;
                return (
                  <button
                    key={i}
                    className={`bubble${popped[i] ? ' popped' : ''}`}
                    style={{ '--c': color } as React.CSSProperties}
                    onPointerDown={(e) => {
                      down.current = true;
                      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                      pop(i, e.currentTarget);
                    }}
                    onPointerEnter={(e) => down.current && pop(i, e.currentTarget)}
                    aria-label="bubble"
                    data-nosnap
                  />
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
