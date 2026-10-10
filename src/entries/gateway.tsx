import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gateway } from '../gateway/Gateway';
import { registerServiceWorker } from '../lib/notify';
import '../gateway/gateway.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gateway />
  </StrictMode>,
);

void registerServiceWorker();
