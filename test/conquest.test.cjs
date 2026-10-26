// Browser-driven tests for random names, settlements annexing each other, the colour of annexed workers, and citizens
// walking about a settlement without getting in each other's way.
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
    window.dialogText = () => document.getElementById('dialog').textContent;
    window.RICH = () => {
      Object.assign(state.inv, { wood: 9999, stone: 9999, iron: 999, furs: 999, silver: 999, gold: 999, gems: 999, copper: 999, berries: 20 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40;
    };
    // a quiet world: nobody owned, nobody at war, no new wars before day 7
    window.calm = () => { for (const s of settlements) { s.owner = null; s.aggression = 0; s.people = 6; s.stock = {}; s.wreck = 0; } state.npcWars = []; state.hostile = {}; state.aid = {}; state.day = 5; };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}
const worldNames = async () => { let out; await game(async page => { out = await page.evaluate(() => ({ towns: settlements.map(s => s.name), seed: state.nameSeed, people: Array.from({ length: 40 }, (_, i) => personName(i)), npc: Array.from({ length: 10 }, (_, i) => personName(i, 'town_3')), keeper: keeperName('market') })); }); return out; };

test('every world draws its own settlement and citizen names, and a world keeps them through saving', async () => {
  const [a, b] = [await worldNames(), await worldNames()];
  for (const w of [a, b]) {
    assert.equal(new Set(w.towns).size, w.towns.length); assert.ok(w.towns.length >= 15 && w.towns.every(n => /^[A-Z][a-z]{5,}$/.test(n)), w.towns.join());
    assert.equal(new Set(w.people.map(n => n.split(' ')[0])).size, 40, 'first names are all different within a settlement');
    assert.notDeepEqual(w.people.slice(0, 10), w.npc);                       // each settlement has its own shuffle
  }
  assert.notDeepEqual(a.towns, b.towns); assert.notDeepEqual(a.people, b.people); assert.notEqual(a.seed, b.seed);
  assert.ok(!['Mossbridge', 'Hearthfen', 'Pinewatch'].every(n => a.towns.includes(n) && b.towns.includes(n)), 'not the old fixed list');
  await game(async page => {
    const r = await page.evaluate(() => {
      const before = { towns: settlements.map(s => s.name), people: Array.from({ length: 12 }, (_, i) => personName(i)), keeper: keeperName('market'), seed: state.nameSeed };
      const save = JSON.parse(JSON.stringify(buildSaveData())); state.nameSeed = 1; hydrateWorld(save);
      const same = { towns: settlements.map(s => s.name), people: Array.from({ length: 12 }, (_, i) => personName(i)), keeper: keeperName('market'), seed: state.nameSeed };
      const old = JSON.parse(JSON.stringify(save)); delete old.state.nameSeed; hydrateWorld(old);
      return { before, same, oldSeed: typeof state.nameSeed };
    });
    assert.deepEqual(r.same, r.before); assert.equal(r.oldSeed, 'number');
  });
});

test('the people you meet carry those names, in Brackenford, in other settlements and in annexed ones', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); calm(); build('hut'); build('longhouse'); state.town.people = 6; enterTown(); closeDialog();
    const home = townPeople.map(p => p.name), homeExpected = townPeople.map((_, i) => personName(i));
    const s = settlements[0]; s.discovered = true; s.people = 8; exitTown(); state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog();
    const npc = townPeople.map(p => p.name), npcExpected = townPeople.map((_, i) => personName(i, s.id));
    exitTown(); const c = settlements[1]; c.owner = 'player'; c.discovered = true; ensureWarWorld(); state.x = c.x; state.y = c.y; interact(); closeDialog(); state.town.people = 5; syncTownPeople();
    const colony = townPeople.map(p => p.name), colonyExpected = townPeople.map((_, i) => personName(i, c.id));
    return { home, homeExpected, npc, npcExpected, colony, colonyExpected, differ: colony.join() !== home.slice(0, 5).join() };
  });
  assert.deepEqual(r.home, r.homeExpected); assert.deepEqual(r.npc, r.npcExpected); assert.deepEqual(r.colony, r.colonyExpected); assert.equal(r.differ, true);
}));

test('the builders in the stories are named by the world too', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); state.town.people = 30; build('market'); const m = state.log[0].t; build('garden'); const g = state.log[0].t; trade('home'); const shop = dialogText().slice(0, 40);
    return { m, g, shop, market: keeperName('market'), garden: keeperName('garden'), again: keeperName('market') };
  });
  assert.ok(r.m.startsWith(r.market + ' opens a market'), r.m); assert.ok(r.g.startsWith(r.garden + ' opens the farm'), r.g); assert.ok(r.shop.startsWith(r.market + '’s Market'), r.shop); assert.equal(r.again, r.market);
}));

