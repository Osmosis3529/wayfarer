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

## Settlement mode

Stand on the home tile (⌂) and press **E** to walk into Brackenford, a detailed 60×40 map with roads, a plaza, fields, a lake and a plot for every building. Bump an empty plot to build there; bump a built door (or press E beside it) to go inside. Press M beside home for the explored-world chart.

- **The hall** (longhouse → town hall → city hall as the settlement evolves) assigns citizens to jobs, sells building upgrades, and lets you rest for free. It also sets how many citizens can live in Brackenford (8, 16, then 28).
- **Jobs.** Citizens start out without work. Assign them from the hall: each building holds a limited number of workers, and its output is per worker (soldiers have no limit). A building with nobody working in it stays closed.
- **Buildings you can enter**: the trading post, lumber mill, tannery, farm, hunters' lodge and gem hall buy and sell goods (specialists pay more for their own); the fishing hut and hunting camp sell meals for the pantry; the well heals you once a day; the smithy crafts gear; the mine has a shaft down into Brackenford Mine; the barracks shows your soldiers. Talk to any citizen by walking into them.
- **Routes.** Gatherers walk between their building and their worksite (farm fields, forest, lake, hills); soldiers patrol the roads around the plaza.
- **Upgrades and evolution.** Every building has one upgrade per tier (+50% output for its workers). Buy *all* of a tier's upgrades and Brackenford evolves to the next tier: the hall grows, buildings hold more workers, the upgrade list resets, and each upgrade now costs more (x1, x2, x3). The City tier is the last one; once every upgrade is bought there, the settlement is fully evolved.
- **Soldiers** are citizens assigned to the barracks. They patrol and fight near home, and the best weapon and armor you own set their damage and health.

## War, soldiers and rival settlements

- **Marching soldiers.** In the barracks (or the war council) set how many soldiers follow you, from none up to everyone assigned to the barracks. They keep up with you across the overworld, attack enemies near them, and join your fights: after each of your actions they strike, and the foe may turn on one of them instead of you. A fallen soldier is replaced for 2 meals. Use "send them home" to stand the marchers down. (They wait outside caves, mines, dungeons and the settlement.)
- **Everyone to the barracks.** The war council can call every citizen to arms in one click (production stops), and "stand down" puts everyone back in their old jobs.
- **Wars of conquest.** Once you have a barracks, declare war on any settlement you have found, from the war council in the hall or barracks, or from inside the settlement itself. Its citizens come out as town guards (and a captain) and hold the ground around their town. Beat every defender, with your own hands or your soldiers', and the settlement is annexed: plunder, a few survivors join Brackenford, room for 4 more citizens at home, and a daily tribute of coin and goods. Merchants close their gates while you are at war; you can make peace for coin, but they will remember it.
- **Aggression.** Every other settlement has a size and a randomized temper (peaceful, wary or hostile) that drifts over time. Hostile ones raid Brackenford: raiders appear far from home, warn you, and march on the settlement. Cut them down before they reach it or they ransack the pantry. Driving off a raid pays a reward and cools the raiders down. Settlements also attack each other (you hear about the ones you have found), and a weak one can be taken over by its neighbor.

## Troubleshooting

If `npm start` says "Electron failed to install correctly", npm may have blocked Electron's download script. Run `npm install-scripts approve electron` and then `npm install` again. If it still fails, unpack the cached download by hand:

```
node node_modules/electron/install.js
unzip -q ~/.cache/electron/*/electron-v<version>-linux-x64.zip -d node_modules/electron/dist
printf electron > node_modules/electron/path.txt
```

(Use the matching zip for your platform; on Windows and macOS, switching to Node 22 is usually enough.)

## Tests

`npm test` runs browser-driven checks of the game rules (saving and loading, harvesting, combat, respawns, the boss and the beacon, settlement jobs, routes and upgrades). Run `npx playwright-core install chromium` once first, or point `WAYFARER_BROWSER` at an existing Chrome or Chromium binary.

## Phone and tablet (Android)

The game also runs on Android, in landscape, with an on-screen walking pad, an Interact (E) button, Eat, Pause and a menu button that slides out the log, pack and building panels. The touch controls switch on automatically on touch devices; add `?touch=1` to the page address to try them on a desktop browser.

The Android app is the same web game wrapped with [Capacitor](https://capacitorjs.com). To build an installable debug APK you need JDK 21 and the Android SDK (platform 36, build-tools 36):

```
npm install
npm run android:apk
```

The APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`. To install it, copy it to the phone, open it and allow installing from that source, or use `adb install`. A debug APK is fine for your own devices; Google Play would need a signed release build.

You can also let GitHub build it: on the Actions tab, run "Android debug APK" and download the `wayfarer-debug-apk` artifact. The `android:sync` script (`npm run android:sync`) copies the latest game files into the Android project without building.
