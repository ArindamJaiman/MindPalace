import { useEffect, useRef } from 'react';
import { ScrollTrigger } from '../gsap';

const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF<>/|#$%&*+=';

/** Monochrome code rain behind everything. Falls faster while you scroll fast. */
export function Rain({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const size = 15;
    let cols: { y: number; speed: number }[] = [];
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Array.from({ length: Math.ceil(w / size) }, () => ({ y: Math.random() * -h, speed: 0.6 + Math.random() * 0.9 }));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    let boost = 0;
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        boost = Math.min(6, Math.abs(self.getVelocity()) / 400);
      },
    });

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 45) return;
      last = now;
      boost *= 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size - 2}px "JetBrains Mono", monospace`;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const ch = CHARS[(Math.random() * CHARS.length) | 0];
        const r = Math.random();
        // Mostly grey; a rare red or blue glyph keeps it alive.
        ctx.fillStyle = r > 0.992 ? '#ff2b2b' : r > 0.985 ? '#2f7bff' : r > 0.9 ? '#e5e5e5' : `rgba(160,160,160,${0.25 + Math.random() * 0.3})`;
        ctx.fillText(ch, i * size, c.y);
        c.y += size * (c.speed + boost * 0.6);
        if (c.y > h && Math.random() > 0.96) c.y = Math.random() * -100;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      st.kill();
      window.removeEventListener('resize', resize);
    };
  }, [enabled]);

  return <canvas ref={ref} className={`rain${enabled ? '' : ' off'}`} aria-hidden />;
}
