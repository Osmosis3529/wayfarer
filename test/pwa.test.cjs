// Tests for the hosted web-app build: install manifest, icons, offline service worker, iPhone install hint, share-sheet saves.
// Run with the rest of the suite: `npm test`
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain' };
let browser, tmp, site, servers = [];

const build = (dir, ...flags) => execFileSync('node', [path.join(ROOT, 'scripts', 'build-web.cjs'), '--out', dir, ...flags], { encoding: 'utf8' });
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    }).listen(0, '127.0.0.1', () => { servers.push(server); resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/' }); });
  });
}
test.before(async () => {
  browser = await chromium.launch({ executablePath: process.env.WAYFARER_BROWSER || undefined });
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfarer-pwa-'));
  site = path.join(tmp, 'site'); build(site, '--pwa');
});
test.after(async () => { await browser.close(); for (const s of servers) s.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function page(ctxOptions, fn) {
  const ctx = await browser.newContext(ctxOptions);
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  try { await fn(p, ctx); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}
const pngSize = file => { const b = fs.readFileSync(file); assert.equal(b.toString('latin1', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('the hosted build ships every script the page loads, a valid manifest, real icons and a filled-in service worker', () => {
  const index = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  for (const src of [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1])) assert.ok(fs.existsSync(path.join(site, src)), 'missing ' + src);
  for (const game of ['gfx.js', 'settlement.js', 'war.js', 'dark.js', 'touch.js', 'pwa.js']) assert.ok(index.includes('src="' + game + '"'), game + ' is not loaded');
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.orientation, 'landscape'); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  assert.ok(manifest.name && manifest.short_name && manifest.background_color && manifest.theme_color);
  for (const icon of manifest.icons) { const [w, h] = pngSize(path.join(site, icon.src)); assert.equal(icon.sizes, w + 'x' + h); }
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512') && manifest.icons.some(i => i.sizes === '192x192'));
  assert.deepEqual(pngSize(path.join(site, 'icons', 'apple-touch-icon.png')), [180, 180]);
  assert.ok(index.includes('rel="manifest"') && index.includes('rel="apple-touch-icon"') && index.includes('apple-mobile-web-app-capable'));
  assert.match(index, /manifest-src 'self'/); assert.match(index, /worker-src 'self'/);
  assert.ok(!index.includes('src="/') && !index.includes('href="/'), 'absolute paths break a project site');
  const sw = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
  assert.ok(!sw.includes("'dev'") && /const VERSION = '[0-9a-f]{12}'/.test(sw));
  const cached = JSON.parse(sw.match(/const FILES = (\[.*\]);/)[1]);
  for (const f of [...cached].filter(f => f !== './')) assert.ok(fs.existsSync(path.join(site, f)), 'cached but missing: ' + f);
  for (const f of ['index.html', 'dark.js', 'war.js', 'settlement.js', 'gfx.js', 'touch.js', 'pwa.js', 'manifest.webmanifest', 'assets/kenney/kenney-data.js', 'icons/icon-192.png']) assert.ok(cached.includes(f), f + ' would not work offline');
});

test('old wayfarer.html links on the hosted site land on the game, with or without the network', async () => {
  const { url } = await serve(site);
  await page({}, async (p, ctx) => {
    await p.goto(url + 'wayfarer.html?touch=1');
    await p.waitForFunction(() => typeof state === 'object');
    assert.equal(new URL(p.url()).pathname, '/'); assert.ok(p.url().includes('touch=1'));
    await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForFunction(() => navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    await p.goto(url + 'wayfarer.html');
    await p.waitForFunction(() => typeof state === 'object');
    assert.equal(new URL(p.url()).pathname, '/');
  });
});

test('the build is repeatable, and the Android build gets none of the web-app extras', () => {
  const again = path.join(tmp, 'again'), android = path.join(tmp, 'android');
  build(again, '--pwa'); build(android);
  const version = dir => fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').match(/VERSION = '([0-9a-f]+)'/)[1];
  assert.equal(version(again), version(site));
  const index = fs.readFileSync(path.join(android, 'index.html'), 'utf8');
  assert.ok(!index.includes('manifest') && !index.includes('pwa.js') && !fs.existsSync(path.join(android, 'sw.js')) && !fs.existsSync(path.join(android, 'manifest.webmanifest')));
  for (const f of ['gfx.js', 'settlement.js', 'war.js', 'dark.js', 'touch.js']) assert.ok(fs.existsSync(path.join(android, f)), f);
});

test('the service worker caches the whole game, so it loads and plays with the network off', async () => {
  const { url } = await serve(site);
  await page({}, async (p, ctx) => {
    await p.goto(url);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => navigator.serviceWorker.controller);
    const cached = await p.evaluate(async () => { const keys = await caches.keys(), c = await caches.open(keys[0]); return { keys, urls: (await c.keys()).map(r => new URL(r.url).pathname) }; });
    assert.equal(cached.keys.length, 1); assert.ok(cached.keys[0].startsWith('wayfarer-'));
    for (const f of ['/', '/dark.js', '/war.js', '/assets/kenney/kenney-data.js', '/icons/icon-192.png', '/manifest.webmanifest']) assert.ok(cached.urls.includes(f), f);
    await ctx.setOffline(true);
    await p.goto(url + '?touch=1');
    const r = await p.evaluate(() => { newWorld(); manualPause = true; build('hut'); enterTown(); return { zone: state.zone, hasMaze: typeof mazeGrid === 'function', manifest: !!document.querySelector('link[rel=manifest]') }; });
    assert.deepEqual(r, { zone: 'town', hasMaze: true, manifest: true });
    await p.reload();
    assert.equal(await p.evaluate(() => typeof state), 'object');
  });
});

test('a new deploy replaces the old cache and tells you to reload', async () => {
  const dir = path.join(tmp, 'update'); build(dir, '--pwa');
  const { url } = await serve(dir);
  await page({}, async p => {
    await p.goto(url);
    await p.waitForFunction(() => navigator.serviceWorker.controller);
    const first = await p.evaluate(async () => (await caches.keys()).sort());
    const swPath = path.join(dir, 'sw.js'), sw = fs.readFileSync(swPath, 'utf8');
    fs.writeFileSync(swPath, sw.replace(/VERSION = '[0-9a-f]+'/, "VERSION = 'nextdeploy1'"));
    await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await p.waitForFunction(async () => { const k = await caches.keys(); return k.length === 1 && k[0] === 'wayfarer-nextdeploy1'; }, null, { timeout: 15000 });
    await p.waitForFunction(() => state.log.some(l => l.t.includes('new version of Wayfarer')), null, { timeout: 15000 });
    assert.equal(first.length, 1); assert.notEqual(first[0], 'wayfarer-nextdeploy1');
  });
});

test('iPhone Safari gets an install hint on the start screen; the installed app, desktops and Android builds do not', async () => {
  const { url } = await serve(site);
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true };
  const hint = p => p.evaluate(() => (document.querySelector('.start-card .install-hint') || {}).textContent || '');
  await page(iphone, async p => { await p.goto(url); const h = await hint(p); assert.ok(h.includes('Share') && h.includes('Add to Home Screen'), h); });
  await page(iphone, async p => { await p.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); }); await p.goto(url); assert.equal(await hint(p), ''); });
  await page({}, async p => { await p.goto(url); assert.equal(await hint(p), ''); });
  const android = path.join(tmp, 'android'), dir = await serve(android);
  await page(iphone, async p => { await p.goto(dir.url); assert.equal(await hint(p), ''); });
});

