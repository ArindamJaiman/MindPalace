/**
 * Forge backdrop: a faint tactical grid, two slow heat glows, a scanline sweep and film grain.
 * Pure CSS, GPU-composited.
 */
export function Background() {
  return (
    <div className="bg" aria-hidden>
      <div className="bg-grid" />
      <div className="bg-glow g1" />
      <div className="bg-glow g2" />
      <div className="bg-scan" />
      <svg className="bg-grain" width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
      <div className="bg-vignette" />
    </div>
  );
}
