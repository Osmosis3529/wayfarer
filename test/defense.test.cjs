// Browser-driven tests for walls: building them, what they stop, how they are battered and mended, and the other settlements' walls.
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
    window.RICH = () => {
      Object.assign(state.inv, { wood: 140, stone: 140, iron: 140, furs: 140, silver: 140, gold: 140, gems: 140, copper: 140, berries: 40, coal: 40 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40; state.town.food = 40;
    };
    window.calm = () => { state.day = 5; for (const s of settlements) { s.aggression = 0; s.owner = null; } state.npcWars = []; };
    // open grass around Brackenford and the player parked well away
    window.clearHome = () => { for (let y = 1; y < WORLD_H - 1; y++) for (let x = 1; x < WORLD_W - 1; x++) if (overworld[y][x] === 'g') { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); } for (let y = HOME.y - 25; y <= HOME.y + 25; y++) for (let x = HOME.x - 25; x <= HOME.x + 25; x++) if (overworld[y][x] !== '⌂' && !'SCDMK'.includes(overworld[y][x])) overworld[y][x] = '.'; state.x = HOME.x + 45; state.y = HOME.y; };
    window.raider = (dx, dy, extra = {}) => { const x = HOME.x + dx, y = HOME.y + dy; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...WAR_FOES.raider, faction: 'raid', raid: true, townId: 'town_0', ...extra }); return [x, y]; };
    window.tiles = () => { const out = []; for (let y = 1; y < WORLD_H - 1; y++) for (let x = 1; x < WORLD_W - 1; x++) if (overworld[y][x] === 'g') out.push([x, y]); return out; };
    window.cheb = ([x, y]) => Math.max(Math.abs(x - HOME.x), Math.abs(y - HOME.y));
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('walls are a building with a plot in town, need nobody to staff them, and start at full strength', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); const out = { plot: !!TOWN_PLOTS.walls, cost: BUILD_COSTS.walls, name: buildingName('walls'), before: wallHolds(), counted: Object.keys(state.built).includes('walls') };
    state.town.people = 2; out.staff = canStaffNew('walls'); out.capacity = (state.built.walls = true, capacity('walls')); state.built.walls = false;
    const jobs = JOB_KEYS.includes('walls'), upgrades = UPGRADE_KEYS.includes('walls');
    state.coin = 0; const wood0 = state.inv.wood, stone0 = state.inv.stone; openBuilding('walls'); out.prompt = dialogText(); closeDialog();
    build('walls'); out.after = { built: state.built.walls, pct: state.wallPct, holds: wallHolds(), wood: wood0 - state.inv.wood, stone: stone0 - state.inv.stone, log: state.log[0].t };
    openBuilding('walls'); out.dialog = dialogText();
    return { ...out, jobs, upgrades };
  });
  assert.equal(r.plot, true); assert.deepEqual(r.cost, { wood: 12, stone: 18 }); assert.equal(r.name, 'Walls'); assert.equal(r.before, false); assert.equal(r.counted, true);
  assert.equal(r.staff, true); assert.equal(r.capacity, 0); assert.equal(r.jobs, false); assert.equal(r.upgrades, false);
  assert.ok(r.prompt.includes('Empty plot') && r.prompt.includes('walls') && r.prompt.includes('12 wood, 18 stone'), r.prompt);
  assert.deepEqual([r.after.built, r.after.pct, r.after.holds, r.after.wood, r.after.stone], [true, 1, true, 12, 18]); assert.ok(r.after.log.includes('village walls'), r.after.log);
  assert.ok(r.dialog.includes('Walls') && r.dialog.includes('40 / 40 HP') && r.dialog.includes('3 × 3'), r.dialog);
}));

