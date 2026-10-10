import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { createWhir, sfx } from '../lib/sound';

/** Flick-to-spin fidget spinner with real momentum, an RPM readout and a speed-tracking hum. */
export function Spinner() {
  const ref = useRef<SVGSVGElement>(null);
  const ghostRef = useRef<SVGGElement>(null);
  const [rpm, setRpm] = useState(0);
  const bestRpm = useStore((s) => s.fidget.bestRpm);
  const bump = useStore((s) => s.bumpFidget);
  const sound = useStore((s) => s.settings.sound);
  const state = useRef({ angle: 0, vel: 0, dragging: false, lastA: 0, lastT: 0, peak: 0 });

  useEffect(() => {
    const whir = createWhir();
    let raf = 0;
    let frame = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = state.current;
      if (!s.dragging) {
        s.angle += s.vel;
        s.vel *= 0.993;
        if (Math.abs(s.vel) < 0.02) s.vel = 0;
      }
      const speed = Math.abs(s.vel);
      const g = ref.current?.querySelector('.spinner-body') as SVGGElement | null;
      g?.setAttribute('transform', `rotate(${s.angle} 150 150)`);
      if (ghostRef.current) {
        ghostRef.current.setAttribute('transform', `rotate(${s.angle - s.vel * 1.6} 150 150)`);
        ghostRef.current.style.opacity = String(Math.min(0.5, speed / 40));
      }
      // Heats up as it spins: brighter, with a growing molten glow.
      if (ref.current) ref.current.style.filter = `brightness(${1 + Math.min(speed, 45) / 60}) drop-shadow(0 0 ${Math.min(speed, 32)}px var(--accent))`;
      const r = Math.round(speed * 10);
      if (r > s.peak) s.peak = r;
      if (++frame % 6 === 0) setRpm(r);
      if (sound && speed > 0.3) whir.update(r / 6);
      else whir.update(0);
      if (speed === 0 && s.peak > 0) {
        bump('bestRpm', s.peak);
        s.peak = 0;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      whir.stop();
      if (state.current.peak) bump('bestRpm', state.current.peak);
    };
  }, [sound, bump]);

  const angleAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };

  return (
    <div className="spinner-wrap">
      <svg
        ref={ref}
        viewBox="0 0 300 300"
        className="spinner"
        onPointerDown={(e) => {
          const s = state.current;
          s.dragging = true;
          s.lastA = angleAt(e);
          s.lastT = performance.now();
          s.vel *= 0.5;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          sfx.softClick();
        }}
        onPointerMove={(e) => {
          const s = state.current;
          if (!s.dragging) return;
          const a = angleAt(e);
          let d = a - s.lastA;
          if (d > 180) d -= 360;
          if (d < -180) d += 360;
          const now = performance.now();
          const dt = Math.max(1, now - s.lastT) / 16.67;
          s.angle += d;
          s.vel = s.vel * 0.5 + (d / dt) * 0.5;
          s.lastA = a;
          s.lastT = now;
        }}
        onPointerUp={() => {
          const s = state.current;
          s.dragging = false;
          s.vel = Math.max(-90, Math.min(90, s.vel * 1.4));
          if (Math.abs(s.vel) < 1) {
            s.vel += 18;
            sfx.whoosh();
          }
        }}
        data-nosnap
      >
        <defs>
          <linearGradient id="spin-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: '#a9b3bf' }} />
            <stop offset="0.55" style={{ stopColor: '#3b424b' }} />
            <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
          </linearGradient>
          <radialGradient id="bearing-g">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.6" stopColor="#c9c9d6" />
            <stop offset="1" stopColor="#6b6b80" />
          </radialGradient>
        </defs>
        <g ref={ghostRef} className="spinner-ghost">
          <SpinnerShape />
        </g>
        <g className="spinner-body">
          <SpinnerShape />
        </g>
        <circle cx="150" cy="150" r="22" fill="url(#bearing-g)" />
        <circle cx="150" cy="150" r="9" fill="#2a2a3a" />
      </svg>
      <div className="spinner-readout">
        <div className="rpm">{rpm}</div>
        <div className="rpm-label">RPM · best {bestRpm}</div>
      </div>
    </div>
  );
}

function SpinnerShape() {
  const lobes = [0, 120, 240];
  return (
    <>
      <circle cx="150" cy="150" r="46" fill="url(#spin-g)" />
      {lobes.map((a) => (
        <g key={`arm-${a}`} transform={`rotate(${a} 150 150)`}>
          <rect x="128" y="84" width="44" height="66" fill="url(#spin-g)" />
          <circle cx="150" cy="84" r="36" fill="url(#spin-g)" />
        </g>
      ))}
      {lobes.map((a) => (
        <g key={a} transform={`rotate(${a} 150 150)`}>
          <circle cx="150" cy="84" r="24" fill="#1d1d2b" />
          <circle cx="150" cy="84" r="17" fill="url(#bearing-g)" />
          <circle cx="150" cy="84" r="6" fill="#2a2a3a" />
        </g>
      ))}
      <circle cx="150" cy="150" r="30" fill="#1d1d2b" />
    </>
  );
}
