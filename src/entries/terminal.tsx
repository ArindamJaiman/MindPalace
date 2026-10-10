import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TerminalApp } from '../terminal/TerminalApp';
import { registerServiceWorker } from '../lib/notify';
import { initSync } from '../sync/sync';
import { rememberEdition } from '../editions';
import '../terminal/terminal.css';

rememberEdition('terminal');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TerminalApp />
  </StrictMode>,
);

void registerServiceWorker();
void initSync();