test('workers wear the colour of whoever rules their settlement: annexed workers change sides', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c] = settlements, w = s => workerColor(s.id + ':worker:0'), out = {};
    out.own = [w(a) === settlementColor(a.id), w(b) === settlementColor(b.id), w(a) !== w(b)];
    b.owner = a.id; out.ruled = w(b) === settlementColor(a.id);
    c.owner = b.id; out.chain = w(c) === settlementColor(a.id);
    a.owner = 'player'; out.player = [w(a), w(b), w(c)].every(x => x === BRACKENFORD_COLOR);
    out.home = workerColor('home:market:0') === BRACKENFORD_COLOR;
    a.owner = null; b.owner = a.id; c.owner = null; out.back = w(a) === settlementColor(a.id);
    // text mode shows it on the map, and the people inside a ruled settlement wear their ruler's colour
    for (const s of [a, b]) { s.discovered = true; }
    for (let y = Math.max(0, b.y - 8); y <= Math.min(WORLD_H - 1, b.y + 8); y++) for (let x = Math.max(0, b.x - 8); x <= Math.min(WORLD_W - 1, b.x + 8); x++) state.explored[y][x] = true;
    for (let y = b.y - 7; y <= b.y + 7; y++) for (let x = b.x - 7; x <= b.x + 7; x++) if (overworld[y] && overworld[y][x] !== undefined && !'SCDKM⌂'.includes(overworld[y][x])) overworld[y][x] = '.';
    state.x = b.x + 3; state.y = b.y + 3; syncWorkers(); useGfx = false; render();
    const spans = [...document.querySelectorAll('#map .worker')].map(e => e.style.color); useGfx = true; render();
    const hex = settlementColor(a.id).replace('#', ''), rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    out.text = spans.length > 0 && spans.every(x => x === rgb);
    state.x = b.x; state.y = b.y; enterSettlement(b.id); out.inside = currentColor() === settlementColor(a.id);
    return out;
  });
  assert.deepEqual(r.own, [true, true, true]); assert.equal(r.ruled, true); assert.equal(r.chain, true); assert.equal(r.player, true); assert.equal(r.home, true); assert.equal(r.back, true);
  assert.equal(r.text, true); assert.equal(r.inside, true);
}));

test('taking a settlement by siege turns its workers Brackenford green and frees the settlements it ruled', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c] = settlements; b.owner = a.id; c.owner = a.id; a.discovered = true;
    const before = workerColor(a.id + ':worker:0') === settlementColor(a.id), people = workerColor(b.id + ':worker:0') === settlementColor(a.id);
    state.wars[a.id] = { total: 0, left: 0, guards: 0, holds: 0, size: 6, cleared: true }; annex(a.id);
    return { before, people, now: [a, b, c].map(s => [s.owner, workerColor(s.id + ':worker:0') === BRACKENFORD_COLOR]), freed: state.log[0].t.includes('free again') };
  });
  assert.equal(r.before, true); assert.equal(r.people, true);
  assert.deepEqual(r.now, [['player', true], [null, false], [null, false]]); assert.equal(r.freed, true);
}));

test('a settlement that wins a war annexes the loser, whose subjects pass to the winner', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c] = settlements; c.owner = b.id;                       // b rules c
    a.people = 14; b.people = 2; a.aggression = .5; a.discovered = b.discovered = true;
    const w = startNpcWar(a, b); const real = Math.random; Math.random = () => 0.9;
    try { for (let i = 0; i < 20 && state.npcWars.includes(w); i++) { state.day++; npcWarTurn(); } } finally { Math.random = real; }
    return { over: !state.npcWars.includes(w), b: b.owner, c: c.owner, a: a.owner, people: b.people, text: ownerText(b), news: state.log.some(l => l.t.includes('is annexed and ruled by ' + a.name)), plots: Object.keys(buildNpcTown(b).plots).length };
  });
  assert.equal(r.over, true); assert.equal(r.b, 'town_0'); assert.equal(r.c, 'town_0'); assert.equal(r.a, null); assert.equal(r.people, 2); assert.equal(r.news, true); assert.equal(r.plots, 0);
  assert.ok(r.text.startsWith('ruled by'), r.text);
}));

