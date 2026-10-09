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
  const unlocked = await page.evaluate(() => { state.x = HOME.x + 12; state.y = HOME.y; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) map[state.y + dy][state.x + dx] = '.'; map[state.y][state.x + 1] = 'x'; interact(); return state.unlocked.huntersLodge; });
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
    openMap(); const map = { imgs: document.querySelectorAll('#dialog img').length, text: document.getElementById('dialog').textContent.includes('<img src=x') };
    closeDialog(); enterSettlement(settlements[0].id);
    const plots = Object.entries(npcMap().plots), hall = plots.find(([, p]) => p.kind === 'hall')[0];
    renderTown(); const panel = document.querySelectorAll('#town-stats img, #townfolk img').length;
    npcBuilding(hall); const hallImgs = document.querySelectorAll('#dialog img').length;
    return { map, panel, hallImgs, pwn: window.pwn, id: settlements[0].id };
  });
  assert.equal(r.map.imgs, 0); assert.equal(r.map.text, true); assert.equal(r.panel, 0); assert.equal(r.hallImgs, 0); assert.equal(r.pwn, undefined); assert.match(r.id, /^\w+$/);
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
    const k = dungeons.find(d => d.boss); state.relics = { fang: 1 }; revealKeep(); const glyph = overworld[k.y][k.x];
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
    const k = dungeons.find(d => !d.boss && !d.miniBoss), awayFor = ms => { exitInstance(); state.clock += ms; state.x = k.x; state.y = k.y; enterInstance(k, 'dungeon'); };
    state.x = k.x; state.y = k.y; enterInstance(k, 'dungeon'); const m = map, count = () => m.flat().filter(c => c === 'g').length;
    let last = null; for (let y = 0; y < m.length; y++) for (let x = 0; x < m[0].length; x++) if (m[y][x] === 'g') { if (!last) last = [x, y]; else { m[y][x] = '.'; enemyBucket(m).delete(x + ',' + y); } }
    awayFor(INSTANCE_RESPAWN_MS * 100); const whileOneAlive = count();
    startCombat(last[0], last[1], state.x, state.y); state.combat.hp = 1; battleAction('heavy'); const cleared = count();
    awayFor(INSTANCE_RESPAWN_MS * 2 + 5); const afterTwoMinutes = count();
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
    state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
    const missing = Object.keys(BUILD_COSTS).filter(k => { buildPrompt(k); return !document.getElementById('dialog').textContent.includes(costLabel(k)); });
    Object.assign(state.inv, { wood: 100, stone: 100, iron: 10, furs: 10, silver: 10, gems: 10, gold: 10 });
    const before = { ...state.inv }; build('huntersLodge');
    return { missing, wood: before.wood - state.inv.wood, stone: before.stone - state.inv.stone, furs: before.furs - state.inv.furs };
  });
  assert.deepEqual(r, { missing: [], wood: 4, stone: 2, furs: 2 });
}));

test('every town and site can be reached from home', () => game(async page => {
  const r = await page.evaluate(() => {
    const k = mines[0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 2 && !'SCDKM⌂'.includes(overworld[k.y + dy][k.x + dx])) overworld[k.y + dy][k.x + dx] = '≈';
    const walledOff = !reachableFromHome()[k.y][k.x];
    ensureReachable();
    const seen = reachableFromHome();
    return { walledOff, unreachable: [...settlements, ...caves, ...dungeons, ...mines].filter(s => !seen[s.y][s.x]).length };
  });
  assert.deepEqual(r, { walledOff: true, unreachable: 0 });
}));

test('battle can be driven from the keyboard', () => game(async page => {
  const r = await page.evaluate(() => {
    state.x = HOME.x + 12; state.y = HOME.y; const x = state.x + 1, y = state.y;
    overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, chooseEnemy('overworld'));
    startCombat(x, y, state.x, state.y); return { hp: state.combat.hp, label: document.getElementById('item-button').textContent };
  });
  await page.keyboard.press('3');
  const after = await page.evaluate(() => ({ guardedUsed: state.focus, log: state.log[1].t }));
  assert.match(r.label, /\(4\)/); assert.ok(after.log.includes('guard'));
}));

