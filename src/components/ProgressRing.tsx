import { motion } from 'framer-motion';

interface Props {
  value: number;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
}

/** Gradient ring that springs to its value. */
export function ProgressRing({ value, size = 120, stroke = 10, label, sublabel }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const id = `ring-${size}-${stroke}`;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="55%" stopColor="#ff7ab6" />
            <stop offset="100%" stopColor="#ffc857" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: v >= 1 ? 'drop-shadow(0 0 8px #ffc857)' : undefined }}
        />
      </svg>
      {(label || sublabel) && (
        <div className="ring-label">
          {label && <div className="ring-value">{label}</div>}
          {sublabel && <div className="ring-sub">{sublabel}</div>}
        </div>
      )}
    </div>
  );
}