test('a ruler keeps at most three subjects, ruled settlements start no wars and sign no deals, and an ally that is annexed is lost', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c, d, e] = settlements; a.discovered = true;
    for (const s of [b, c, d]) s.owner = a.id;                                 // three subjects already
    e.people = 2; a.people = 14; const w = startNpcWar(a, e); const real = Math.random; Math.random = () => 0.9;
    try { for (let i = 0; i < 20 && state.npcWars.includes(w); i++) { state.day++; npcWarTurn(); } } finally { Math.random = real; }
    const capped = { over: !state.npcWars.includes(w), owner: e.owner, subjects: subjectsOf(a.id).length };
    // wars only start between settlements nobody rules
    state.day = 10; for (const s of settlements) s.people = 8; let started = 0;
    try { for (let i = 0; i < 300; i++) { Math.random = () => (i * 0.6180339) % 1; state.npcWars = []; maybeStartNpcWar(); if (state.npcWars.some(x => [b, c, d].some(s => s.id === x.a || s.id === x.d))) started++; } } finally { Math.random = real; }
    // a ruled settlement cannot make a deal; its ruler might
    RICH(); build('hut'); build('longhouse'); build('caravanPost'); relOf(b.id).favor = 2; const block = dealBlock(b);
    // an ally that gets annexed ends the alliance
    calm(); const [f, g] = settlements; state.deals[g.id] = { sell: null, buy: null, gear: false, last: 1, since: 1, trips: 0, profit: 0 }; f.discovered = g.discovered = true; f.people = 14; g.people = 2;
    const w2 = startNpcWar(f, g); Math.random = () => 0.9; try { for (let i = 0; i < 20 && state.npcWars.includes(w2); i++) { state.day++; npcWarTurn(); } } finally { Math.random = real; }
    return { capped, started, block, ally: isAlly(g.id), owner: g.owner, text: state.log.slice(0, 6).map(l => l.t).join(' | ') };
  });
  assert.deepEqual(r.capped, { over: true, owner: null, subjects: 3 }); assert.equal(r.started, 0); assert.match(r.block, /answers to someone else/);
  assert.equal(r.ally, false); assert.equal(r.owner, 'town_0'); assert.ok(r.text.includes('has been annexed by'), r.text);
}));

test('a settlement that is ruled by another sometimes rebels and is free again, and never while it is a handful of people', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c] = settlements; b.owner = a.id; c.owner = a.id; a.discovered = b.discovered = true; b.people = 8; c.people = 3; b.cap = 8; c.cap = 3; b.goal = 8; c.goal = 3;   // nobody grows during the test
    const real = Math.random; Math.random = () => 0.001;
    try { worldTurn(); } finally { Math.random = real; }
    const out = { b: b.owner, c: c.owner, news: state.log.some(l => l.t.includes('throws off')) };
    // a few days of ordinary luck: it happens, but not at once
    b.owner = a.id; let days = 0; while (b.owner && days < 2000) { worldTurn(); days++; b.people = 8; }
    out.days = days; return out;
  });
  assert.equal(r.b, null); assert.equal(r.c, 'town_0', 'too small to rebel'); assert.equal(r.news, true); assert.ok(r.days > 3 && r.days < 2000, 'rebelled after ' + r.days);
}));

// ---------------------------------------------------------------- walking about
const jam = async (page, people, opts = {}) => page.evaluate(([people, opts]) => {
  RICH(); state.town.people = people;
  for (const k of ['hut', 'longhouse', 'market', 'garden', 'well', 'smithy', 'huntersLodge', 'jeweler', 'lumberMill', 'mine', 'caravanPost', 'fishingHut', 'warehouse', 'barracks']) build(k);
  for (const k of JOB_KEYS) if (state.built[k]) for (let i = 0; i < 3; i++) assignWorker(k, 1);
  enterTown(); closeDialog(); if (opts.playerInPlaza) { state.x = 29; state.y = 20; } else { state.x = 29; state.y = 37; }
  const n = townPeople.length, still = new Array(n).fill(0), worst = new Array(n).fill(0), seen = townPeople.map(() => new Set()); let blocked = 0, moved = 0;
  const ticks = 800;
  for (let t = 0; t < ticks; t++) {
    const before = townPeople.map(q => ({ x: q.x, y: q.y, wait: q.wait, path: q.path.length }));
    moveTownPeople();
    townPeople.forEach((q, i) => {
      const m = q.x !== before[i].x || q.y !== before[i].y; seen[i].add(q.x + ',' + q.y);
      if (m) { still[i] = 0; moved++; } else { still[i]++; worst[i] = Math.max(worst[i], still[i]); if (before[i].wait === 0 && before[i].path > 0) blocked++; }
    });
    const keys = townPeople.map(q => q.x + ',' + q.y);
    if (new Set(keys).size !== keys.length) return { collision: t };
  }
  return { n, maxStill: Math.max(...worst), stuck: worst.filter(w => w > 40).length, blocked: blocked / (n * ticks), moved: moved / (n * ticks), minSeen: Math.min(...seen.map(v => v.size)), jobs: [...new Set(townPeople.map(q => q.job))].sort() };
}, [people, opts]);