test('a village wall guards the 3 x 3 around the middle, a town or city wall the 5 x 5, and a city’s is the strongest', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('walls'); const out = {};
    for (const tier of [1, 2, 3]) {
      state.town.tier = tier; wallCache = null; const w = homeWall();
      const ring = wallRing(HOME.x, HOME.y, w.reach);
      out[tier] = { scale: w.scale, max: w.max, reach: w.reach, tiles: ring.length, inside: Math.max(...wallRing(HOME.x, HOME.y, w.reach - 1).map(([x, y]) => Math.max(Math.abs(x - HOME.x), Math.abs(y - HOME.y)))), blocks: ring.every(([x, y]) => !!wallAt(x, y)), open: !wallAt(HOME.x, HOME.y) && !wallAt(HOME.x + w.reach + 1, HOME.y) };
    }
    return out;
  });
  assert.deepEqual(r[1], { scale: 'village', max: 40, reach: 2, tiles: 16, inside: 1, blocks: true, open: true });     // the wall at 2 tiles out guards the 3 x 3 inside
  assert.deepEqual(r[2], { scale: 'town', max: 90, reach: 3, tiles: 24, inside: 2, blocks: true, open: true });         // and at 3 tiles the 5 x 5
  assert.deepEqual(r[3], { scale: 'city', max: 200, reach: 3, tiles: 24, inside: 2, blocks: true, open: true });
  assert.ok(r[3].max > r[2].max && r[2].max > r[1].max);
}));

test('monsters and raiders cannot cross a wall, but soldiers at war, your people and you can', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('walls'); const out = {}, real = Math.random;
    Math.random = () => 0.9;      // no battering: they only walk
    try {
      raider(6, 0); raider(-6, 1); overworld[HOME.y - 6][HOME.x + 1] = 'g'; enemyBucket(overworld).set((HOME.x + 1) + ',' + (HOME.y - 6), { ...enemyCatalog.wolf });
      for (let i = 0; i < 40; i++) moveEnemies();
      out.closest = Math.min(...tiles().map(cheb));
      for (const [x, y] of tiles()) { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); }
      // a defender from a settlement at war walks through the same tiles: the wall is not meant for them
      const guard = { ...WAR_FOES.guard, faction: 'war', townId: 'town_0' }, gx = HOME.x + 3, gy = HOME.y; overworld[gy][gx] = 'g'; enemyBucket(overworld).set(gx + ',' + gy, guard);
      out.guardBlocked = wallStops(guard);
      out.rules = [wallStops({}), wallStops({ faction: 'raid' }), wallStops({ faction: 'war' }), wallStops({ faction: 'npcwar' })];
    } finally { Math.random = real; }
    state.x = HOME.x + 2; state.y = HOME.y - 1; out.player = [wallAt(state.x, state.y) ? 'on the wall' : 'open']; move(-1, 0); out.moved = state.x === HOME.x + 1;
    return out;
  });
  assert.ok(r.closest >= 3, 'something got through the wall: ' + r.closest); assert.equal(r.guardBlocked, false); assert.deepEqual(r.rules, [true, true, false, false]); assert.equal(r.moved, true, JSON.stringify(r));
}));

test('raiders at the wall batter it, monsters hit it harder, and once it is breached they walk in and loot', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('walls'); state.raid = { from: 'town_0', name: 'Test', left: 1, total: 1, deadline: state.day + 5, looted: 0, killed: 0, war: false };
    const out = {}, real = Math.random; Math.random = () => 0.1;     // they always land a blow
    try {
      const [x] = raider(3, 0); const hit = () => [homeWall() && homeWall().pct, state.log[0].t];
      moveEnemies(); out.one = wallHpText(state, 'village'); moveEnemies(); out.two = wallHpText(state, 'village');
      for (const [tx, ty] of tiles()) { overworld[ty][tx] = '.'; enemyBucket(overworld).delete(tx + ',' + ty); }
      raider(3, 0, { monster: true }); const before = state.wallPct; moveEnemies(); out.monster = +((before - state.wallPct) * 40).toFixed(1);
      state.coin = 100; for (let i = 0; i < 60 && wallHolds(); i++) moveEnemies();
      out.breached = [state.wallPct, wallHolds(), state.log.map(l => l.t).some(t => t.includes('breached'))];
      state.raid.left = 1; const c0 = state.coin; for (let i = 0; i < 15 && tiles().length; i++) moveEnemies(); out.looted = state.coin < c0 || tiles().length === 0;
    } finally { Math.random = real; }
    return out;
  });
  assert.equal(r.one, '39 / 40 HP'); assert.equal(r.two, '38 / 40 HP'); assert.equal(r.monster, 2); assert.deepEqual(r.breached.slice(0, 2), [0, false]); assert.equal(r.breached[2], true); assert.equal(r.looted, true);
}));

