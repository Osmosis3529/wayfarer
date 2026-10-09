// Copies the game's web files into a folder: www/ for Capacitor (Android), or with --pwa a hosted web app
// with an install manifest, icons and an offline service worker.
//   node scripts/build-web.cjs                      -> www/
//   node scripts/build-web.cjs --out site --pwa     -> site/
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : (process.argv[i + 1] || ''); };
const pwa = process.argv.includes('--pwa');
const out = path.resolve(root, arg('--out') || 'www');
const SCRIPTS = ['gfx.js', 'settlement.js', 'war.js', 'dark.js', 'touch.js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets', 'kenney'), { recursive: true });
let html = fs.readFileSync(path.join(root, 'wayfarer.html'), 'utf8');
for (const f of SCRIPTS) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of ['kenney-data.js', 'LICENSE.txt']) fs.copyFileSync(path.join(root, 'assets', 'kenney', f), path.join(out, 'assets', 'kenney', f));

// Every script the page asks for has to be shipped, or the game silently breaks on the device.
const wanted = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
const missing = wanted.filter(src => !fs.existsSync(path.join(out, src)));
if (missing.length) { console.error('wayfarer.html loads files the web build does not copy: ' + missing.join(', ')); process.exit(1); }

if (pwa) {
  const replace = (from, to) => { if (!html.includes(from)) { console.error('could not find ' + from + ' in wayfarer.html'); process.exit(1); } html = html.replace(from, to); };
  // The page's security policy must let the manifest and the service worker load.
  replace("img-src 'self' data:", "img-src 'self' data:; manifest-src 'self'; worker-src 'self'");
  replace('</head>', [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="icon" type="image/png" href="icons/icon-192.png">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
    '<meta name="theme-color" content="#101711">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Wayfarer">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black">',
    '</head>'
  ].join(''));
  replace('</body>', '<script src="pwa.js"></script></body>');
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'web', 'icons'))) fs.copyFileSync(path.join(root, 'web', 'icons', f), path.join(out, 'icons', f));
  for (const f of ['manifest.webmanifest', 'pwa.js']) fs.copyFileSync(path.join(root, 'web', f), path.join(out, f));
}
fs.writeFileSync(path.join(out, 'index.html'), html);

if (pwa) {
  // Everything the offline copy needs, and a version that changes whenever any of it does.
  const files = [];
  (function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(out, p).split(path.sep).join('/')); } })(out);
  files.sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(f).update(fs.readFileSync(path.join(out, f)));
  const version = hash.digest('hex').slice(0, 12);
  const cached = ['./', ...files.filter(f => f !== 'sw.js')];
  let sw = fs.readFileSync(path.join(root, 'web', 'sw.js'), 'utf8');
  sw = sw.replace("const VERSION = 'dev';", "const VERSION = '" + version + "';").replace("const FILES = ['./'];", 'const FILES = ' + JSON.stringify(cached) + ';');
  if (sw.includes("'dev'")) { console.error('service worker template was not filled in'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  console.log('web app built in ' + path.relative(root, out) + ' (version ' + version + ', ' + cached.length + ' files)');
} else console.log('web files copied to ' + path.relative(root, out) + '/');
