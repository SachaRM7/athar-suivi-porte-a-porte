import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders } from './app/providers/AppProviders';
import { withBasePath } from './app/config/public-paths';
import './design/fonts.css';
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

// Seule la carte se zoome. Safari iOS ignore `user-scalable=no` pour le pincement : ses
// événements `gesture*` sont donc bloqués hors du canevas MapLibre, qui gère le sien.
// La taille du texte suit toujours le réglage du système (jetons en rem, lot D).
for (const type of ['gesturestart', 'gesturechange'] as const) {
  document.addEventListener(type, (event) => {
    if (!(event.target instanceof Element && event.target.closest('.maplibregl-canvas-container'))) event.preventDefault();
  }, { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
);
