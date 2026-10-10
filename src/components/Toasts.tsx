import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, CheckCircle2, Info, Sparkles, Trophy, X, AlertTriangle } from 'lucide-react';
import { useUi, type Toast } from '../store/ui';

const ICON: Record<Toast['kind'], React.ReactNode> = {
  success: <CheckCircle2 size={18} />,
  info: <Info size={18} />,
  xp: <Sparkles size={18} />,
  reminder: <AlarmClock size={18} />,
  level: <Trophy size={18} />,
  error: <AlertTriangle size={18} />,
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(id);
  }, [t.id, t.duration, dismiss]);
  return (
    <motion.div
      layout
      className={`toast toast-${t.kind}`}
      initial={{ opacity: 0, x: 60, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <div className="toast-icon">{ICON[t.kind]}</div>
      <div className="toast-text">
        <div className="toast-title">{t.title}</div>
        {t.body && <div className="toast-body">{t.body}</div>}
      </div>
      {t.action && (
        <button
          className="toast-action"
          onClick={() => {
            t.action!.run();
            dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
        <X size={14} />
      </button>
      <div className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} />
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
