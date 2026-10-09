// Browser-driven tests for the big maze caves and dungeons, the circle of light, and torches.
// Run with the rest of the suite: `npm test`
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
    window.walkable = c => !['#', '▲', '♣', '≈'].includes(c);
    // Every walkable tile you can reach from (sx, sy).
    window.reach = (m, sx, sy) => {
      const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (m[ny] && m[ny][nx] !== undefined && walkable(m[ny][nx]) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
      return seen;
    };
    // A straight test corridor in the middle of a freshly entered cave, everything else solid, so light is predictable.
    window.corridor = (wallAt) => {
      enterInstance(caves[0], 'cave');
      const m = map, mid = Math.floor(m.length / 2);
      for (let y = 1; y < m.length - 1; y++) for (let x = 1; x < m[0].length - 1; x++) m[y][x] = '#';
      for (let x = 1; x <= 30; x++) m[mid][x] = '.';
      m[mid][1] = '<'; if (wallAt) m[mid][wallAt] = '#';
      state.site.mem = null; litCache.key = ''; state.torch = 0; state.relics = {};
      state.x = 2; state.y = mid; render();
      return mid;
    };
    window.pixel = (i, j) => { const d = document.getElementById('view').getContext('2d').getImageData(i * 16 + 8, j * 16 + 8, 1, 1).data; return [d[0], d[1], d[2]]; };
    window.dialogText = () => document.getElementById('dialog').textContent;
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('caves and dungeons are big mazes: closed border, one connected system, winding corridors, loops, an entrance and a guardians’ chamber', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const type of ['cave', 'dungeon']) {
      const [w, h] = MAZE_SIZE[type], bad = [], stats = [];
      for (let n = 0; n < 15; n++) {
        const m = mazeGrid(type), mid = (h - 1) / 2;
        if (m.length !== h || m[0].length !== w) bad.push('size');
        for (let x = 0; x < w; x++) if (m[0][x] !== '#' || m[h - 1][x] !== '#') bad.push('border');
        for (let y = 0; y < h; y++) if (m[y][0] !== '#' || m[y][w - 1] !== '#') bad.push('border');
        if (m[mid][1] !== '<' || m[mid][w - 2] !== '>' || m[mid][2] !== '.') bad.push('exits');
        for (let y = mid - 2; y <= mid + 2; y++) for (let x = w - 10; x <= w - 2; x++) if (m[y][x] === '#') bad.push('chamber');
        const open = [], from = reach(m, 1, mid);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walkable(m[y][x])) open.push(x + ',' + y);
        if (from.size !== open.length) bad.push('sealed pockets ' + (open.length - from.size));
        if (!from.has((w - 2) + ',' + mid)) bad.push('exit unreachable');
        // corridor tiles with exactly one way on are dead ends; more edges than tiles minus one means loops
        let dead = 0, edges = 0;
        for (const k of open) { const [x, y] = k.split(',').map(Number); const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => walkable(m[y + dy][x + dx])).length; if (nb === 1) dead++; edges += nb; }
        stats.push({ open: open.length, dead, loops: edges / 2 - (open.length - 1), walls: 1 - open.length / (w * h) });
      }
      out[type] = { bad: [...new Set(bad)], w, h, minDead: Math.min(...stats.map(s => s.dead)), minLoops: Math.min(...stats.map(s => s.loops)), minWalls: Math.min(...stats.map(s => s.walls)), maxWalls: Math.max(...stats.map(s => s.walls)) };
    }
    return out;
  });
  for (const type of ['cave', 'dungeon']) {
    const o = r[type];
    assert.deepEqual(o.bad, [], type);
    assert.ok(o.w * o.h > 2 * (type === 'cave' ? 25 * 17 : 29 * 21), type + ' is not much bigger than before');
    assert.ok(o.minDead >= 4, type + ' has too few dead ends: ' + o.minDead);
    assert.ok(o.minLoops >= 5, type + ' has no loops: ' + o.minLoops);
    assert.ok(o.minWalls > 0.25 && o.maxWalls < 0.8, type + ' wall share ' + o.minWalls + '..' + o.maxWalls);
  }
}));

