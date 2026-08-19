import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './control-plane/App.jsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Ghost Records v2 root element is unavailable.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
