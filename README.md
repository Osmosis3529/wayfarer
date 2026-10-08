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

Five **guardians** hold ancient relics: two in dungeons, two at the bottom of mines, and one in a cave. Each relic is a permanent buff that is never lost when you die (Alpha's Fang: +2 damage, Warden's Aegis: +2 hearts, Delver's Lantern: see farther and gather +1, Heartstone Shard: berries heal 50% more, Mossback Hide: enemies hit 1 less). Slay all five and the road to the final dungeon, the **Hollow Keep**, appears on your map. Defeat the Hollow King there to win a Sunstone, grow Brackenford into a City, then build the Wayfarer's Beacon. Brackenford's panel lists which guardians are still at large and roughly where.

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

## Phone and tablet (Android)

The game also runs on Android, in landscape, with an on-screen walking pad, an Interact (E) button, Eat, Pause and a menu button that slides out the log, pack and building panels. The touch controls switch on automatically on touch devices; add `?touch=1` to the page address to try them on a desktop browser.

The Android app is the same web game wrapped with [Capacitor](https://capacitorjs.com). To build an installable debug APK you need JDK 21 and the Android SDK (platform 36, build-tools 36):

```
npm install
npm run android:apk
```

The APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`. To install it, copy it to the phone, open it and allow installing from that source, or use `adb install`. A debug APK is fine for your own devices; Google Play would need a signed release build.

You can also let GitHub build it: on the Actions tab, run "Android debug APK" and download the `wayfarer-debug-apk` artifact. The `android:sync` script (`npm run android:sync`) copies the latest game files into the Android project without building.
