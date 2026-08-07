import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders } from './app/providers/AppProviders';
import { withBasePath } from './app/config/public-paths';
import './design/tokens.css';
import './design/primitives.css';
import './styles.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(withBasePath('/sw.js'), { scope: withBasePath('/') });
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      keys.filter((key) => key.startsWith('athar-')).forEach((key) => void caches.delete(key));
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
);