test('text map fits the narrowest allowed window', async () => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(PAGE); await page.evaluate(() => { newWorld(); manualPause = true; useGfx = false; render(); });
  const overflow = await page.evaluate(() => { const m = document.getElementById('map'), w = m.parentElement; return w.scrollWidth - w.clientWidth; });
  await ctx.close();
  assert.ok(overflow <= 1, 'map wider than its panel by ' + overflow);
});

test('berries can be eaten underground', () => game(async page => {
  const r = await page.evaluate(() => {
    const k = mines[0]; state.x = k.x; state.y = k.y; enterInstance(k, 'mine');
    state.inv.berries = 2; state.hp = 1; state.maxHp = 10; render();
    const button = [...document.querySelectorAll('#actions button')].find(b => b.textContent.includes('Eat berries'));
    button.click();
    return { hasButton: !!button, hp: state.hp, berries: state.inv.berries };
  });
  assert.deepEqual(r, { hasButton: true, hp: 4, berries: 1 });
}));

test('mine levels refill from when you leave, not from when you entered', () => game(async page => {
  const r = await page.evaluate(() => {
    const k = mines[0]; state.x = k.x; state.y = k.y; enterInstance(k, 'mine');
    const m = map, count = () => m.flat().filter(c => c === 'g').length, cap = count();
    let kept = false; for (let y = 0; y < m.length; y++) for (let x = 0; x < m[0].length; x++) if (m[y][x] === 'g') { if (!kept) kept = true; else { m[y][x] = '.'; enemyBucket(m).delete(x + ',' + y); } }
    state.clock += INSTANCE_RESPAWN_MS * 30;           // spent a long time inside the level
    const reenter = away => { exitInstance(); state.clock += away; state.x = k.x; state.y = k.y; enterInstance(k, 'mine'); };
    reenter(0); const rightAway = count();
    reenter(INSTANCE_RESPAWN_MS + 5); const afterOneMinute = count();
    return { cap, rightAway, afterOneMinute };
  });
  assert.ok(r.cap >= 3); assert.equal(r.rightAway, 1); assert.equal(r.afterOneMinute, 2);
}));

test('common enemies are weaker than a leveled player', () => game(async page => {
  const r = await page.evaluate(() => {
    let wins = 0, total = 0;
    for (const name of ['wolf', 'boar', 'bandit']) for (let i = 0; i < 60; i++) {
      state.level = 3; state.maxHp = 6; state.hp = 6; state.inv.berries = 0; state.coin = 10; state.x = HOME.x + 12; state.y = HOME.y;
      state.equipped = { weapon: { name: 'Bronze knife', damage: 1 }, armor: { name: 'Padded vest', health: 1 } };
      const x = state.x + 1, y = state.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog[name] });
      startCombat(x, y, state.x, state.y);
      for (let t = 0; t < 40 && state.combat; t++) battleAction(state.focus > 0 ? 'heavy' : 'attack');
      total++; if (state.x !== HOME.x) wins++;       // a death sends you home
    }
    return wins / total;
  });
  assert.ok(r >= 0.9, 'win rate was ' + r);
}));

test('soldiers fight instead of instantly killing, and gear changes the outcome', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; build('barracks'); syncSoldiers();
    const place = () => { const g = state.soldiers[0]; const x = g.x + 1, y = g.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.boar }); return [g, x, y]; };
    const rounds = () => { const [g, x, y] = place(); let n = 0; while (overworld[y][x] === 'g' && state.soldiers.includes(g) && n < 60) { soldierFight(g, x, y); n++; g.hp = g.maxHp; } return n; };
    const avg = () => { let t = 0; for (let i = 0; i < 20; i++) t += rounds(); return t / 20; };
    const bare = avg();
    state.equipped.weapon = { name: 'Iron longsword', damage: 3 }; state.equipped.armor = { name: 'Ring mail', health: 3 }; syncSoldiers();
    const geared = avg();
    return { bare, geared, hpGeared: state.soldiers[0].maxHp };
  });
  assert.ok(r.bare > 1.5, 'unarmed soldiers still one-shot: ' + r.bare);
  assert.ok(r.geared < r.bare); assert.equal(r.hpGeared, 9);
}));

