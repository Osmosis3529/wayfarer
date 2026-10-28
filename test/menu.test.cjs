// Browser-driven tests for the pop-up menu: its tabs, the keys that open it, and the world log it shows.
// Run: `npm test`
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright-core');

const PAGE = 'file://' + path.join(__dirname, '..', 'wayfarer.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.WAYFARER_BROWSER || undefined }); });
test.after(async () => { await browser.close(); });

async function game(fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await page.evaluate(() => {
    newWorld(); manualPause = true;
    window.dialogText = () => document.getElementById('dialog').textContent;
    window.dialogOpen = () => document.getElementById('overlay').style.display === 'grid';
    window.tabs = () => [...document.querySelectorAll('#dialog .tabs button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : ''));
    window.key = k => { const p = manualPause; manualPause = false; document.dispatchEvent(new KeyboardEvent('keydown', { key: k })); manualPause = p; };
    window.RICH = () => {
      Object.assign(state.inv, { wood: 140, stone: 140, iron: 140, furs: 140, silver: 140, gold: 140, gems: 140, copper: 140, berries: 40, coal: 40 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40; state.town.food = 40;
    };
    window.calm = () => { state.day = 5; for (const s of settlements) { s.aggression = 0; s.owner = null; } state.npcWars = []; };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('the menu is a pop-up with six tabs, and the menu button, C, I and Esc open it', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}; openMenu(); out.first = tabs(); out.text = dialogText().includes('You · level'); closeDialog();
    out.button = [...document.querySelectorAll('.stats .save-btn')].find(b => b.textContent.startsWith('Menu')).click() || dialogOpen(); out.afterButton = tabs()[0]; closeDialog();
    key('c'); out.c = [dialogOpen(), tabs()[0]]; key('Escape'); out.esc = dialogOpen();
    key('i'); out.i = tabs()[1]; closeDialog();
    key('Escape'); out.escOpens = [dialogOpen(), tabs()[1]]; key('Escape');   // Esc reopens the tab you were last on
     out.escCloses = !dialogOpen();
    key('m'); out.m = tabs()[2]; closeDialog(); key('j'); out.j = tabs()[3]; closeDialog();
    openMenu('logs'); closeDialog(); openMenu(); out.remembered = tabs()[4]; closeDialog();
    openMenu('nonsense'); out.unknown = tabs().findIndex(t => t.endsWith('*')); closeDialog();
    return out;
  });
  assert.deepEqual(r.first, ['Stats*', 'Inventory', 'Map', 'Journal', 'World logs', 'Settings']); assert.equal(r.text, true);
  assert.equal(r.button, true); assert.equal(r.afterButton, 'Stats*'); assert.deepEqual(r.c, [true, 'Stats*']); assert.equal(r.esc, false); assert.equal(r.i, 'Inventory*');
  assert.deepEqual(r.escOpens, [true, 'Inventory*']); assert.equal(r.escCloses, true); assert.equal(r.m, 'Map*'); assert.equal(r.j, 'Journal*'); assert.equal(r.remembered, 'World logs*'); assert.equal(r.unknown, 4);
}));

test('the menu does not open in a fight or on the start screen, and any other dialog replaces it', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    state.x = HOME.x + 12; state.y = HOME.y; const x = state.x + 1, y = state.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.wolf });
    startCombat(x, y, state.x, state.y); const before = dialogText(); openMenu(); out.fight = dialogText() === before; state.combat = null; closeDialog();
    document.getElementById('start-screen').style.display = ''; openMenu(); out.start = !dialogOpen(); key('c'); out.startKey = !dialogOpen(); document.getElementById('start-screen').style.display = 'none';
    openMenu('stats'); const open = menuTab; showDialog('<p>Something else</p>'); out.replaced = [open, menuTab, document.getElementById('dialog').classList.contains('menu')];
    openMenu('inventory'); out.tab = menuTab; closeDialog(); out.closed = menuTab;
    return out;
  });
  assert.equal(r.fight, true); assert.equal(r.start, true); assert.equal(r.startKey, true); assert.deepEqual(r.replaced, ['stats', null, false]); assert.equal(r.tab, 'inventory'); assert.equal(r.closed, null);
}));

