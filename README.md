# Wayfarer

A text-graphics exploration and settlement-building game for Windows.

## Play from source

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm start`.

## Build the Windows installer

Run `npm run dist`. The NSIS installer will be created in `dist/` and offers a desktop shortcut during installation.

Worlds are saved in the app's local browser storage. Use the in-game save/export options to keep backups.

The world runs in real time (a day lasts 90 seconds); it pauses while a dialog or fight is open, or the window is in the background.