test('a fallen soldier is replaced for 2 meals, or waits until the pantry can pay', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; build('barracks'); syncSoldiers(); const n = state.soldiers.length;
    const kill = () => { const g = state.soldiers[0]; g.hp = 1; const x = g.x + 1, y = g.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.troll, level: 30, maxHp: 999, curHp: 999 }); soldierFight(g, x, y); };
    state.town.food = 5; kill(); syncSoldiers(); const paid = { food: state.town.food, soldiers: state.soldiers.length, debt: state.soldierDebt };
    state.town.food = 1; kill(); syncSoldiers(); const broke = { soldiers: state.soldiers.length, debt: state.soldierDebt };
    state.town.food = 6; advanceDay(); const later = { soldiers: state.soldiers.length, debt: state.soldierDebt, food: state.town.food };
    return { n, paid, broke, later };
  });
  assert.equal(r.paid.food, 3); assert.equal(r.paid.soldiers, r.n); assert.equal(r.paid.debt, 0);
  assert.equal(r.broke.soldiers, r.n - 1); assert.equal(r.broke.debt, 1);
  assert.equal(r.later.soldiers, r.n); assert.equal(r.later.debt, 0);
}));

test('towns have regional goods and trading requires being in town', () => game(async page => {
  const r = await page.evaluate(() => {
    const t = settlements[0]; t.discovered = true;
    const [cheap] = t.surplus, [dear] = t.scarce;
    const prices = { cheapBuy: regionPrice({ ...t, bias: 0 }, cheap, 'buy') - buyPrices[cheap], dearSell: regionPrice({ ...t, bias: 0 }, dear, 'sell') - sellPrices[dear] };
    state.x = HOME.x; state.y = HOME.y; closeDialog(); trade(t.id); const farAway = document.getElementById('overlay').style.display;
    state.x = t.x; state.y = t.y; trade(t.id); const inTown = document.getElementById('overlay').style.display;
    closeDialog(); state.coin = 0; openMap(); const rideButtons = [...document.querySelectorAll('#dialog button')].filter(b => b.textContent.startsWith('Ride') && !b.disabled).length;
    return { prices, farAway, inTown, listHasButton: rideButtons > 0, distinct: settlements.every(s => s.surplus.length === 2 && s.scarce.length === 2 && !s.surplus.some(k => s.scarce.includes(k))) };
  });
  assert.ok(r.prices.cheapBuy < 0); assert.ok(r.prices.dearSell > 0);
  assert.notEqual(r.farAway, 'grid'); assert.equal(r.inTown, 'grid'); assert.equal(r.listHasButton, false); assert.equal(r.distinct, true);
}));

test('starvation cuts production by 75% and recovers when fed', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; build('lumberMill'); state.assign.lumberMill = 4;
    const day = () => { state.inv.wood = 0; advanceDay(); return state.inv.wood; };            // from empty, so the supply limit never gets in the way
    state.town.food = 0; state.town.people = 2; const first = day(), starvingNow = state.starving;
    const cut = day();                                    // pantry still empty: starving day
    state.starving = false; state.town.food = 50; const normal = day(); const fedFlag = state.starving;
    return { first, starvingNow, cut, normal, fedFlag };
  });
  assert.equal(r.starvingNow, true); assert.equal(r.normal, 8); assert.equal(r.cut, 2); assert.equal(r.fedFlag, false);
}));

test('fast travel is gone', () => game(async page => {
  const r = await page.evaluate(() => { state.x = HOME.x + 15; render(); return { text: document.getElementById('actions').textContent, fn: typeof returnHome }; });
  assert.ok(!r.text.includes('Return to Brackenford')); assert.equal(r.fn, 'undefined');
}));

test('autosave shows a notice on the day timer', () => game(async page => {
  const t = await page.evaluate(() => { advanceDay(); return document.getElementById('toast').textContent; });
  assert.match(t, /Autosaved/);
}));