test('every ore vein, chest, enemy and the way out can be reached from the entrance, and you start on open ground', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = { bad: [], counts: {} };
    for (const type of ['cave', 'dungeon']) {
      for (let n = 0; n < 6; n++) {
        const m = makeInstance(type, 1, null), mid = (m.length - 1) / 2, from = reach(m, 1, mid);
        if (!walkable(m[mid][2])) out.bad.push(type + ' spawn');
        const seen = {};
        for (let y = 0; y < m.length; y++) for (let x = 0; x < m[0].length; x++) { const c = m[y][x]; if (c !== '.' && c !== '#') { seen[c] = (seen[c] || 0) + 1; if (!from.has(x + ',' + y)) out.bad.push(type + ' unreachable ' + c); } }
        out.counts[type] = seen;
      }
    }
    // the first lair of each kind, through the real entry path
    enterInstance(caves[0], 'cave'); out.caveSpawn = [state.x, state.y, walkable(map[state.y][state.x]), map.length, map[0].length]; exitInstance();
    enterInstance(dungeons.find(d => !d.boss), 'dungeon'); out.dungeonSpawn = [state.x, state.y, walkable(map[state.y][state.x]), map.length, map[0].length]; exitInstance();
    out.mine = (() => { const m = makeInstance('mine', 2); return [m.length, m[0].length]; })();
    return out;
  });
  assert.deepEqual([...new Set(r.bad)], []);
  assert.equal(r.counts.cave.c, 22); assert.equal(r.counts.cave['◆'], 14); assert.equal(r.counts.cave['<'], 1); assert.equal(r.counts.cave['>'], 1);
  assert.equal(r.counts.dungeon['?'], 16); assert.equal(r.counts.dungeon.g, 16);
  assert.deepEqual(r.caveSpawn, [2, 17, true, 35, 51]); assert.deepEqual(r.dungeonSpawn, [2, 21, true, 43, 63]);
  assert.deepEqual(r.mine, [21, 29]);
}));

test('guardians and the Hollow King still wait in their lairs, reachable through the maze', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    const inSite = (site, type) => {
      enterInstance(site, type);
      const mid = Math.floor(map.length / 2), from = reach(map, state.x, state.y), found = [];
      for (const [k, e] of enemyBucket(map)) { const [x, y] = k.split(',').map(Number); if (map[y][x] === 'g' && (e.mini || e.boss)) found.push({ name: e.name, reachable: from.has(k) }); }
      exitInstance();
      return found;
    };
    out.cave = inSite(caves.find(c => c.miniBoss), 'cave');
    out.dungeon = inSite(dungeons.find(d => d.miniBoss), 'dungeon');
    out.keep = inSite(dungeons.find(d => d.boss), 'dungeon');
    return out;
  });
  assert.equal(r.cave.length, 1); assert.equal(r.cave[0].reachable, true);
  assert.equal(r.dungeon.length, 1); assert.equal(r.dungeon[0].reachable, true);
  assert.ok(r.keep.some(f => f.name.includes('Hollow King') && f.reachable), JSON.stringify(r.keep));
}));

test('light is a circle around you; walls stop it, torches and the Delver’s Lantern widen it', () => game(async page => {
  const r = await page.evaluate(() => {
    const mid = corridor(5), key = (x) => x + ',' + mid, lit = () => getLit();
    const plain = { radius: lightRadius(), near: lit().has(key(4)), wall: lit().has(key(5)), behind: lit().has(key(6)), far: lit().has(key(9)) };
    state.torch = 10; const torch = { radius: lightRadius(), behind: lit().has(key(6)), farBehind: lit().has(key(9)) };
    state.torch = 0; state.relics = { lantern: true }; const lantern = { radius: lightRadius(), wall: lit().has(key(5)), behind: lit().has(key(6)) };
    state.relics = {}; corridor(0);
    const open = { reach4: lit().has(key(6)), reach5: lit().has(key(7)) };
    state.torch = 10; const openTorch = { reach8: lit().has(key(10)), reach9: lit().has(key(11)) };
    return { plain, torch, lantern, open, openTorch };
  });
  assert.deepEqual(r.plain, { radius: 4, near: true, wall: true, behind: false, far: false });
  assert.deepEqual(r.torch, { radius: 8, behind: false, farBehind: false });
  assert.deepEqual(r.lantern, { radius: 6, wall: true, behind: false });
  assert.deepEqual(r.open, { reach4: true, reach5: false });
  assert.deepEqual(r.openTorch, { reach8: true, reach9: false });
}));

