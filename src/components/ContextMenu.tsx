import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { sfx } from '../lib/sound';

export interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  run: () => void;
}

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  open(x: number, y: number, items: MenuItem[]): void;
  close(): void;
}

const useMenu = create<MenuState>()((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));

export const openContextMenu = (e: React.MouseEvent, items: MenuItem[]) => {
  e.preventDefault();
  e.stopPropagation();
  sfx.softClick();
  useMenu.getState().open(e.clientX, e.clientY, items);
};

export function ContextMenu() {
  const { menu, close } = useMenu();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu, close]);

  const x = menu ? Math.min(menu.x, window.innerWidth - 200) : 0;
  const y = menu ? Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 16) : 0;

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          className="ctx-menu"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.92, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        >
          {menu.items.map((item) => (
            <button
              key={item.label}
              className={`ctx-item${item.danger ? ' danger' : ''}`}
              onClick={() => {
                close();
                item.run();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