test('sprite map draws on a canvas and the toggle switches back to text', () => game(async page => {
  const r = await page.evaluate(() => {
    render();
    const cv = document.getElementById('view'), ctx = cv.getContext('2d');
    const cx = Math.floor(cv.width / 2), cy = Math.floor(cv.height / 2);
    const px = ctx.getImageData(cx - 3, cy, 1, 1).data;       // the player's cloak sits at the centre of the view
    const sprites = { canvas: cv.style.display, text: document.getElementById('map').style.display, player: Array.from(px).slice(0, 3) };
    toggleGfx(); const text = { canvas: cv.style.display, text: document.getElementById('map').style.display };
    toggleGfx(); return { sprites, text };
  });
  assert.equal(r.sprites.canvas, 'block'); assert.equal(r.sprites.text, 'none');
  assert.equal(r.text.canvas, 'none'); assert.equal(r.text.text, '');
}));

test('every enemy has its own portrait in the battle window', () => game(async page => {
  const r = await page.evaluate(() => {
    const shots = {};
    for (const e of Object.values(enemyCatalog)) {
      state.x = HOME.x + 12; state.y = HOME.y; const x = state.x + 1, y = state.y;
      overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...e });
      startCombat(x, y, state.x, state.y); shots[e.name] = document.querySelector('#dialog img.portrait')?.src || null;
      state.combat = null; closeDialog();
    }
    return shots;
  });
  const values = Object.values(r);
  assert.ok(values.every(Boolean)); assert.equal(new Set(values).size, values.length);
}));

test('battle hotkeys work when a fight starts on its own in real time', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE); await page.evaluate(() => {
    newWorld(); state.x = HOME.x + 12; state.y = HOME.y;
    for (let dx = -1; dx <= 5; dx++) for (let dy = -1; dy <= 1; dy++) overworld[state.y + dy][state.x + dx] = '.';
    const x = state.x + 3, y = state.y; overworld[y][x] = 'g';
    enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.boar, level: 6, maxHp: 60, curHp: 60 });
  });
  await page.waitForFunction(() => !!state.combat, null, { timeout: 8000 });
  const seen = [];
  for (const key of ['1', '3', '2']) { await page.keyboard.press(key); await page.waitForTimeout(100); seen.push(await page.evaluate(() => state.log.slice(0, 3).map(l => l.t).join(' | '))); }
  await ctx.close();
  assert.ok(seen[0].includes('You attack') || seen[0].includes('strike'));
  assert.ok(seen[1].includes('guard'));
  assert.ok(/power strike|wake in Brackenford/.test(seen[2]));
  assert.deepEqual(errors, []);
});

test('inventory shows an icon for every item and spent patches get their own sprite', () => game(async page => {
  const r = await page.evaluate(() => {
    render();
    const icons = [...document.querySelectorAll('#inventory img.icon')].map(i => i.src);
    state.x = HOME.x + 20; state.y = HOME.y; overworld[state.y][state.x + 2] = '♣';
    const cv = document.getElementById('view'), ctx = cv.getContext('2d'), T = GFX.T;
    const sample = () => { const d = ctx.getImageData((12 + 2) * T + 8, 7 * T + 4, 1, 1).data; return Array.from(d).join(','); };
    render(); const fresh = sample();
    for (let i = 0; i < 3; i++) state.nodes[nodeId(state.x + 2, state.y)] = { e: 0, t: state.clock, g: '♣' };
    render(); const spent = sample();
    return { count: icons.length, items: Object.keys(state.inv).length, distinct: new Set(icons).size, fresh, spent };
  });
  assert.equal(r.count, r.items); assert.ok(r.distinct >= r.items - 1);
  assert.notEqual(r.fresh, r.spent);
}));

test('Kenney art skin loads, draws, and can be switched back', () => game(async page => {
  const r = await page.evaluate(async () => {
    toggleSkin(); await new Promise(r => setTimeout(r, 500));
    const on = GFX.skinActive(); render(); const canvasOk = document.getElementById('view').width > 0;
    toggleSkin(); await new Promise(r => setTimeout(r, 300));
    return { on, off: !GFX.skinActive(), canvasOk, label: document.getElementById('skin-btn').textContent };
  });
  assert.deepEqual(r, { on: true, off: true, canvasOk: true, label: 'Art: handmade' });
}));

