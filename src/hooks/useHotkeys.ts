import { useEffect } from 'react';
import { navigate, VIEWS } from './useRoute';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { sfx } from '../lib/sound';
import { fx } from '../lib/fx';

export function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ui = useUi.getState();
      const store = useStore.getState();

      if (mod && (key === 'k' || key === 'p' || key === 'o')) {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (e.altKey && !mod && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        navigate(VIEWS[Number(e.key) - 1]);
        return;
      }
      if (e.altKey && !mod && key === 'n') {
        e.preventDefault();
        store.createNote();
        navigate('notes');
        sfx.add();
        return;
      }
      if (e.altKey && !mod && key === 't') {
        e.preventDefault();
        navigate('tasks');
        ui.requestQuickAdd();
        return;
      }
      if (mod && key === 'e') {
        e.preventDefault();
        const mode = store.settings.noteMode === 'read' ? 'edit' : 'read';
        store.setSettings({ noteMode: mode });
        return;
      }
      if (mod && e.key === '\\') {
        e.preventDefault();
        store.setSettings({ rightOpen: !store.settings.rightOpen });
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        sfx.tick();
        ui.toast({ kind: 'success', title: 'Saved', body: 'Everything autosaves, but that felt good, right?', duration: 1800 });
        fx.sparkle(window.innerWidth - 120, window.innerHeight - 40);
        return;
      }
      if (e.key === 'Escape') {
        if (ui.paletteOpen) ui.setPalette(false);
        if (ui.bellOpen) ui.setBell(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
