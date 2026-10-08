// Browser-driven tests for Wayfarer's game rules.
// Setup: `npm install`, then `npx playwright-core install chromium` (or set WAYFARER_BROWSER to a Chrome/Chromium binary).
// Run: `npm test`
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright-core');

const PAGE = 'file://' + path.join(__dirname, '..', 'wayfarer.html');
let browser;
test.before(async () => { browser = await chromium.launch({ executablePath: process.env.WAYFARER_BROWSER || undefined }); });
test.after(async () => { await browser.close(); });

// Opens a fresh game with the world clock paused so nothing moves unless a test makes it.
async function game(fn) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE);
  await page.evaluate(() => { newWorld(); manualPause = true; });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('fox fur unlocks the hunters lodge', () => game(async page => {
  const unlocked = await page.evaluate(() => { state.x = HOME.x + 12; state.y = HOME.y; map[state.y][state.x + 1] = 'x'; interact(); return state.unlocked.huntersLodge; });
  assert.equal(unlocked, true);
}));

test('save, load and rollback of a damaged save', () => game(async page => {
  const r = await page.evaluate(() => {
    state.coin = 41; saveWorld();
    const good = JSON.parse(localStorage.getItem(SAVE_KEY));
    state.coin = 5;
    let damaged = ''; try { hydrateWorld({ ...good, state: { ...good.state, x: 'nope' } }); } catch (e) { damaged = e.message; }
    const coinAfterBad = state.coin;
    let missingSite = ''; try { hydrateWorld({ ...good, state: { ...good.state, zone: 'cave', siteId: 'nope', siteKind: 'cave' } }); } catch (e) { missingSite = e.message; }
    const afterMissing = [state.coin, state.zone];
    hydrateWorld(good);
    return { damaged, coinAfterBad, missingSite, afterMissing, coin: state.coin };
  });
  assert.match(r.damaged, /damaged/);
  assert.equal(r.coinAfterBad, 5);
  assert.match(r.missingSite, /restored/);
  assert.deepEqual(r.afterMissing, [5, 'overworld']);
  assert.equal(r.coin, 41);
}));

test('text from a save file is escaped', () => game(async page => {
  const r = await page.evaluate(() => {
    saveWorld(); const d = JSON.parse(localStorage.getItem(SAVE_KEY));
    d.settlements[0] = { ...d.settlements[0], name: '<img src=x onerror=window.pwn=1>', id: "a');window.pwn=2;('", discovered: true };
    hydrateWorld(d); manualPause = true;
    return { imgs: document.querySelectorAll('#settlement-list img').length, pwn: window.pwn, id: settlements[0].id };
  });
  assert.equal(r.imgs, 0); assert.equal(r.pwn, undefined); assert.match(r.id, /^\w+$/);
}));

test('harvest yields fall, patches regrow, woods are walkable', () => game(async page => {
  const r = await page.evaluate(() => {
    state.x = HOME.x + 20; state.y = HOME.y;
    for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) overworld[state.y + dy][state.x + dx] = '.';
    overworld[state.y][state.x + 1] = '♣';
    const yields = []; for (let i = 0; i < 4; i++) { const b = state.inv.wood; interact(); yields.push(state.inv.wood - b); }
    const stillThere = overworld[state.y][state.x + 1] === '♣';
    state.clock += NODE_REGEN['♣'] * 2 + 1; const b2 = state.inv.wood; interact();
    const x0 = state.x; move(1, 0);
    return { yields, stillThere, regrown: state.inv.wood - b2, walked: state.x - x0 };
  });
  assert.deepEqual(r.yields, [2, 1, 1, 0]); assert.equal(r.stillThere, true); assert.equal(r.regrown, 1); assert.equal(r.walked, 1);
}));

test('crews forage without clearing patches', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; build('lumberMill');
    const w = state.workers.find(w => w.building === 'lumberMill');
    w.x = HOME.x + 8; w.y = HOME.y + 8;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) overworld[w.y + dy][w.x + dx] = '.';
    overworld[w.y][w.x + 1] = '♣';
    const before = state.inv.wood; for (let i = 0; i < 60; i++) forage(w);
    return { gained: state.inv.wood - before, tile: overworld[w.y][w.x + 1] };
  });
  assert.equal(r.gained, 3); assert.equal(r.tile, '♣');
}));

test('death takes loot and coin; the enemy keeps its wounds', () => game(async page => {
  const r = await page.evaluate(() => {
    state.coin = 50; state.inv.wood = 5; state.inv.gems = 1; state.inv.sunstone = 1; state.hp = 1; state.x = HOME.x + 12; state.y = HOME.y;
    const x = state.x + 1, y = state.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, chooseEnemy('overworld'));
    startCombat(x, y, state.x, state.y); const lvl = state.combat.level; state.combat.hp -= 3; const wounded = state.combat.hp;
    state.combat.enemy.attack = 50; enemyTurn();
    const lostState = { coin: state.coin, wood: state.inv.wood, gems: state.inv.gems, sun: state.inv.sunstone, home: state.x === HOME.x };
    state.x = x - 1; state.y = y; startCombat(x, y, state.x, state.y);
    return { lostState, wounded, resumedHp: state.combat.hp, sameLevel: state.combat.level === lvl };
  });
  assert.deepEqual(r.lostState, { coin: 30, wood: 2, gems: 0, sun: 1, home: true });
  assert.equal(r.resumedHp, r.wounded); assert.ok(r.sameLevel);
}));