test('characters face the way they step and animate only while walking', () => game(async page => {
  const r = await page.evaluate(() => {
    state.x = HOME.x + 20; state.y = HOME.y; for (let dx = -2; dx <= 2; dx++) overworld[state.y][state.x + dx] = '.';
    const idle = poseOf('player', performance.now(), 0);
    move(-1, 0); const left = animState.get('player'), walkingNow = poseOf('player', performance.now(), 0);
    const later = poseOf('player', performance.now() + 2000, 0);
    state.inv.wood = 50; state.inv.stone = 50; build('lumberMill'); const w = state.workers[0];
    w.x = HOME.x + 8; w.y = HOME.y + 8; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) overworld[w.y + dy][w.x + dx] = '.';
    noteStep(w.id, 1); const east = animState.get(w.id).fx; noteStep(w.id, -1); const west = animState.get(w.id).fx;
    render();
    return { idleWalking: idle.walking, facing: left.fx, walking: walkingNow.walking, lean: walkingNow.lean !== 0, later: later.walking, east, west, drawn: animating() };
  });
  assert.deepEqual(r, { idleWalking: false, facing: -1, walking: true, lean: true, later: false, east: 1, west: -1, drawn: true });
}));

// ---- phone / touch mode (landscape) ----
async function phone(fn, viewport = { width: 915, height: 412 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE + '?touch=1');
  await page.evaluate(() => { newWorld(); });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('phone layout fits a landscape screen with no scrolling', () => phone(async page => {
  const r = await page.evaluate(() => {
    const cv = document.getElementById('view').getBoundingClientRect(), dp = document.getElementById('dpad').getBoundingClientRect();
    return { touch: document.body.classList.contains('touch'), sx: document.documentElement.scrollWidth - innerWidth, sy: document.documentElement.scrollHeight - innerHeight,
      canvasBottom: Math.round(cv.bottom), canvasW: Math.round(cv.width), dpadVisible: dp.width > 0, rotate: getComputedStyle(document.getElementById('rotate-hint')).display, h: innerHeight };
  });
  assert.equal(r.touch, true); assert.ok(r.sx <= 0 && r.sy <= 0, JSON.stringify(r)); assert.ok(r.canvasBottom <= r.h); assert.ok(r.dpadVisible); assert.equal(r.rotate, 'none');
}));

test('holding the on-screen pad walks, and the buttons act', () => phone(async page => {
  const r = await page.evaluate(async () => {
    manualPause = false; state.x = HOME.x + 20; state.y = HOME.y; for (let dx = -8; dx <= 8; dx++) for (let dy = -1; dy <= 1; dy++) overworld[state.y + dy][state.x + dx] = '.';
    const x0 = state.x, btn = document.querySelector('#dpad [data-dir=left]');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    await new Promise(r => setTimeout(r, 500));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    const walked = x0 - state.x; await new Promise(r => setTimeout(r, 400)); const stopped = x0 - state.x === walked;
    state.hp = 1; state.maxHp = 10; state.inv.berries = 1;
    document.getElementById('t-eat').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }));
    return { walked, stopped, hp: state.hp, facing };
  });
  assert.ok(r.walked >= 3, 'walked ' + r.walked); assert.equal(r.stopped, true); assert.ok(r.hp > 1); assert.equal(r.facing, -1);
}));

