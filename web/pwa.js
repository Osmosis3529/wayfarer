// Web-app glue, only included in the hosted build: registers the offline service worker, asks the browser to keep
// saves, and tells iPhone users how to install the game (Safari has no install prompt).
(function () {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (ios && !standalone) {
    const card = document.querySelector('.start-card');
    if (card) {
      const hint = document.createElement('p');
      hint.className = 'install-hint';
      hint.style.cssText = 'font-size:12px;line-height:1.5;color:var(--muted);border-top:1px solid #2e4034;padding-top:10px;margin-top:12px';
      hint.textContent = 'On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen” to play full screen and offline. Use Export save now and then to keep a backup.';
      card.appendChild(hint);
    }
  }

  // Installed web apps can ask the browser not to clear their saved worlds when space is short.
  if (standalone && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    let controlled = !!navigator.serviceWorker.controller;      // the first worker taking over is not an update
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled && typeof say === 'function') say('A new version of Wayfarer is ready. Reload the page to play it.', 'gold');
      controlled = true;
    });
  }
})();