test('on a phone, Export save opens the share sheet with a real save file; cancelling is quiet; desktops still download', async () => {
  const { url } = await serve(site);
  const stub = (cancel) => p => p.addInitScript(cancelled => {
    window.__shared = null;
    Object.defineProperty(navigator, 'canShare', { value: d => !!(d && d.files && d.files.length), configurable: true });
    Object.defineProperty(navigator, 'share', { value: async d => { window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text(), title: d.title }; if (cancelled) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } }, configurable: true });
  }, cancel);
  await page({ hasTouch: true }, async p => {
    await stub(false)(p); await p.goto(url + '?touch=1');
    const r = await p.evaluate(async () => { newWorld(); manualPause = true; state.coin = 77; exportSaveFile(); await new Promise(r => setTimeout(r, 200)); return { shared: window.__shared, log: state.log[0].t }; });
    assert.equal(r.shared.name, 'wayfarer-save.json'); assert.equal(r.shared.type, 'application/json');
    const save = JSON.parse(r.shared.text); assert.equal(save.version, 1); assert.equal(save.state.coin, 77); assert.ok(save.overworld.length > 100);
    assert.ok(r.log.includes('Save file ready'), r.log);
  });
  await page({ hasTouch: true }, async p => {
    await stub(true)(p); await p.goto(url + '?touch=1');
    const log = await p.evaluate(async () => { newWorld(); manualPause = true; const before = state.log.length; exportSaveFile(); await new Promise(r => setTimeout(r, 200)); return state.log.slice(0, state.log.length - before).map(l => l.t + '|' + l.cls); });
    assert.ok(!log.some(l => l.includes('alert')), JSON.stringify(log));
  });
  await page({}, async p => {                                  // a desktop browser: no share sheet, so the file downloads as before
    await stub(false)(p); await p.goto(url);
    const [download] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => { newWorld(); manualPause = true; exportSaveFile(); })]);
    assert.equal(download.suggestedFilename(), 'wayfarer-save.json');
    assert.equal(await p.evaluate(() => window.__shared), null);
  });
});
