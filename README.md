# Wayfarer

A text-graphics exploration and settlement-building game for Windows.

## Play from source

1. Install Node.js 20 or 22 (the current long-term-support releases; very new Node versions have broken Electron's installer).
2. Run `npm install`.
3. Run `npm start`.

## Build the Windows installer

Run `npm run dist`. The NSIS installer will be created in `dist/` and offers a desktop shortcut during installation.

Worlds are saved in the app's local browser storage. Use the in-game save/export options to keep backups.

The world runs in real time (a day lasts 90 seconds); it pauses while a dialog or fight is open, or the window is in the background.

## Goal

Slay the Hollow King in the Hollow Keep (the farthest dungeon, marked K once found) to win a Sunstone, grow Brackenford into a City, then build the Wayfarer's Beacon.

## Troubleshooting

If `npm start` says "Electron failed to install correctly", npm may have blocked Electron's download script. Run `npm install-scripts approve electron` and then `npm install` again. If it still fails, unpack the cached download by hand:

```
node node_modules/electron/install.js
unzip -q ~/.cache/electron/*/electron-v<version>-linux-x64.zip -d node_modules/electron/dist
printf electron > node_modules/electron/path.txt
```

(Use the matching zip for your platform; on Windows and macOS, switching to Node 22 is usually enough.)

## Tests

`npm test` runs browser-driven checks of the game rules (saving and loading, harvesting, combat, respawns, the boss and the beacon). Run `npx playwright-core install chromium` once first, or point `WAYFARER_BROWSER` at an existing Chrome or Chromium binary.