test('with the whole plaza full of citizens nobody gets stuck, nobody shares a tile, and everybody keeps moving between their places', () => game(async page => {
  for (const people of [12, 24, 36]) {
    const r = await jam(page, people);
    assert.equal(r.collision, undefined, 'two people on one tile at tick ' + r.collision);
    assert.equal(r.stuck, 0, people + ' citizens: ' + JSON.stringify(r)); assert.ok(r.maxStill <= 30, people + ': ' + JSON.stringify(r)); assert.ok(r.blocked < 0.12, people + ': ' + JSON.stringify(r));
    assert.ok(r.minSeen >= 8, people + ': everyone walks about, ' + JSON.stringify(r)); assert.ok(r.jobs.includes('barracks') && (people < 36 || (r.jobs.includes('garden') && r.jobs.includes('idle'))), r.jobs.join());
    await page.evaluate(() => { exitTown(); for (const k of Object.keys(state.built)) state.built[k] = false; state.assign = {}; townPeople = []; });
  }
}));

test('a player standing in the middle of the plaza does not jam the citizens either', () => game(async page => {
  const r = await jam(page, 30, { playerInPlaza: true });
  assert.equal(r.collision, undefined); assert.equal(r.stuck, 0, JSON.stringify(r)); assert.ok(r.blocked < 0.15, JSON.stringify(r));
}));

test('two people walking toward each other down a one-tile road trade places instead of standing there for ever', () => game(async page => {
  const r = await page.evaluate(() => {
    enterTown(); closeDialog(); state.x = 29; state.y = 37; townPeople = [];
    const mk = (id, x, y, goal) => ({ id, n: 0, name: id, job: 'idle', idx: 0, x, y, targets: [goal, [x, y]], spots: [], ti: 0, path: townPath([x, y], goal), wait: 0, stuck: 0 });
    // the road along y = 14 is one tile wide between x = 3 and x = 22
    const a = mk('a', 6, 14, [20, 14]), b = mk('b', 20, 14, [6, 14]); townPeople = [a, b];
    let swapped = false; for (let t = 0; t < 80; t++) { const ax = a.x; moveTownPeople(); if (a.x > b.x) swapped = true; }
    return { swapped, a: [a.x, a.y], b: [b.x, b.y] };
  });
  assert.equal(r.swapped, true, JSON.stringify(r));
}));

test('somebody who dwells in the way is hurried along or walked around, never waited on for ever', () => game(async page => {
  const r = await page.evaluate(() => {
    enterTown(); closeDialog(); state.x = 29; state.y = 37; townPeople = [];
    const mk = (id, x, y, goal, wait) => ({ id, n: 0, name: id, job: 'idle', idx: 0, x, y, targets: [goal, [x, y]], spots: [], ti: 0, path: wait ? [] : townPath([x, y], goal), wait, stuck: 0 });
    const blocker = mk('b', 14, 14, [14, 14], 400), walker = mk('w', 6, 14, [22, 14], 0);       // a long dweller on a one-tile road
    townPeople = [blocker, walker]; let arrived = -1;
    for (let t = 0; t < 120; t++) { moveTownPeople(); if (walker.x >= 22 && arrived < 0) arrived = t; }
    return { arrived, blockerWait: blocker.wait };
  });
  assert.ok(r.arrived >= 0 && r.arrived < 60, JSON.stringify(r));
}));

test('people in other settlements walk about the same way, and each has a place of their own to stand', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0]; s.discovered = true; s.people = 26; state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog();
    state.x = npcMap().start[0]; state.y = npcMap().start[1];
    const n = townPeople.length, worst = new Array(n).fill(0), still = new Array(n).fill(0); let collision = -1;
    for (let t = 0; t < 600; t++) {
      const before = townPeople.map(q => [q.x, q.y]); moveTownPeople();
      townPeople.forEach((q, i) => { if (q.x === before[i][0] && q.y === before[i][1]) { still[i]++; worst[i] = Math.max(worst[i], still[i]); } else still[i] = 0; });
      const keys = townPeople.map(q => q.x + ',' + q.y); if (new Set(keys).size !== keys.length && collision < 0) collision = t;
    }
    const spots = townPeople.flatMap(q => q.spots.map(t => t[0] + ',' + t[1])), roads = townPeople.flatMap(q => q.spots).filter(([x, y]) => map[y][x] === '▒').length;
    return { n, maxStill: Math.max(...worst), collision, uniqueSpots: new Set(spots).size === spots.length, roads };
  });
  assert.ok(r.n >= 20); assert.equal(r.collision, -1); assert.ok(r.maxStill <= 30, JSON.stringify(r)); assert.equal(r.uniqueSpots, true, 'no two people share a waiting spot'); assert.ok(r.roads <= 2, JSON.stringify(r));
}));
