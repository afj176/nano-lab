import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { mountApp } from './ui/app.js';

mountApp(document.querySelector('#app'));

// Offline support: cache the app shell after the first visit (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