test('at the deadline a wall turns back raiders, each one costing it strength, until it falls', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('walls'); state.built.barracks = false;
    const out = {}, start = (n, left) => { for (const [x, y] of tiles()) { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); } for (let i = 0; i < n; i++) raider(8 + i, 0); state.raid = { from: 'town_0', name: 'Test', left: n, total: n, deadline: state.day, looted: 0, killed: 0, war: false }; };
    state.coin = 200; start(3, 3); raidDeadline(); out.three = { coin: state.coin, hp: wallHpText(state, 'village'), raid: state.raid, log: state.log.map(l => l.t).find(t => t.includes('turns back')) };
    state.wallPct = 1; wallCache = null; start(9, 9); const c0 = state.coin; raidDeadline(); out.nine = { looted: state.coin < c0, holds: wallHolds(), pct: state.wallPct };
    state.town.tier = 3; state.wallPct = 1; wallCache = null; start(9, 9); const c1 = state.coin; raidDeadline(); out.city = { looted: state.coin < c1, holds: wallHolds(), hp: wallHpText(state, 'city') };
    return out;
  });
  assert.equal(r.three.coin, 215); assert.equal(r.three.hp, '22 / 40 HP');   // 15 coin is the reward for a raid nobody got through; assert.equal(r.three.raid, null); assert.ok(r.three.log.includes('3 raiders'), r.three.log);
  assert.equal(r.nine.looted, true); assert.deepEqual([r.nine.holds, r.nine.pct], [false, 0]);          // seven raiders fell it, the rest got in
  assert.deepEqual([r.city.looted, r.city.holds, r.city.hp], [false, true, '146 / 200 HP']);              // a city wall shrugs off nine
}));

test('citizens patch the wall every day, nothing mends it mid-raid, and repairs cost materials', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); build('walls'); const out = {};
    state.wallPct = .5; state.town.food = 99; advanceDay(); out.day = state.wallPct;
    state.raid = { from: 'town_0', name: 'T', left: 3, total: 3, deadline: state.day + 9, looted: 0, killed: 0 }; advanceDay(); out.raid = state.wallPct; state.raid = null;
    state.wallPct = 0; wallCache = null; out.breached = [wallHolds(), wallAt(HOME.x + 2, HOME.y)]; openBuilding('walls'); out.text = dialogText();
    const stone0 = state.inv.stone; const cost = wallRepairCost(1); repairWalls(); out.repaired = [state.wallPct, stone0 - state.inv.stone, cost.stone, wallHolds()];
    state.wallPct = .6; state.inv.stone = 0; state.inv.wood = 0; const w0 = state.wallPct; repairWalls(); out.broke = state.wallPct === w0;
    return out;
  });
  assert.equal(r.day, .6); assert.equal(r.raid, .6); assert.deepEqual(r.breached, [false, null]); assert.ok(r.text.includes('breached') && r.text.includes('Repair'), r.text);
  assert.deepEqual([r.repaired[0], r.repaired[1] === r.repaired[2], r.repaired[3]], [1, true, true]); assert.equal(r.broke, true);
}));

test('the wall grows with the settlement, keeping the share of strength it had', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('walls'); state.wallPct = .5; const out = { village: wallHpText(state, 'village') };
    state.town.tier = 2; wallCache = null; out.town = [homeWall().scale, homeWall().max, Math.round(state.wallPct * homeWall().max)];
    state.town.tier = 3; wallCache = null; out.city = [homeWall().scale, homeWall().max, Math.round(state.wallPct * homeWall().max)];
    return out;
  });
  assert.equal(r.village, '20 / 40 HP'); assert.deepEqual(r.town, ['town', 90, 45]); assert.deepEqual(r.city, ['city', 200, 100]);
}));

