import { useEffect, useRef, useState } from 'react';
import { readDrop } from '../../lib/files';
import { importIntoVault } from '../importer';
import { blockText } from '../blockfont';

const TITLE = blockText('INCOMING');

/** Drag files or folders anywhere: they're uploaded into the vault. */
export function DropOverlay() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      setActive(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setActive(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      void readDrop(e.dataTransfer!).then(importIntoVault);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="drop">
      <pre className="drop-title">{TITLE}</pre>
      <div className="drop-sub">
        <span className="red">■</span> INCOMING TRANSMISSION · release to write into ~/vault
      </div>
      <div className="dim">.md / .txt → notes · images & pdf → embedded · folders keep their structure</div>
    </div>
  );
}
