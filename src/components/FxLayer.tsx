import { useEffect, useRef } from 'react';
import { attachFxCanvas, resize, setReducedMotion } from '../lib/fx';
import { useStore } from '../store/store';

export function FxLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useStore((s) => s.settings.reduceMotion);

  useEffect(() => {
    attachFxCanvas(ref.current);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      attachFxCanvas(null);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(reduce || media.matches);
  }, [reduce]);

  return <canvas ref={ref} className="fx-layer" aria-hidden />;
}
