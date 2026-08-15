import { mount } from 'svelte';
import App from './App.svelte';

// Production only. A service worker in dev caches your own edits back at you.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  });
}

export default mount(App, {
  target: document.getElementById('app'),
});