test('spending a stat point updates the open menu in place', () => game(async page => {
  const r = await page.evaluate(() => {
    state.statPoints = 2; openMenu('stats'); const before = dialogText().includes('2 stat points to spend');
    [...document.querySelectorAll('#dialog button')].find(b => b.textContent === '+1').click();
    const after = [menuTab, dialogText().includes('1 stat point to spend'), tabs()[0]];
    spendPoint('attack'); const done = [menuTab, dialogText().includes('to spend'), [...document.querySelectorAll('#dialog button')].some(b => b.textContent === '+1'), state.stats];
    return { before, after, done };
  });
  assert.equal(r.before, true); assert.deepEqual(r.after, ['stats', true, 'Stats*']); assert.equal(r.done[0], 'stats'); assert.equal(r.done[1], false); assert.equal(r.done[2], false);
}));

test('the inventory tab shows the pack, relics and what you can do here, and an action closes the menu', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); state.relics.fang = true; state.hp = 1; state.inv.berries = 3; render(); openMenu('inventory'); const text = dialogText();
    const names = ['Timber', 'Stone', 'Coal', 'Berries', 'Copper', 'Torch'].every(n => text.includes(n)), caps = text.includes('/50'), actions = [...document.querySelectorAll('#dialog .actions button')].map(b => b.textContent);
    const eat = [...document.querySelectorAll('#dialog .actions button')].find(b => b.textContent.startsWith('Eat'));
    eat.click(); return { names, caps, actions, closed: !dialogOpen(), hp: state.hp, berries: state.inv.berries, journalButton: actions.some(a => a.startsWith('Journal')) };
  });
  assert.equal(r.names, true); assert.equal(r.caps, true); assert.ok(r.actions.some(a => a.startsWith('Eat')) && r.journalButton && r.actions.some(a => a.startsWith('World map')), r.actions.join());
  assert.equal(r.closed, true); assert.ok(r.hp > 1 && r.berries === 2);
}));

test('the map tab holds the world map and fast travel, and says so when you are underground', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0]; s.discovered = true; const out = {};
    openMap(); out.open = [menuTab, tabs()[2], !!document.getElementById('worldmap'), dialogText().includes('World map')]; out.canvas = document.getElementById('worldmap').width;
    const px = document.getElementById('worldmap').getContext('2d').getImageData(HOME.x * 3 + 1, HOME.y * 3 + 1, 1, 1).data; out.painted = px[3] > 0 && (px[0] + px[1] + px[2]) > 0; closeDialog();
    enterInstance(caves[0], 'cave'); openMap(); out.cave = dialogOpen(); openMenu('map'); out.caveTab = [!document.getElementById('worldmap'), dialogText().includes('underground')]; closeDialog(); exitInstance();
    state.visited[s.id] = true; state.coin = 500; enterTown(); openMenu('map'); const ride = [...document.querySelectorAll('#dialog button')].find(b => b.textContent.startsWith('Ride'));
    out.ride = !!ride && !ride.disabled; return out;
  });
  assert.deepEqual(r.open, ['map', 'Map*', true, true]); assert.equal(r.canvas, 224 * 3); assert.equal(r.painted, true); assert.equal(r.cave, false); assert.deepEqual(r.caveTab, [true, true]); assert.equal(r.ride, true);
}));

test('the journal tab lists jobs, allies and enemies, reports on the settlement, and giving up a job refreshes it', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); const s = settlements[0]; s.discovered = true; s.people = 8; state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog(); takeQuest(s.id, 0); exitTown();
    journal(); const text = dialogText(), tab = menuTab;
    const report = text.includes('Brackenford') && text.includes('Citizens') && text.includes('Pantry');
    [...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Give up').click();
    return { tab, report, sections: ['Jobs', 'Allies', 'Enemies', 'Wars between settlements'].every(h => text.includes(h)), after: [menuTab, dialogText().includes('No jobs taken')], quest: relOf(s.id).quest };
  });
  assert.equal(r.tab, 'journal'); assert.equal(r.report, true); assert.equal(r.sections, true); assert.deepEqual(r.after, ['journal', true]); assert.equal(r.quest, null);
}));

