// Browser-driven tests for the bigger world and for what each settlement is destined to become.
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
    // an old save: the same world cropped to the first version's 183 x 135, with home in its middle
    window.oldSave = () => {
      const data = JSON.parse(JSON.stringify(buildSaveData())), W = 183, H = 135, hx = 91, hy = 67;
      data.overworld = data.overworld.slice(0, H).map(r => r.slice(0, W)); data.state.explored = data.state.explored.slice(0, H).map(r => r.slice(0, W));
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (Math.hypot(dx, dy) <= 5) data.overworld[hy + dy][hx + dx] = '.';
      data.overworld[hy][hx] = '⌂'; data.state.x = hx; data.state.y = hy; data.state.roads = [];
      const inside = s => s.x < W - 3 && s.y < H - 3;
      data.settlements = data.settlements.filter(inside).slice(0, 15); data.caves = data.caves.filter(inside); data.dungeons = data.dungeons.filter(inside); data.mines = data.mines.filter(inside);
      for (const s of data.settlements) { delete s.destiny; delete s.goal; }
      data.homeMine = { ...data.homeMine, x: hx, y: hy };
      data.enemyRows = [];
      for (const k of ['rel', 'deals', 'hostile', 'wars', 'aid', 'colonies']) data.state[k] = {};
      data.state.npcWars = [];
      return data;
    };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('a new world is 50% bigger in area, with home in the middle and more of everything', () => game(async page => {
  const r = await page.evaluate(() => ({
    w: WORLD_W, h: WORLD_H, ratio: WORLD_W * WORLD_H / (183 * 135), home: [HOME.x, HOME.y], tile: overworld[HOME.y][HOME.x], rows: overworld.length, cols: overworld[0].length,
    explored: [state.explored.length, state.explored[0].length], start: [state.x, state.y], towns: settlements.length, caves: caves.length, dungeons: dungeons.length, mines: mines.length,
    berries: overworld.flat().filter(c => c === '%').length, foes: overworld.flat().filter(c => c === 'g').length,
    inside: [...settlements, ...caves, ...dungeons, ...mines].every(s => s.x > 0 && s.y > 0 && s.x < WORLD_W - 1 && s.y < WORLD_H - 1)
  }));
  assert.ok(r.ratio > 1.45 && r.ratio < 1.55, 'area ratio ' + r.ratio); assert.deepEqual(r.home, [112, 82]); assert.equal(r.tile, '⌂');
  assert.deepEqual([r.rows, r.cols], [r.h, r.w]); assert.deepEqual(r.explored, [r.h, r.w]); assert.deepEqual(r.start, r.home);
  assert.deepEqual([r.towns, r.caves, r.dungeons, r.mines], [22, 27, 21, 18]); assert.ok(r.berries >= 75 && r.foes >= 55 && r.inside, JSON.stringify(r));
}));

test('everything in the bigger world can be reached on foot from home', () => game(async page => {
  const r = await page.evaluate(() => {
    const seen = reachableFromHome();
    return [...settlements, ...caves, ...dungeons, ...mines].filter(s => !seen[s.y][s.x]).length;
  });
  assert.equal(r, 0);
}));

test('settlements have destinies: towns are as many as cities and villages together, villages outnumber cities, cities are few', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = { counts: {}, goals: { village: [], town: [], city: [] }, starts: settlements.map(s => s.people) };
    for (const s of settlements) { out.counts[s.destiny] = (out.counts[s.destiny] || 0) + 1; out.goals[s.destiny].push(goalOf(s)); }
    out.even = [];
    for (let n = 6; n <= 60; n += 2) { const c = destinyCounts(n); out.even.push([n, c.city + c.town + c.village === n, c.town === c.city + c.village, c.village > c.city, c.city >= 1]); }
    out.odd = [15, 21].map(n => { const c = destinyCounts(n); return [c.city + c.town + c.village, c.village > c.city]; });
    out.scales = [scaleOf(5), scaleOf(12), scaleOf(13), scaleOf(24), scaleOf(25), scaleOf(36)];
    out.colours = new Set(SETTLEMENT_COLORS).size >= settlements.length;
    return out;
  });
  assert.deepEqual(r.counts, { city: 4, town: 11, village: 7 });
  assert.ok(r.goals.village.every(g => g >= 8 && g <= 12) && r.goals.town.every(g => g >= 18 && g <= 24) && r.goals.city.every(g => g >= 30 && g <= 36), JSON.stringify(r.goals));
  assert.ok(r.starts.every(p => p >= 3 && p <= 7), 'every settlement starts as a village: ' + r.starts.join());
  for (const row of r.even) assert.deepEqual(row.slice(1), [true, true, true, true], row.join());
  assert.deepEqual(r.odd, [[15, true], [21, true]]); assert.deepEqual(r.scales, ['village', 'village', 'town', 'town', 'city', 'city']); assert.equal(r.colours, true);
}));

