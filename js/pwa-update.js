/* MT.062 – start-up PWA updates. Does not touch player progress in IndexedDB. */
(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  let firstController = navigator.serviceWorker.controller;
  let startup = true;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'});
      await registration.update();
    } catch (error) { console.warn('Kontrola aktualizace MT:', error); }
    // Avoid an unexpected reload in the middle of a playing session.
    window.setTimeout(() => { startup = false; }, 10000);
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!startup) return;
    const playing = document.getElementById('game');
    if (playing && !playing.hidden) return;
    // First installation also triggers controllerchange: only reload after replacing an existing worker.
    if (firstController) window.location.reload();
    firstController = navigator.serviceWorker.controller;
  });
})();
