import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles.css';

// Parts of the Midnight stack still expect Node's Buffer to be global.
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