test('the world logs tab shows the news, newest first, and your own field notes', () => game(async page => {
  const r = await page.evaluate(() => {
    state.worldLog = []; logWorld('Old news'); state.day = 9; logWorld('Fresh news', 'alert'); say('A note for the field book.', 'gold');
    openMenu('logs'); const text = dialogText(), alert = !!document.querySelector('#dialog .log p.alert');
    return { text, order: text.indexOf('Fresh news') < text.indexOf('Old news'), days: text.includes('Day 9') && text.includes('Day 1'), notes: text.includes('A note for the field book.'), alert, empty: (state.worldLog = [], openMenu('logs'), dialogText().includes('Nothing has happened yet')) };
  });
  assert.equal(r.order, true); assert.equal(r.days, true); assert.equal(r.notes, true); assert.equal(r.alert, true); assert.equal(r.empty, true);
}));

test('what happens in the world is written to the log: wars, raids, treaties, growth and conquest', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); const [a, b, c] = settlements; for (const s of [a, b, c]) { s.discovered = true; s.people = 8; s.cap = 8; s.goal = 8; }
    state.worldLog = []; const out = {}, texts = () => state.worldLog.map(l => l.t);
    const w = startNpcWar(a, b); out.war = texts().some(t => t.includes('War:') && t.includes(a.name));
    endNpcWar(w, a.id, 'win'); out.won = texts().some(t => t.includes('has won the war'));
    const w2 = startNpcWar(c, b); endNpcWar(w2, c.id, 'draw'); out.draw = texts().some(t => t.includes('fizzled out'));
    c.owner = null; a.owner = null; state.hostile = {}; state.built.hut = true; state.built.longhouse = true; startRaid(c); out.raid = texts().some(t => t.includes('Raiders from') && t.includes(c.name));
    for (const [x, y] of raiderTiles()) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; } state.raid.left = 1; state.raid.looted = 0; endRaid(); out.broken = texts().some(t => t.includes('was broken at Brackenford'));
    startMonsterRaid(); out.monsters = texts().some(t => t.includes('Monsters are raiding Brackenford'));
    state.raid = null; state.deals[b.id] = { sell: null, buy: null, gear: false, last: 0, since: 0, trips: 0, profit: 0 }; breakAlliance(b.id); out.broke = texts().some(t => t.includes('ended your alliance'));
    state.day = 8; c.people = 11; c.cap = 11; c.goal = 14; delete c.rank; c.people = 11; c.rank = 0; c.cap = 14; growSettlements(); c.people = 15; c.cap = 15; growSettlements(); out.grew = texts().some(t => t.includes('has grown into a town'));
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert.equal(v, true, k);
}));

test('the settings tab saves, exports, and toggles graphics and art, keeping its labels current', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}; openMenu('settings'); const btn = t => [...document.querySelectorAll('#dialog button')].find(b => b.textContent.startsWith(t));
    out.labels = ['Save world', 'Export save', 'Graphics:', 'Art:'].map(t => !!btn(t)); out.controls = dialogText().includes('C or Esc opens this menu');
    const gfx0 = btn('Graphics:').textContent; btn('Graphics:').click(); out.gfx = [gfx0, btn('Graphics:').textContent, menuTab, document.getElementById('gfx-btn').textContent === btn('Graphics:').textContent];
    const art0 = btn('Art:').textContent; btn('Art:').click(); out.art = [art0, btn('Art:').textContent, menuTab];
    state.coin = 77; btn('Save world').click(); out.saved = !!localStorage.getItem(SAVE_KEY) && JSON.parse(localStorage.getItem(SAVE_KEY)).state.coin === 77;
    return out;
  });
  assert.deepEqual(r.labels, [true, true, true, true]); assert.equal(r.controls, true);
  assert.notEqual(r.gfx[0], r.gfx[1]); assert.equal(r.gfx[2], 'settings'); assert.equal(r.gfx[3], true); assert.notEqual(r.art[0], r.art[1]); assert.equal(r.art[2], 'settings'); assert.equal(r.saved, true);
}));