test('destinies and goals are saved, and an old save without them is given some', () => game(async page => {
  const r = await page.evaluate(() => {
    const kept = settlements.map(s => s.destiny + ':' + goalOf(s)).join(), save = JSON.parse(JSON.stringify(buildSaveData()));
    hydrateWorld(save); const same = settlements.map(s => s.destiny + ':' + s.goal).join() === kept;
    for (const s of save.settlements) { delete s.destiny; delete s.goal; }
    hydrateWorld(save); const refilled = settlements.every(s => DESTINIES.includes(s.destiny)), counts = {};
    for (const s of settlements) counts[s.destiny] = (counts[s.destiny] || 0) + 1;
    return { same, refilled, counts };
  });
  assert.equal(r.same, true); assert.equal(r.refilled, true); assert.deepEqual(r.counts, { city: 4, town: 11, village: 7 });
}));

test('a save from the smaller world loads at its own size, plays, and a bigger world loads back after it', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}, big = JSON.parse(JSON.stringify(buildSaveData())), old = oldSave();
    hydrateWorld(old);
    out.small = { w: WORLD_W, h: WORLD_H, home: [HOME.x, HOME.y], tile: overworld[HOME.y][HOME.x], explored: [state.explored.length, state.explored[0].length], towns: settlements.length, destinies: settlements.every(s => DESTINIES.includes(s.destiny)), cap: owCap(), scale: worldScale() };
    state.coin = 50; advanceDay(); render(); state.x = HOME.x + 3; state.y = HOME.y; render(); out.day = state.day;
    for (let i = 0; i < 3; i++) { move(1, 0); moveWorkers(); }
    out.walked = state.x > HOME.x + 3;
    enterTown(); exitTown(); openMap(); out.map = document.getElementById('worldmap').width; closeDialog();
    hydrateWorld(big);
    out.big = { w: WORLD_W, h: WORLD_H, home: [HOME.x, HOME.y], towns: settlements.length, rows: overworld.length };
    let bad = ''; try { hydrateWorld({ ...old, overworld: old.overworld.slice(0, 50) }); } catch (e) { bad = e.message; }
    out.rolledBack = [WORLD_W, WORLD_H, overworld.length, bad];
    return out;
  });
  assert.deepEqual(r.small.home, [91, 67]); assert.deepEqual([r.small.w, r.small.h], [183, 135]); assert.equal(r.small.tile, '⌂'); assert.deepEqual(r.small.explored, [135, 183]);
  assert.ok(r.small.towns >= 10 && r.small.destinies); assert.ok(Math.abs(r.small.scale - 1) < .001); assert.equal(r.small.cap, 42); assert.equal(r.walked, true); assert.equal(r.map, 183 * 3);
  assert.deepEqual(r.big, { w: 224, h: 165, home: [112, 82], towns: 22, rows: 165 });
  assert.deepEqual(r.rolledBack.slice(0, 3), [224, 165, 165]); assert.equal(r.rolledBack[3], 'This save file is damaged.');
}));

test('the enemy cap grows with the world', () => game(async page => {
  const r = await page.evaluate(() => { const big = owCap(); setWorldSize(183, 135); const small = owCap(); setWorldSize(224, 165); return [big, small]; });
  assert.deepEqual(r, [63, 42]);
}));