test('the menu drawer opens, pauses the world, and holds the side panels', () => phone(async page => {
  const r = await page.evaluate(async () => {
    manualPause = false; await new Promise(r => setTimeout(r, 300)); const closed = document.getElementById('log').getBoundingClientRect().left >= innerWidth - 1;
    document.getElementById('t-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    await new Promise(r => setTimeout(r, 400));
    const open = document.getElementById('log').getBoundingClientRect().left < innerWidth - 100;
    const c0 = state.clock; await new Promise(r => setTimeout(r, 600)); const frozen = state.clock === c0;
    const tools = [...document.querySelectorAll('#drawer-tools button')].map(b => b.textContent);
    document.getElementById('drawer-close').click(); await new Promise(r => setTimeout(r, 300));
    const c1 = state.clock; await new Promise(r => setTimeout(r, 600));
    return { closed, open, frozen, tools: tools.length, resumed: state.clock > c1 };
  });
  assert.deepEqual(r, { closed: true, open: true, frozen: true, tools: r.tools, resumed: true }); assert.ok(r.tools >= 4);
}));

test('portrait shows a rotate hint, and battle dialogs fit a short screen', async () => {
  await phone(async page => {
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('rotate-hint')).display), 'grid');
  }, { width: 412, height: 915 });
  await phone(async page => {
    const r = await page.evaluate(() => {
      manualPause = true; state.x = HOME.x + 12; state.y = HOME.y; const x = state.x + 1, y = state.y;
      overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.troll }); startCombat(x, y, state.x, state.y);
      const d = document.getElementById('dialog').getBoundingClientRect(); return { top: d.top, bottom: d.bottom, h: innerHeight, right: d.right, w: innerWidth };
    });
    assert.ok(r.top >= 0 && r.bottom <= r.h && r.right <= r.w, JSON.stringify(r));
  }, { width: 740, height: 360 });
});

test('going to the background autosaves', () => phone(async page => {
  const r = await page.evaluate(async () => {
    localStorage.removeItem(AUTOSAVE_KEY); state.coin = 91;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY)).state.coin;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    return saved;
  });
  assert.equal(r, 91);
}));

// ---- guardians, relics and the hidden final dungeon ----
test('five guardians are placed in separate lairs, and the final dungeon starts hidden', () => game(async page => {
  const r = await page.evaluate(() => {
    const sites = miniBossSites(), keys = sites.map(t => t.miniBoss), keep = dungeons.find(d => d.boss);
    state.x = keep.x; state.y = keep.y; const before = overworld[keep.y][keep.x]; interact(); const entered = state.zone;
    return { n: sites.length, distinct: new Set(keys).size, ids: new Set(sites.map(t => t.id)).size, kinds: [dungeons, mines, caves].map(l => l.filter(t => t.miniBoss).length), keepGlyph: before, entered, keepIsGuardian: !!keep.miniBoss };
  });
  assert.deepEqual(r, { n: 5, distinct: 5, ids: 5, kinds: [2, 2, 1], keepGlyph: '.', entered: 'overworld', keepIsGuardian: false });
}));

test('defeating a guardian grants a relic with its effect, and relics survive death', () => game(async page => {
  const r = await page.evaluate(() => {
    const fight = (site, depth) => {
      state.x = site.x; state.y = site.y; enterInstance(site, site === undefined ? 'x' : (dungeons.includes(site) ? 'dungeon' : mines.includes(site) ? 'mine' : 'cave'));
      if (depth) { state.mineDepth = depth; state.site.layers = state.site.layers || {}; if (!state.site.layers[depth]) state.site.layers[depth] = makeInstance('mine', depth, site); map = state.site.layers[depth]; ensureBoss(site, map, depth); }
      let pos = null; for (const [k, e] of enemyBucket(map)) { const [x, y] = k.split(',').map(Number); if (e.mini && map[y][x] === 'g') pos = [x, y]; }
      state.x = pos[0] - 1; state.y = pos[1]; startCombat(pos[0], pos[1], state.x, state.y); const boss = state.combat.enemy.name;
      state.combat.hp = 1; const real = Math.random; Math.random = () => 0.99; try { battleAction('heavy'); } finally { Math.random = real; }   // no random gear drop to muddy the heart count
      closeDialog(); return boss;
    };
    const dun = dungeons.find(d => d.miniBoss === 'aegis'), maxHp0 = state.maxHp, lvl0 = state.level;
    const boss = fight(dun); const got = { relic: state.relics.aegis, hearts: state.maxHp - maxHp0 - (state.level - lvl0) };   // minus the hearts from levelling up
    exitInstance(); state.coin = 100; state.inv.wood = 10; state.hp = 1; state.x = HOME.x + 12; state.y = HOME.y;
    const x = state.x + 1, y = state.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.wolf }); startCombat(x, y, state.x, state.y); state.combat.enemy.attack = 99; enemyTurn();
    return { boss, got, afterDeath: state.relics.aegis, woodLost: state.inv.wood < 10, left: miniBossSites().filter(t => !state.relics[t.miniBoss]).length };
  });
  assert.equal(r.boss, 'Brannoch, the Iron Warden'); assert.deepEqual(r.got, { relic: true, hearts: 2 });
  assert.equal(r.afterDeath, true); assert.equal(r.woodLost, true); assert.equal(r.left, 4);
}));

