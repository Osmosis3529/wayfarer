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

- **The hall** (longhouse → town hall → city hall as the settlement evolves) assigns citizens to jobs, sells building upgrades, and lets you rest for free. It also sets how many citizens can live in Brackenford (14, then 26, then 38).
- **Population follows the pantry.** Newcomers arrive only once there is a hall, and the fuller the pantry is after the day's eating the faster they come: about 2 meals per citizen brings the odd traveler, 4 brings one a day, 8 brings two a day (up to the housing limit). The panel's Growth line says which it is today.
- **Staffing.** Every working building needs its own citizen: you can only build one while there are more citizens than working buildings (the hall and the Beacon need nobody). Upgrades need more: at least 1 citizen per building in a Village, 2 per building in a Town and 3 in a City.
- **Jobs.** Citizens start out without work. Assign them from the hall: each building holds a limited number of workers, and its output is per worker (soldiers have no limit). A building with nobody working in it stays closed.
- **Buildings you can enter**: the trading post, lumber mill, tannery, farm, hunters' lodge and gem hall buy and sell goods (specialists pay more for their own); the fishing hut and hunting camp sell meals for the pantry; the well heals you once a day; the smithy crafts gear; the mine has a shaft down into Brackenford Mine; the barracks shows your soldiers. Talk to any citizen by walking into them.
- **Routes.** Gatherers walk between their building and their worksite (farm fields, forest, lake, hills); soldiers patrol the roads around the plaza.
- **Upgrades and evolution.** Every building has one upgrade per tier (+50% output for its workers). Buy *all* of a tier's upgrades and Brackenford evolves to the next tier: the hall grows, buildings hold more workers, the upgrade list resets, and each upgrade now costs more (x1, x2, x3). The City tier is the last one; once every upgrade is bought there, the settlement is fully evolved.
- **Soldiers** are citizens assigned to the barracks. They patrol and fight near home, and the best weapon and armor you own set their damage and health.

## Caves and dungeons

Caves and dungeons are large winding mazes with loops, dead ends and chambers, and they are dark: you only see a circle of light around you (walls block it, so you see the wall but not what is behind it). Tiles you have lit stay faintly remembered. A **torch** burns for 120 steps and throws light twice as far: press **T** (or the torch button on a phone) to light one. The trading post and the lumber mill sell them (the mill is cheaper), caravans sell them, and caches in caves and dungeons sometimes hold some. The Delver's Lantern relic adds a little permanent light. Mines are not dark.

## War, soldiers and rival settlements

- **Marching soldiers.** In the barracks (or the war council) set how many soldiers follow you, from none up to everyone assigned to the barracks. They keep up with you across the overworld, attack enemies near them, and join your fights: after each of your actions they strike, and the foe may turn on one of them instead of you. A fallen soldier is replaced for 2 meals. Use "send them home" to stand the marchers down. (They wait outside caves, mines, dungeons and the settlement.)
- **Everyone to the barracks.** The war council can call every citizen to arms in one click (production stops), and "stand down" puts everyone back in their old jobs.
- **Wars of conquest.** Once you have a barracks, declare war on any settlement you have found, from the war council in the hall or barracks, or from inside the settlement itself. Its citizens come out as town guards (and a captain) and hold the ground around their town. Beat every defender, with your own hands or your soldiers', and the settlement is annexed: plunder, a few survivors join Brackenford, room for 4 more citizens at home, and a daily tribute of coin and goods. Merchants close their gates while you are at war; you can make peace for coin, but they will remember it.
- **Aggression.** Every other settlement has a size and a randomized temper (peaceful, wary or hostile) that drifts over time. Hostile ones raid Brackenford: raiders appear far from home, warn you, and march on the settlement. Cut them down before they reach it or they ransack the pantry. Driving off a raid pays a reward and cools the raiders down. Settlements also attack each other (you hear about the ones you have found), and a weak one can be taken over by its neighbor.

## Play it from the web (iPhone, iPad, Android, anywhere)

The game can also be hosted as a web app that installs to a phone's home screen, runs full screen and works offline. A GitHub Actions workflow ("Deploy web app") publishes it to GitHub Pages on every push to `main`. It costs nothing for a public repository.

- **One-time setup:** in the repository's Settings → Pages, set *Build and deployment → Source* to **GitHub Actions** (not "Deploy from a branch": that publishes the README instead of the game). Then run the "Deploy web app" workflow from the Actions tab (or push to `main`). If you switched from the branch option, run the workflow once more afterwards, because the old branch publish can land after it and replace the game with the README. The address will be `https://<your-github-name>.github.io/<repository-name>/`.
- **iPhone / iPad:** open the address in Safari, tap the Share button, then **Add to Home Screen**. **Android:** in Chrome, menu → *Install app*.
- **Saves** are kept in the browser on that device. Installed apps are the safest place for them, but use **Export save** now and then: on a phone it opens the share sheet (Save to Files, AirDrop, ...), and **Load World from Save File** brings it back.
- **Updates** download in the background after each deploy; the game says when a new version is ready and you reload to play it.
- **Try it locally:** `npm run web:pwa` builds the hosted version into `site/`; serve that folder with any static web server (for example `python3 -m http.server -d site`) and open `http://localhost:8000`. Service workers only run on `localhost` or HTTPS.

## Troubleshooting

If `npm start` says "Electron failed to install correctly", npm may have blocked Electron's download script. Run `npm install-scripts approve electron` and then `npm install` again. If it still fails, unpack the cached download by hand:

```
node node_modules/electron/install.js
unzip -q ~/.cache/electron/*/electron-v<version>-linux-x64.zip -d node_modules/electron/dist
printf electron > node_modules/electron/path.txt
```

(Use the matching zip for your platform; on Windows and macOS, switching to Node 22 is usually enough.)

## Tests

`npm test` runs browser-driven checks of the game rules (saving and loading, harvesting, combat, respawns, the boss and the beacon, settlement jobs, routes and upgrades, the dark mazes, and the offline web-app build). Run `npx playwright-core install chromium` once first, or point `WAYFARER_BROWSER` at an existing Chrome or Chromium binary.

## Phone and tablet (Android)

The game also runs on Android, in landscape, with an on-screen walking pad, an Interact (E) button, Eat, Pause and a menu button that slides out the log, pack and building panels. The touch controls switch on automatically on touch devices; add `?touch=1` to the page address to try them on a desktop browser.

The Android app is the same web game wrapped with [Capacitor](https://capacitorjs.com). To build an installable debug APK you need JDK 21 and the Android SDK (platform 36, build-tools 36):

```
npm install
npm run android:apk
```

The APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`. To install it, copy it to the phone, open it and allow installing from that source, or use `adb install`. A debug APK is fine for your own devices; Google Play would need a signed release build.

You can also let GitHub build it: on the Actions tab, run "Android debug APK" and download the `wayfarer-debug-apk` artifact. The `android:sync` script (`npm run android:sync`) copies the latest game files into the Android project without building.