test('both renderers draw the wall; the text map marks it', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); clearHome(); build('walls'); state.x = HOME.x; state.y = HOME.y + 1; revealArea(); const out = {};
    useGfx = false; render(); out.text = document.querySelectorAll('#map .wall').length; out.glyphs = [...document.querySelectorAll('#map .wall')].every(e => e.textContent === '▒');
    useGfx = true; render(); out.gfx = true;
    state.wallPct = 0; wallCache = null; useGfx = false; render(); out.breached = document.querySelectorAll('#map .wall').length;
    return out;
  });
  assert.ok(r.text >= 8, 'wall tiles in view: ' + r.text); assert.equal(r.glyphs, true); assert.equal(r.gfx, true); assert.equal(r.breached, 0);
}));

test('an annexed settlement can have a wall of its own, kept apart from Brackenford’s', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); build('hut'); const s = settlements[0]; s.owner = 'player'; ensureColonies(); s.discovered = true; build('walls'); const out = { home: wallHolds() };
    enterColony(s.id, true); out.cur = [state.cur, state.built.walls, wallHolds()];
    state.inv.wood = 99; state.inv.stone = 99; build('walls'); state.wallPct = .4; wallCache = null;
    const list = wallList().map(w => [w.kind, w.id, Math.round(w.pct * 100)]).sort();
    exitTown(); out.after = { list, homePct: state.wallPct, colony: state.colonies[s.id].wallPct, tile: !!wallAt(s.x + 2, s.y) };
    return out;
  });
  assert.equal(r.home, true); assert.deepEqual(r.cur.slice(0, 1), [r.cur[0]]); assert.ok(r.after.list.some(w => w[0] === 'colony' && w[2] === 40) && r.after.list.some(w => w[0] === 'home' && w[2] === 100), JSON.stringify(r.after.list));
  assert.equal(r.after.homePct, 1); assert.equal(r.after.colony, .4);
}));

test('other settlements raise walls as they grow, mend them, and are harder to beat behind them', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0], other = settlements[1]; s.people = 5; s.discovered = true; const out = { small: !!s.walls };
    s.people = 8; const real = Math.random; Math.random = () => 0.01; try { npcWallsDay(s); } finally { Math.random = real; }
    out.built = [s.walls, s.wallPct, state.worldLog[0].t.includes('raised a wall')];
    out.ring = wallList().filter(w => w.kind === 'npc').map(w => [w.id, w.scale, w.max]);
    out.bonus = [npcWallBonus(other), (s.people = 8, npcWallBonus(s)), (s.people = 20, npcWallBonus(s)), (s.people = 30, npcWallBonus(s))];
    s.people = 8; npcWallHit(s, .6); out.hit = [s.wallPct, npcWalls(s), wallAt(s.x + 3, s.y)]; npcWallHit(s, .6); out.breach = [s.wallPct, npcWalls(s), state.worldLog[0].t.includes('breached'), npcWallBonus(s)];
    Math.random = () => 0.9; try { npcWallsDay(s); } finally { Math.random = real; } out.mended = s.wallPct;
    state.wars = {}; hydrateWorld(JSON.parse(JSON.stringify(buildSaveData()))); out.saved = [settlements[0].walls, settlements[0].wallPct];
    const old = JSON.parse(JSON.stringify(buildSaveData())); for (const t of old.settlements) { delete t.walls; delete t.wallPct; } hydrateWorld(old); out.old = settlements.every(t => !t.walls);
    return out;
  });
  assert.equal(r.small, false); assert.deepEqual(r.built, [true, 1, true]); assert.deepEqual(r.ring, [['town_0', 'village', 40]]);
  assert.deepEqual(r.bonus, [1, 1.25, 1.5625, 2.25]); assert.equal(r.hit[1], true); assert.deepEqual(r.breach.slice(0, 3), [0, false, true]); assert.equal(r.breach[3], 1);
  assert.equal(r.mended, .1); assert.deepEqual(r.saved, [true, .1]); assert.equal(r.old, true);
}));

test('walls show in the settlement lists, and saves keep Brackenford’s wall strength', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); const s = settlements[0]; s.discovered = true; s.walls = true; s.wallPct = 1; s.people = 20; state.visited[s.id] = true; build('walls'); state.wallPct = .35;
    enterTown(); openMap(); const text = dialogText(); closeDialog();
    const save = JSON.parse(JSON.stringify(buildSaveData())); state.wallPct = 1; hydrateWorld(save);
    const old = JSON.parse(JSON.stringify(buildSaveData())); delete old.state.built.walls; state.built.walls = false; hydrateWorld(old);
    return { text, pct: save.state.wallPct, after: [state.wallPct, state.built.walls] };
  });
  assert.ok(r.text.includes('(town, walled)'), r.text); assert.equal(r.pct, .35); assert.equal(r.after[1], false);
}));