test('boss, sunstone and beacon win', () => game(async page => {
  const r = await page.evaluate(() => {
    const k = dungeons.find(d => d.boss); const glyph = overworld[k.y][k.x];
    state.x = k.x; state.y = k.y; state.level = 5; enterInstance(k, 'dungeon');
    const bx = map[0].length - 4, mid = Math.floor(map.length / 2);
    state.x = bx - 1; state.y = mid; startCombat(bx, mid, state.x, state.y);
    const bossName = state.combat.enemy.name; state.combat.hp = 1; battleAction('heavy');
    const slain = state.bossSlain, sun = state.inv.sunstone;
    exitInstance(); state.x = HOME.x + 1; state.y = HOME.y + 3;
    Object.assign(state.inv, { wood: 30, stone: 30, iron: 5, silver: 5, gold: 3, gems: 3 });
    build('beacon'); const early = state.built.beacon; state.town.tier = 3; build('beacon');
    return { glyph, bossName, slain, sun, early, built: state.built.beacon, won: state.won };
  });
  assert.deepEqual(r, { glyph: 'K', bossName: 'The Hollow King', slain: true, sun: 1, early: false, built: true, won: true });
}));

test('overworld enemies respawn up to the cap', () => game(async page => {
  const r = await page.evaluate(() => {
    const count = () => overworld.flat().filter(c => c === 'g').length, c0 = count();
    for (let y = 0; y < overworld.length; y++) for (let x = 0; x < overworld[0].length; x++) if (overworld[y][x] === 'g' && Math.random() < .5) { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); }
    const c1 = count(); spawnEnemy(); const c2 = count(); for (let i = 0; i < 200; i++) spawnEnemy();
    return { c0, c1, c2, final: count() };
  });
  assert.equal(r.c2, r.c1 + 1); assert.equal(r.final, r.c0);
}));

test('dungeons refill only after every foe is defeated', () => game(async page => {
  const r = await page.evaluate(() => {
    const k = dungeons.find(d => !d.boss), reenter = () => { exitInstance(); state.x = k.x; state.y = k.y; enterInstance(k, 'dungeon'); };
    state.x = k.x; state.y = k.y; enterInstance(k, 'dungeon'); const m = map, count = () => m.flat().filter(c => c === 'g').length;
    let last = null; for (let y = 0; y < m.length; y++) for (let x = 0; x < m[0].length; x++) if (m[y][x] === 'g') { if (!last) last = [x, y]; else { m[y][x] = '.'; enemyBucket(m).delete(x + ',' + y); } }
    state.clock += INSTANCE_RESPAWN_MS * 100; reenter(); const whileOneAlive = count();
    startCombat(last[0], last[1], state.x, state.y); state.combat.hp = 1; battleAction('heavy'); const cleared = count();
    state.clock += INSTANCE_RESPAWN_MS * 2 + 5; reenter(); const afterTwoMinutes = count();
    return { whileOneAlive, cleared, afterTwoMinutes };
  });
  assert.deepEqual(r, { whileOneAlive: 1, cleared: 0, afterTwoMinutes: 2 });
}));

test('pause stops the world clock; real time otherwise advances it', () => game(async page => {
  const paused = await page.evaluate(async () => { const c = state.clock; await new Promise(r => setTimeout(r, 700)); return state.clock - c; });
  assert.equal(paused, 0);
  const running = await page.evaluate(async () => { setPause(false); const c = state.clock; await new Promise(r => setTimeout(r, 700)); return state.clock - c; });
  assert.ok(running > 300);
}));

test('autosave is written each day and can be loaded', () => game(async page => {
  const r = await page.evaluate(() => { state.coin = 77; advanceDay(); const raw = localStorage.getItem(AUTOSAVE_KEY); state.coin = 1; hydrateWorld(JSON.parse(raw)); manualPause = true; return state.coin; });
  assert.equal(r, 77);
}));

test('building buttons show the real costs and building deducts them', () => game(async page => {
  const r = await page.evaluate(() => {
    state.unlocked = { smithy: true, huntersLodge: true, gemHall: true }; render();
    const text = document.getElementById('actions').textContent;
    const missing = Object.keys(BUILD_COSTS).filter(k => !text.includes(costLabel(k)));
    Object.assign(state.inv, { wood: 100, stone: 100, iron: 10, furs: 10, silver: 10, gems: 10, gold: 10 });
    const before = { ...state.inv }; build('huntersLodge');
    return { missing, wood: before.wood - state.inv.wood, stone: before.stone - state.inv.stone, furs: before.furs - state.inv.furs };
  });
  assert.deepEqual(r, { missing: [], wood: 4, stone: 2, furs: 2 });
}));