test('torches: buy them, light one in the dark, they burn per step and gutter out; none outside caves and dungeons', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    state.inv.torch = 2; lightTorch(); out.outside = [state.inv.torch, state.torch];
    const mid = corridor(0);
    state.inv.torch = 0; lightTorch(); out.none = [state.torch, state.log[0].cls];
    state.inv.torch = 2; lightTorch(); out.lit = [state.inv.torch, state.torch, lightRadius()];
    lightTorch(); out.second = [state.inv.torch, state.torch];
    manualPause = false; render(); out.panel = document.getElementById('actions').textContent.includes('Light a torch'); out.mode = document.getElementById('mode').textContent; manualPause = true;
    for (let i = 0; i < 5; i++) move(1, 0);
    out.walked = state.torch;
    state.torch = 1; move(1, 0); out.out = [state.torch, lightRadius(), state.log[0].t];
    return out;
  });
  assert.deepEqual(r.outside, [2, 0]); assert.deepEqual(r.none, [0, 'alert']); assert.deepEqual(r.lit, [1, 120, 8]); assert.deepEqual(r.second, [0, 240]);
  assert.equal(r.panel, true); assert.ok(r.mode.includes('TORCH 240'), r.mode);
  assert.equal(r.walked, 235); assert.equal(r.out[0], 0); assert.equal(r.out[1], 4); assert.ok(r.out[2].includes('gutters out'), r.out[2]);
}));

test('the trading post and the lumber mill sell torches, caravans do too, and caches in the dark hold some', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    Object.assign(state.inv, { wood: 99, stone: 99 }); state.town.people = 40; state.coin = 100;
    build('market'); build('lumberMill');
    state.inv.torch = 0; shopAction('market', 'buy', 'torch'); out.market = [state.inv.torch, state.coin];
    shopAction('lumberMill', 'buy', 'torch'); out.mill = [state.inv.torch, state.coin];
    shopAction('market', 'sell', 'torch'); out.sold = [state.inv.torch, state.coin];
    const s = settlements[0]; s.discovered = true; state.x = s.x; state.y = s.y; trade(s.id); out.caravan = dialogText().includes('Torch'); closeDialog();
    state.x = HOME.x; state.y = HOME.y;
    // caches
    const real = Math.random;
    try {
      Math.random = () => 0.1;
      state.inv.torch = 0; cacheTorches(); out.outsideCache = state.inv.torch;
      corridor(0); state.inv.torch = 0; cacheTorches(); out.cache = state.inv.torch;
      Math.random = () => 0.9; state.inv.torch = 0; cacheTorches(); out.unlucky = state.inv.torch;
    } finally { Math.random = real; }
    out.icon = !!GFX.icon('torch'); out.start = { ...state.inv }.torch;
    return out;
  });
  assert.deepEqual(r.market, [1, 96]); assert.deepEqual(r.mill, [2, 93]); assert.deepEqual(r.sold, [1, 95]);
  assert.equal(r.caravan, true); assert.equal(r.outsideCache, 0); assert.equal(r.cache, 1); assert.equal(r.unlucky, 0); assert.equal(r.icon, true);
}));

test('everything outside the light is black, what you have seen stays faintly remembered, and torchlight shows more', () => game(async page => {
  const r = await page.evaluate(() => {
    const mid = corridor(0); useGfx = true; render();
    const bright = p => p[0] + p[1] + p[2], DARK = [11, 16, 13];
    // the player is at x=2 and the view's left edge is x=-10, so column 12 is the player's tile
    const out = { me: bright(pixel(12, 7)), near: bright(pixel(14, 7)), edge: bright(pixel(16, 7)), beyond: bright(pixel(18, 7)), up: pixel(12, 0), outside: pixel(0, 7) };
    state.torch = 10; render(); out.torchBeyond = bright(pixel(18, 7));
    state.torch = 0; state.x = 12; render();           // walked on: the start is now behind you, remembered but dark
    out.remembered = bright(pixel(2, 7)); out.unseen = pixel(0, 0); out.nowLit = bright(pixel(12, 7));
    return { ...out, dark: DARK };
  });
  assert.ok(r.me > 100 && r.near > 100, 'the lit floor is dark: ' + r.me);
  assert.ok(r.edge < r.near, 'the edge of the light should fade'); assert.ok(r.beyond < 60, 'beyond the light is not black: ' + r.beyond);
  assert.deepEqual(r.up, r.dark); assert.deepEqual(r.outside, r.dark); assert.deepEqual(r.unseen, r.dark);
  assert.ok(r.torchBeyond > r.beyond + 50, 'a torch should light tiles the plain light does not reach');
  assert.ok(r.remembered < 60 && r.remembered >= 11 + 16 + 13, 'remembered tiles are faint, not black or bright: ' + r.remembered);
  assert.ok(r.nowLit > 100);
}));

