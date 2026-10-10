import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store';
import { fx } from '../lib/fx';
import { sfx } from '../lib/sound';

const LEDS = ['#ff5d73', '#ffd93d', '#5ee6a0', '#4fc3f7', '#a78bfa'];
const STEPS = 12;

/** Clicky toggles, a detented rotary knob and a big arcade button. */
export function SwitchBoard() {
  const [on, setOn] = useState<boolean[]>([true, false, true, false, false]);
  const [knob, setKnob] = useState(4);
  const [presses, setPresses] = useState(0);
  const [pressed, setPressed] = useState(false);
  const bump = useStore((s) => s.bumpFidget);
  const drag = useRef<{ y: number; start: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const setKnobValue = (v: number) => {
    const clamped = Math.max(0, Math.min(STEPS - 1, v));
    setKnob((prev) => {
      if (prev !== clamped) sfx.tick();
      return clamped;
    });
  };

  return (
    <div className="switchboard">
      <div className="toggles">
        {on.map((v, i) => (
          <button
            key={i}
            className={`switch${v ? ' on' : ''}`}
            style={{ '--led': LEDS[i] } as React.CSSProperties}
            onClick={() => {
              const next = on.slice();
              next[i] = !v;
              setOn(next);
              sfx.toggle(!v);
              bump('switches');
            }}
            aria-label={`Switch ${i + 1}`}
          >
            <span className="switch-led" />
            <span className="switch-track">
              <motion.span className="switch-thumb" layout transition={{ type: 'spring', stiffness: 900, damping: 30 }} />
            </span>
          </button>
        ))}
      </div>

      <div className="board-bottom">
        <div className="knob-wrap">
          <svg className="knob-leds" viewBox="0 0 120 120">
            {Array.from({ length: STEPS }, (_, i) => {
              const a = ((-135 + (i / (STEPS - 1)) * 270 - 90) * Math.PI) / 180;
              return (
                <circle
                  key={i}
                  cx={60 + Math.cos(a) * 52}
                  cy={60 + Math.sin(a) * 52}
                  r="3.2"
                  className={i <= knob ? 'lit' : ''}
                  style={{ '--h': `${200 + i * 12}` } as React.CSSProperties}
                />
              );
            })}
          </svg>
          <div
            className="knob"
            style={{ transform: `rotate(${-135 + (knob / (STEPS - 1)) * 270}deg)` }}
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, start: knob };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              setKnobValue(drag.current.start + Math.round((drag.current.y - e.clientY) / 14));
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setKnobValue(knob + (e.deltaY < 0 ? 1 : -1))}
            role="slider"
            aria-valuenow={knob}
            data-snap
          >
            <span className="knob-mark" />
          </div>
          <div className="knob-label">drag or scroll · {knob + 1}</div>
        </div>

        <div className="arcade-wrap">
          <button
            ref={btnRef}
            className={`arcade${pressed ? ' pressed' : ''}`}
            onPointerDown={() => {
              setPressed(true);
              sfx.thunk();
            }}
            onPointerUp={() => {
              if (!pressed) return;
              setPressed(false);
              setPresses((p) => p + 1);
              bump('buttonPresses');
              sfx.click();
              fx.burstAt(btnRef.current, { count: 30, speed: 7, colors: ['#ff5d73', '#ffd93d', '#ffffff'] });
            }}
            onPointerLeave={() => setPressed(false)}
            aria-label="Big satisfying button"
          >
            <span className="arcade-cap" />
          </button>
          <motion.div key={presses} className="arcade-count" initial={{ scale: 1.6, color: '#ffd93d' }} animate={{ scale: 1, color: 'var(--text-muted)' }}>
            {presses} presses
          </motion.div>
        </div>
      </div>
    </div>
  );
}
