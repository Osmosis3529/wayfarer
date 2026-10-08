// Touch / phone support: on-screen controls, a slide-out menu for the side panels, and message snacks.
// Active when the device has a coarse pointer (a phone or tablet) or the page is opened with ?touch=1.
(function () {
  const touch = matchMedia('(pointer:coarse)').matches || /[?&]touch=1/.test(location.search);
  if (!touch) return;
  const $ = id => document.getElementById(id);
  document.body.classList.add('touch');
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('touch-ready')));   // no slide-in animation on first paint

  // The save / graphics buttons live in the slide-out menu instead of the cramped header.
  const tools = $('drawer-tools');
  for (const b of [...document.querySelectorAll('.stats .save-btn')]) tools.appendChild(b);

  const blocked = () => $('start-screen').style.display !== 'none' || $('overlay').style.display === 'grid' || manualPause;
  const closeDrawer = () => document.body.classList.remove('drawer-open');
  const toggleDrawer = () => { document.body.classList.toggle('drawer-open'); lastTick = performance.now(); };
  window.mobileBack = () => {                       // used by the Android Back button
    if (document.body.classList.contains('drawer-open')) { closeDrawer(); return true; }
    if ($('overlay').style.display === 'grid' && !state.combat) { closeDialog(); return true; }
    return false;
  };

  // Hold a direction to keep walking.
  for (const btn of document.querySelectorAll('#dpad button')) {
    const dir = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[btn.dataset.dir];
    let timer = null;
    const stop = () => { clearInterval(timer); timer = null; };
    const go = () => { if (!blocked()) move(...dir); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} stop(); go(); timer = setInterval(go, 130); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
  }
  const press = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  press('t-interact', () => { if (!blocked()) interact(); });
  press('t-eat', () => { if (!blocked()) eat(); });
  press('t-pause', () => togglePause());
  press('t-menu', toggleDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-backdrop').addEventListener('click', closeDrawer);

  // The log is off-screen on a phone, so show the newest message briefly over the map.
  let snackTimer;
  window.showSnack = (text, cls) => {
    const s = $('snack'); s.textContent = text; s.className = 'show ' + (cls || '');
    clearTimeout(snackTimer); snackTimer = setTimeout(() => { s.className = ''; }, 3200);
  };

  // Phones can kill the app without warning, so save whenever it goes to the background.
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });

  // Android: share saves through the system share sheet, and let the Back button close menus.
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    window.nativeShareSave = async json => {
      const { Filesystem, Share } = cap.Plugins, path = 'wayfarer-save.json';
      await Filesystem.writeFile({ path, data: json, directory: 'CACHE', encoding: 'utf8' });
      const { uri } = await Filesystem.getUri({ path, directory: 'CACHE' });
      await Share.share({ title: 'Wayfarer save', url: uri, dialogTitle: 'Save your Wayfarer world' });
    };
    const App = cap.Plugins.App;
    if (App) App.addListener('backButton', () => { if (!window.mobileBack()) App.minimizeApp(); });
  }
})();