// ---------------------------------------------------------------- monster raids and surplus
test('monsters raid Brackenford on the map: a pack and its leader, marching on the town, eating the pantry instead of taking coin', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('hut'); build('longhouse'); state.day = 12; const out = {};
    const real = Math.random; let ok = false;
    try { for (let i = 0; i < 20 && !ok; i++) ok = startMonsterRaid(); } finally { Math.random = real; }
    const foes = tiles().map(([x, y]) => enemyBucket(overworld).get(x + ',' + y));
    out.raid = { ok, monster: state.raid.monster, name: state.raid.name, from: state.raid.from, total: state.raid.total, left: state.raid.left, deadline: state.raid.deadline - state.day, log: state.log.find(l => l.t.includes('monsters'))?.t || '' };
    out.foes = { n: foes.length, flagged: foes.every(f => f.raid && f.monster && f.faction === 'raid'), leader: foes.filter(f => f.bonus === 1).map(f => f.name), names: [...new Set(foes.map(f => f.name))].every(n => Object.values(enemyCatalog).some(e => e.name === n)) };
    out.again = startMonsterRaid();
    out.panel = (render(), document.getElementById('town-stats').textContent);
    state.coin = 100; state.town.food = 30; state.town.people = 10; const people0 = state.town.people;
    for (let i = 0; i < 2; i++) { const [x, y] = tiles()[0]; raiderLoots(x, y); }
    out.struck = { coin: state.coin, food: state.town.food < 30, left: state.raid ? state.raid.left : 'done', log: state.log.map(l => l.t).some(t => t.includes('A monster gets into Brackenford')) };
    return out;
  });
  assert.equal(r.raid.ok, true); assert.deepEqual([r.raid.monster, r.raid.name, r.raid.from], [true, 'the wilds', null]); assert.ok(r.raid.total >= 2 && r.raid.total <= 8 && r.raid.left === r.raid.total && r.raid.deadline === 2, JSON.stringify(r.raid));
  assert.ok(r.raid.log.includes('coming out of the wilds'), r.raid.log); assert.equal(r.foes.n, r.raid.total); assert.equal(r.foes.flagged, true); assert.ok(r.foes.leader.includes('Thorn Stalker')); assert.equal(r.foes.names, true);
  assert.equal(r.again, false); assert.ok(r.panel.includes('monsters from the wilds'), r.panel);
  assert.equal(r.struck.coin, 100); assert.equal(r.struck.food, true); assert.equal(r.struck.log, true);
}));

test('driving the monsters off pays a bounty; a wall holds them, and soldiers stop what the wall does not', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('hut'); build('longhouse'); const out = {};
    const pack = n => { for (const [x, y] of tiles()) { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); } for (let i = 0; i < n; i++) raider(8 + i, 0, { monster: true, faction: 'raid', raid: true }); state.raid = { from: null, name: 'the wilds', monster: true, left: n, total: n, deadline: state.day, looted: 0, killed: 0, war: false }; };
    pack(3); state.coin = 50; for (const [x, y] of tiles()) { const foe = enemyBucket(overworld).get(x + ',' + y); removeEnemyData(overworld, x, y); overworld[y][x] = '.'; noteKill(foe); }
    out.won = { coin: state.coin, raid: state.raid, log: state.log.map(l => l.t).find(t => t.includes('bounty')) };
    build('walls'); pack(4); const c0 = state.coin; raidDeadline(); out.walled = { coin: state.coin - c0 - 16, hp: wallHpText(state, 'village') };   // 16 is the bounty for a raid nobody got through
    state.built.walls = false; wallCache = null; state.built.barracks = true; state.assign.barracks = 2; pack(3); const f0 = state.town.food; raidDeadline(); out.soldiers = { fed: state.town.food < f0, log: state.log.map(l => l.t).find(t => t.includes('stop 2')) };
    return out;
  });
  assert.equal(r.won.coin, 50 + 12); assert.equal(r.won.raid, null); assert.ok(r.won.log.includes('12 coin'), r.won.log);
  assert.deepEqual(r.walled, { coin: 0, hp: '16 / 40 HP' }); assert.equal(r.soldiers.fed, true); assert.ok(r.soldiers.log, 'two soldiers stop two monsters');
}));

