/** Slow-drifting aurora blobs + film grain behind the app. Pure CSS, GPU-composited. */
export function Background() {
  return (
    <div className="bg" aria-hidden>
      <div className="bg-blob b1" />
      <div className="bg-blob b2" />
      <div className="bg-blob b3" />
      <svg className="bg-grain" width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
}
