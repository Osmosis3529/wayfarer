// Copies the game's web files into www/ so Capacitor can package them for Android.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets', 'kenney'), { recursive: true });
fs.copyFileSync(path.join(root, 'wayfarer.html'), path.join(out, 'index.html'));
for (const f of ['gfx.js', 'settlement.js', 'war.js', 'touch.js']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const f of ['kenney-data.js', 'LICENSE.txt']) fs.copyFileSync(path.join(root, 'assets', 'kenney', f), path.join(out, 'assets', 'kenney', f));
console.log('web files copied to www/');