test('the text map is dark too: only your light and your memory show', () => game(async page => {
  const r = await page.evaluate(() => {
    corridor(0); useGfx = false; render();
    const glyphs = () => document.getElementById('map').textContent.replace(/[\s\n]/g, '').length;
    const first = { glyphs: glyphs(), player: document.getElementById('map').textContent.includes('@'), dim: document.querySelectorAll('#map .dim').length };
    for (let i = 0; i < 12; i++) move(1, 0);
    const later = { glyphs: glyphs(), dim: document.querySelectorAll('#map .dim').length };
    state.torch = 10; render(); const torch = glyphs();
    exitInstance(); useGfx = false; render(); const outside = glyphs();
    useGfx = true; render();
    return { first, later, torch, outside };
  });
  assert.ok(r.first.glyphs > 10 && r.first.glyphs < 120, JSON.stringify(r.first)); assert.equal(r.first.player, true); assert.equal(r.first.dim, 0);
  assert.ok(r.later.dim > 3, 'remembered tiles should be dimmed: ' + JSON.stringify(r.later)); assert.ok(r.torch > r.later.glyphs);
  assert.ok(r.outside > 500, 'the overworld should be fully drawn: ' + r.outside);
}));

test('the torch and what you have explored survive saving; old saves start without a lit torch', () => game(async page => {
  const r = await page.evaluate(() => {
    corridor(0); state.torch = 50; state.inv.torch = 4;
    for (let i = 0; i < 10; i++) move(1, 0);
    const seenBefore = state.site.mem.flat().filter(Boolean).length, id = state.site.id;
    const data = JSON.parse(JSON.stringify(buildSaveData()));
    state.torch = 0; state.inv.torch = 0; exitInstance(); caves.find(c => c.id === id).mem = null;
    hydrateWorld(data);
    const loaded = { zone: state.zone, torch: state.torch, torches: state.inv.torch, mem: state.site.mem.flat().filter(Boolean).length, seenBefore, dark: state.site.mem[Math.floor(map.length / 2)][2] };
    const old = JSON.parse(JSON.stringify(data)); delete old.state.torch; state.torch = 77;
    hydrateWorld(old);
    return { loaded, old: state.torch };
  });
  assert.equal(r.loaded.zone, 'cave'); assert.equal(r.loaded.torch, 40); assert.equal(r.loaded.torches, 4); assert.equal(r.loaded.mem, r.loaded.seenBefore); assert.equal(r.loaded.dark, 1);
  assert.equal(r.old, 0);
}));

test('a cave or dungeon from an older save still works, now in the dark', () => game(async page => {
  const r = await page.evaluate(() => {
    // a small open cave like the old generator made, already part of a saved world
    const old = Array.from({ length: 17 }, (_, y) => Array.from({ length: 25 }, (_, x) => (y === 0 || y === 16 || x === 0 || x === 24) ? '#' : '.'));
    old[8][1] = '<'; old[8][23] = '>'; old[8][10] = 'c';
    caves[0].map = old; enterInstance(caves[0], 'cave');
    useGfx = true; render(); useGfx = false; render(); useGfx = true; render();
    move(1, 0); move(1, 0);
    return { zone: state.zone, pos: [state.x, state.y], lit: getLit().size, mem: state.site.mem.length };
  });
  assert.equal(r.zone, 'cave'); assert.deepEqual(r.pos, [4, 8]); assert.ok(r.lit > 20); assert.equal(r.mem, 17);
}));

test('enemies in the dark are met as you walk into them, and a fight works as before', () => game(async page => {
  const r = await page.evaluate(() => {
    const mid = corridor(0);
    map[mid][9] = 'g'; enemyBucket(map).set('9,' + mid, { ...enemyCatalog.skeleton });
    const seenAt = [];
    for (let i = 0; i < 10 && !state.combat; i++) { seenAt.push(getLit().has('9,' + mid)); move(1, 0); }
    return { combat: !!state.combat, at: [state.x, state.y], seenFirst: seenAt.findIndex(Boolean), moves: seenAt.length };
  });
  assert.equal(r.combat, true); assert.ok(r.seenFirst >= 0 && r.seenFirst < r.moves - 1, 'the enemy should come into the light before you touch it: ' + JSON.stringify(r));
}));
