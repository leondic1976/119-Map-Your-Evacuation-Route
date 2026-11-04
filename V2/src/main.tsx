import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/jua/index.css';
import './ui/app.css';
import { App } from './App';
import { host } from './platform/host';

host.forgetOldCopies();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