test('other settlements are raided at once: walls beat the monsters back, without them people die and stores are lost', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); const [a, b] = settlements, out = {};
    a.people = 10; a.cap = 10; a.walls = false; delete a.fright; resolveMonsterRaid(a); out.open = [a.people <= 9, a.people >= 8, a.fright === state.day, state.worldLog[0].t.includes('Monsters raid')];
    a.walls = true; a.wallPct = 1; const p0 = a.people; resolveMonsterRaid(a); out.walled = [a.people === p0, a.wallPct, state.worldLog[0].t.includes('wall and are beaten back')];
    a.people = 3; a.walls = false; resolveMonsterRaid(a); out.tiny = a.people;
    b.owner = 'player'; ensureColonies(); b.discovered = true; state.colonies[b.id].town.people = 6; b.people = 6; b.stock = { wood: 10, stone: 5 }; const log0 = state.log.length;
    resolveMonsterRaid(b); out.mine = [state.colonies[b.id].town.people, b.stock.wood, b.stock.stone, state.log[0].t.includes('A wall would have turned them back')];
    state.colonies[b.id].built.walls = true; state.colonies[b.id].wallPct = 1; resolveMonsterRaid(b); out.mineWalled = [state.colonies[b.id].town.people, state.colonies[b.id].wallPct];
    state.wars[a.id] = { total: 3, left: 3 }; a.people = 10; a.walls = false; resolveMonsterRaid(a); out.atWar = a.people;
    return out;
  });
  assert.deepEqual(r.open, [true, true, true, true]); assert.deepEqual(r.walled, [true, .7, true]); assert.equal(r.tiny, 3);
  assert.deepEqual(r.mine, [5, 5, 3, true]); assert.deepEqual(r.mineWalled, [5, .7]); assert.equal(r.atWar, 10);
}));

test('monster raids come now and then, more often when stores are full, and never twice at once', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); clearHome(); build('hut'); build('longhouse'); state.day = 10; const out = {}, real = Math.random;
    const turn = v => { for (const [x, y] of tiles()) { overworld[y][x] = '.'; enemyBucket(overworld).delete(x + ',' + y); } state.raid = null; Math.random = () => v; try { monsterRaidTurn(); } finally { Math.random = real; } return !!state.raid; };
    for (const k of CAPPED) state.inv[k] = 0; state.town.food = 0;
    out.plain = [turn(.0), turn(.5), turn(.99), raidAttraction()];
    const rate = MONSTER_RAID_RATE; out.edge = [turn(rate * 1 - .001), turn(rate * 1 + .001)];
    for (const k of ['wood', 'stone', 'coal', 'copper']) state.inv[k] = supplyCap(); state.town.food = supplyCap();
    out.kinds = surplusKinds(); out.att = raidAttraction(); out.edgeFull = [turn(rate * out.att - .001), turn(rate * out.att + .001)];
    for (const k of CAPPED) state.inv[k] = supplyCap(); state.town.food = supplyCap(); out.max = raidAttraction();
    state.day = 3; out.early = turn(.0); state.day = 10; state.town.people = 0; out.empty = turn(.0); state.town.people = 10;
    state.raid = { from: null, name: 'the wilds', monster: true, left: 2, total: 2, deadline: 99, looted: 0, killed: 0 }; Math.random = () => 0; try { monsterRaidTurn(); } finally { Math.random = real; } out.twice = state.raid.total;
    return out;
  });
  assert.deepEqual(r.plain, [true, false, false, 1]); assert.deepEqual(r.edge, [true, false]); assert.equal(r.kinds, 5); assert.equal(r.att, 2); assert.deepEqual(r.edgeFull, [true, false]); assert.equal(r.max, 2.5);
  assert.equal(r.early, false); assert.equal(r.empty, false); assert.equal(r.twice, 2);
}));