test('each relic changes the game as described', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    showDialog('<div id="enemy-hp"></div><div id="battle-status"></div><button id="heavy-button"></button><button id="item-button"></button>');
    state.maxHp = 10; out.healBase = healAmount(); state.relics.heartstone = true; out.healRelic = healAmount();
    const area = () => { state.explored.forEach(r => r.fill(false)); state.x = HOME.x; state.y = HOME.y; revealArea(); return state.explored.flat().filter(Boolean).length; };
    out.sightBase = area(); state.relics.lantern = true; out.sightRelic = area();
    state.x = HOME.x + 20; state.y = HOME.y; for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) overworld[state.y + dy][state.x + dx] = '.'; overworld[state.y][state.x + 1] = '♣';
    const w0 = state.inv.wood; interact(); out.gatherRelic = state.inv.wood - w0;
    const hit = () => { state.hp = 99; state.maxHp = 99; state.combat = { x: 0, y: 0, enemy: { name: 'Test', attack: 1.2 }, level: 20, hp: 5, maxHp: 5, guarded: false }; const h0 = state.hp; enemyTurn(); const lost = h0 - state.hp; state.combat = null; return lost; };
    const rnd = Math.random; Math.random = () => 0.9;   // fixed rolls so the two runs are comparable
    let base = 0, rel = 0; state.relics.mossback = false; for (let i = 0; i < 40; i++) base += hit(); state.relics.mossback = true; for (let i = 0; i < 40; i++) rel += hit();
    Math.random = rnd; out.mossback = base - rel;
    return out;
  });
  assert.equal(r.healBase, 3); assert.equal(r.healRelic, 5); assert.ok(r.sightRelic > r.sightBase * 1.5); assert.equal(r.gatherRelic, 3); assert.ok(r.mossback >= 38 && r.mossback <= 40);
}));

test('slaying every guardian reveals the final dungeon', () => game(async page => {
  const r = await page.evaluate(() => {
    const keep = dungeons.find(d => d.boss), sites = miniBossSites();
    for (const t of sites.slice(0, 4)) grantRelic(t.miniBoss);
    const hiddenAt4 = [state.keepRevealed, overworld[keep.y][keep.x], goalHint().includes('Still hunting')];
    grantRelic(sites[4].miniBoss);
    state.x = keep.x; state.y = keep.y; interact(); const entered = state.zone; exitInstance();
    return { hiddenAt4, revealed: state.keepRevealed, glyph: overworld[keep.y][keep.x], entered, hint: goalHint().includes('Hollow King') };
  });
  assert.deepEqual(r, { hiddenAt4: [false, '.', true], revealed: true, glyph: 'K', entered: 'dungeon', hint: true });
}));

test('relics and the reveal survive saving, and old saves keep the old goal', () => game(async page => {
  const r = await page.evaluate(() => {
    const t = miniBossSites()[0]; grantRelic(t.miniBoss); saveWorld();
    const data = JSON.parse(localStorage.getItem(SAVE_KEY)); state.relics = {}; hydrateWorld(data); manualPause = true;
    const kept = !!state.relics[t.miniBoss];
    const legacy = JSON.parse(localStorage.getItem(SAVE_KEY)); delete legacy.state.relics; delete legacy.state.keepRevealed;
    const keep = legacy.dungeons.find(d => d.boss); legacy.overworld[keep.y][keep.x] = '.'; legacy.dungeons.forEach(d => delete d.miniBoss); legacy.mines.forEach(d => delete d.miniBoss); legacy.caves.forEach(d => delete d.miniBoss);
    hydrateWorld(legacy); manualPause = true;
    return { kept, legacyRevealed: state.keepRevealed, legacyGlyph: overworld[keep.y][keep.x], guardians: miniBossSites().length };
  });
  assert.deepEqual(r, { kept: true, legacyRevealed: true, legacyGlyph: 'K', guardians: 5 });
}));