test('a surplus draws raiders: annexed settlements’ stores count too', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); for (const k of CAPPED) state.inv[k] = 0; state.town.food = 0; const out = { base: raidAttraction() };
    const a = settlements[0], b = settlements[1]; for (const s of [a, b]) s.owner = 'player'; ensureColonies(); a.stock = { wood: 20 }; b.stock = { stone: 25 };
    out.stock = [stockTotal(), raidAttraction()];
    a.stock = { wood: 100, stone: 100, coal: 100 }; out.big = raidAttraction();
    // a settlement's chance of sending raiders is its temper times the attraction
    for (const s of [a, b]) s.owner = null; ensureColonies(); for (const s of settlements) s.aggression = 0; const c = settlements[2]; c.aggression = .3; c.x = HOME.x + 20; c.y = HOME.y;
    for (const k of CAPPED) state.inv[k] = 0; state.town.food = 0; const plain = raidChance(c);
    for (const k of CAPPED) state.inv[k] = supplyCap(); state.town.food = supplyCap(); const att = raidAttraction();
    out.att = att; out.chance = [plain, raidChance(c), +(plain * att).toFixed(6)]; out.temper = raidChance(settlements[3]);
    return out;
  });
  assert.equal(r.base, 1); assert.deepEqual(r.stock, [45, 1.2]); assert.equal(r.big, 2.5); assert.equal(r.att, 2.5); assert.ok(Math.abs(r.chance[1] - r.chance[2]) < 1e-5 && r.chance[1] > r.chance[0] * 2.4, JSON.stringify(r.chance)); assert.equal(r.temper, 0);
}));

test('surplus is shared out among annexed settlements instead of wasted', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); const [a, b] = settlements, out = {}; build('hut');
    const cap = supplyCap(); state.inv.wood = cap; overflow = {}; addItem('wood', 10, true); reportOverflow();
    out.none = state.log.map(l => l.t).find(t => t.includes('went to waste'));
    for (const s of [a, b]) { s.owner = 'player'; s.discovered = true; s.stock = {}; } ensureColonies(); state.colonies[a.id].town.food = 5; state.colonies[b.id].town.food = 5;
    state.inv.wood = cap; state.town.food = cap; overflow = {}; addItem('wood', 11, true); addFood(7); const log0 = state.log.length; reportOverflow();
    out.shared = { wood: [a.stock.wood, b.stock.wood], meals: [state.colonies[a.id].town.food, state.colonies[b.id].town.food], note: state.log.map(l => l.t).find(t => t.includes('Surplus shared')), waste: state.log.slice(0, state.log.length - log0).some(l => l.t.includes('went to waste')) };
    a.stock.wood = 98; state.inv.wood = cap; overflow = {}; addItem('wood', 10, true); reportOverflow(); out.limit = [a.stock.wood, b.stock.wood, state.log.map(l => l.t).find(t => t.includes('went to waste'))];
    enterColony(a.id, true); out.hall = (hallDialog(), dialogText().includes('Stores put by here')); state.inv.wood = 0; state.inv.stone = 0;
    a.stock = { wood: 12, stone: 5, coal: 3 }; collectStock(); out.collected = [state.inv.wood, state.inv.stone, a.stock.wood];
    state.inv.coal = 10; a.stock.coal = 1; state.built.mine = true; state.assign.mine = 1; state.assign.jeweler = 0; fuelCold = new Set(); burnFuel(); out.coal = [a.stock.coal, state.inv.coal]; burnFuel(); out.coal2 = [a.stock.coal, state.inv.coal];
    return out;
  });
  assert.ok(r.none && r.none.includes('annex a settlement'), r.none);
  assert.deepEqual(r.shared.wood, [6, 5]); assert.deepEqual(r.shared.meals, [9, 8]); assert.ok(r.shared.note.includes('timber') && r.shared.note.includes('meals'), r.shared.note); assert.equal(r.shared.waste, false);
  assert.equal(r.limit[0], 100); assert.equal(r.limit[1], 10); assert.ok(r.limit[2] && r.limit[2].includes('went to waste'), r.limit[2]);
  assert.equal(r.hall, true); assert.deepEqual(r.collected, [12, 5, 0]); assert.deepEqual(r.coal, [0, 10]); assert.deepEqual(r.coal2, [0, 9]);
}));
