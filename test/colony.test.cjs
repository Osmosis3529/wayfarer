// Browser-driven tests for annexed settlements: you run them like Brackenford, with your own pack and coin.
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
    window.RICH = () => {
      Object.assign(state.inv, { wood: 140, stone: 140, iron: 140, furs: 140, silver: 140, gold: 140, gems: 140, copper: 140, berries: 20 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500;
    };
    window.dialogText = () => document.getElementById('dialog').textContent;
    window.dialogOpen = () => document.getElementById('overlay').style.display === 'grid';
    // Brackenford with a hall and a longhouse, and one annexed settlement (index 0) whose gates we stand at
    window.setup = () => {
      RICH(); state.town.people = 20; build('hut'); build('longhouse'); build('market');
      for (const s of settlements) { s.owner = null; s.aggression = 0; } state.npcWars = [];
      const s = settlements[0]; s.discovered = true; s.owner = 'player'; s.people = 2; ensureWarWorld(); state.x = s.x; state.y = s.y; state.day = 5;
      return s;
    };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('walking into an annexed settlement swaps in its own buildings, jobs and pantry, and leaving puts Brackenford back', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); const homeBuilt = state.built, homePeople = state.town.people, coin = state.coin;
    interact(); closeDialog();
    const inside = { cur: state.cur, visiting: state.visiting, zone: state.zone, built: state.built === homeBuilt, any: Object.values(state.built).some(Boolean), people: state.town.people, food: state.town.food, tier: state.town.tier, onBrackenfordLayout: map === brackenfordMap(), title: townTitle(), coin: state.coin === coin, name: settleName(), mode: document.getElementById('mode').textContent, housing: housingCap() };
    const panel = document.getElementById('town-stats').textContent, plots = Object.keys(townPlots()).length;
    exitTown();
    return { inside, panel, plots, after: { cur: state.cur, zone: state.zone, built: state.built === homeBuilt, people: state.town.people === homePeople, at: [state.x, state.y], name: settleName(), market: state.built.market }, s: [s.x, s.y, s.name] };
  });
  assert.equal(r.inside.cur, 'town_0'); assert.equal(r.inside.visiting, 'town_0'); assert.equal(r.inside.zone, 'town'); assert.equal(r.inside.built, false); assert.equal(r.inside.any, false);
  assert.deepEqual([r.inside.people, r.inside.food, r.inside.tier], [2, 4, 1]); assert.equal(r.inside.onBrackenfordLayout, true); assert.ok(r.inside.title.startsWith(r.s[2]), r.inside.title); assert.equal(r.inside.coin, true); assert.equal(r.inside.name, r.s[2]);
  assert.equal(r.inside.housing, 2); assert.ok(r.panel.includes('Citizens') && r.panel.includes('2 / 2'), r.panel); assert.ok(r.plots >= 14);
  assert.deepEqual(r.after, { cur: null, zone: 'overworld', built: true, people: true, at: [r.s[0], r.s[1]], name: 'Brackenford', market: true });
}));

test('you build, hire and upgrade in an annexed settlement with your own materials; Brackenford is untouched', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); const homeBuilt = { ...state.built }, wood = state.inv.wood;
    interact(); closeDialog();
    state.town.people = 6; build('hut'); build('longhouse'); build('garden'); build('lumberMill');
    const built = Object.keys(state.built).filter(k => state.built[k]).sort(), spent = wood - state.inv.wood, crews = { garden: crew('garden'), mill: crew('lumberMill') };
    // doors, dialogs and the hall work here too
    enterColony(s.id, true); closeDialog(); state.x = 29; state.y = 14; move(0, -1); const hall = dialogText(); closeDialog();
    openBuilding('barracks'); const noBarracks = dialogText(); closeDialog();
    const war = (warCouncil(), state.log[0].t); build('barracks');
    state.town.people = 9; build('barracks'); openBuilding('barracks'); const barracks = dialogText(); closeDialog();
    build('mine'); openBuilding('mine'); const mine = dialogText(); closeDialog();
    build('beacon'); const beacon = state.built.beacon, bmsg = state.log[0].t;
    assignWorker('garden', 1); const gardenCrew = crew('garden');
    const up = (() => { state.town.people = 20; buyUpgrade('garden'); return upgradesBought('garden'); })();
    exitTown();
    return { built, spent, crews, hall, noBarracks, war, barracks, mine, beacon, bmsg, gardenCrew, up, home: { ...state.built }, homeBuilt, homeUp: upgradesBought('garden'), homeWorkers: state.workers.map(w => w.id).filter(id => id.startsWith('home:')) };
  });
  assert.deepEqual(r.built, ['garden', 'hut', 'longhouse', 'lumberMill']); assert.ok(r.spent > 0); assert.deepEqual(r.crews, { garden: 1, mill: 1 });
  assert.ok(r.hall.includes('Hall') && r.hall.includes('Settlement upgrades') && r.hall.includes('Citizens and jobs') && !r.hall.includes('War council'), r.hall);
  assert.ok(r.noBarracks.includes('Empty plot'), r.noBarracks); assert.ok(r.war.includes('meets in Brackenford'), r.war);
  assert.ok(r.barracks.includes('Soldier') && !r.barracks.includes('War council') && !r.barracks.includes('Marching'), r.barracks);
  assert.ok(r.mine.includes('Mine') && !r.mine.includes('Descend'), r.mine);
  assert.equal(r.beacon, false); assert.ok(r.bmsg.includes('only be raised in Brackenford'), r.bmsg);
  assert.equal(r.gardenCrew, 2); assert.equal(r.up, 1);
  assert.deepEqual(r.home, r.homeBuilt); assert.equal(r.homeUp, 0); assert.deepEqual(r.homeWorkers, ['home:market:0']);   // only Brackenford’s own market works the overworld
}));

test('every dawn the annexed settlement works too: its crews fill your shared pack, it eats, and it grows', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); interact(); closeDialog();
    state.town.people = 5; state.town.food = 30; build('hut'); build('longhouse'); build('lumberMill'); build('garden'); exitTown();
    // the colony's crews are set from inside it, and the settlement is left running
    enterColony(s.id, true); state.assign.lumberMill = 1; state.assign.garden = 1; closeDialog(); exitTown();
    const wood = state.inv.wood = 0; const homeFood = state.town.food, homePeople = state.town.people;
    const real = Math.random; Math.random = () => 0.99;
    try { advanceDay(); } finally { Math.random = real; }
    const rec = state.colonies[s.id];
    return { wood: state.inv.wood - wood, homeFood: state.town.food - homeFood, homePeople: state.town.people - homePeople, food: rec.town.food, people: rec.town.people, shown: s.people, log: state.log.slice(0, 14).map(l => l.t).filter(t => t.startsWith(s.name)).join(' | '), name: s.name };
  });
  assert.ok(r.wood >= 2, 'wood ' + r.wood); assert.ok(r.log.includes('lumber crew'), r.log); assert.ok(r.log.startsWith(r.name + ':'), r.log);
  assert.ok(r.food >= 30 - 5 + 3 - 1, 'the farm adds meals and five citizens eat: ' + r.food); assert.ok(r.people >= 5); assert.equal(r.shown, r.people);
  assert.ok(r.homeFood <= 0, 'Brackenford spends its own food, not the colony’s');
}));

test('a colony can starve on its own, and its people leave no trace on Brackenford', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); state.town.food = 999; interact(); closeDialog(); state.town.people = 6; state.town.food = 0; build('longhouse'); exitTown();
    const homePeople = state.town.people; advanceDay();
    const rec = state.colonies[s.id], log = state.log.slice(0, 12).map(l => l.t).join(' | ');
    return { starving: rec.starving, homeStarving: state.starving, homePeople: state.town.people === homePeople, log, name: s.name };
  });
  assert.equal(r.starving, true); assert.equal(r.homeStarving, false); assert.ok(r.log.includes(r.name + ': ' + r.name + '’s pantry ran short'), r.log);
}));

test('the pack limit follows the best staffed warehouse in any of your settlements', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); interact(); closeDialog();
    const none = supplyCap(); state.town.people = 6; build('hut'); build('warehouse'); const staffed = supplyCap();   // a colony warehouse with a keeper
    exitTown(); const home = supplyCap();                                    // Brackenford has none, the colony's still counts
    state.town.people = 20; build('warehouse'); const both = supplyCap();
    const rec = state.colonies[s.id]; rec.assign.warehouse = 0; const unstaffed = supplyCap();
    return { none, staffed, home, both, unstaffed };
  });
  assert.deepEqual(r, { none: 50, staffed: 150, home: 150, both: 150, unstaffed: 150 });
}));

test('saving inside an annexed settlement keeps both settlements, and loading puts you back inside', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); interact(); closeDialog(); state.town.people = 6; build('hut'); build('longhouse'); build('garden'); state.town.food = 17;
    const data = JSON.parse(JSON.stringify(buildSaveData()));
    const stillInside = state.cur === s.id && state.built.garden === true;
    const saved = { cur: data.state.cur, parked: data.state.parked, homeMarket: data.state.built.market, homeGarden: data.state.built.garden, colony: data.state.colonies[s.id].built.garden, people: data.state.colonies[s.id].town.people, visiting: data.state.visiting, zone: data.state.zone };
    exitTown(); state.colonies = {}; state.built.market = false; settlements[0].owner = null;
    hydrateWorld(data);
    const back = { cur: state.cur, zone: state.zone, visiting: state.visiting, garden: state.built.garden, market: state.built.market, food: state.town.food, hall: state.built.hut, people: townPeople.length, title: townTitle() };
    exitTown(); const home = { cur: state.cur, market: state.built.market, garden: state.built.garden, colonyGarden: state.colonies[s.id].built.garden, owner: settlements[0].owner };
    // a save made outside, from before colonies existed: the annexed settlement gets its record
    const old = JSON.parse(JSON.stringify(data)); delete old.state.colonies; old.state.zone = 'overworld'; old.state.visiting = null; old.settlements[0].people = 5;
    hydrateWorld(old); const migrated = { has: isColony(s.id), people: state.colonies[s.id].town.people, built: Object.values(state.colonies[s.id].built).filter(Boolean).length };
    return { stillInside, saved, back, home, migrated };
  });
  assert.equal(r.stillInside, true); assert.deepEqual(r.saved, { cur: null, parked: null, homeMarket: true, homeGarden: false, colony: true, people: 6, visiting: 'town_0', zone: 'town' });
  assert.deepEqual(r.back, { cur: 'town_0', zone: 'town', visiting: 'town_0', garden: true, market: false, food: 17, hall: true, people: r.back.people, title: r.back.title });
  assert.deepEqual(r.home, { cur: null, market: true, garden: false, colonyGarden: true, owner: 'player' }); assert.deepEqual(r.migrated, { has: true, people: 5, built: 0 });
}));

test('fast travel and the world map work from inside an annexed settlement, and out of it', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); state.coin = 900; const t = settlements[1]; t.discovered = true; state.visited[t.id] = true; state.visited[s.id] = true;
    interact(); closeDialog(); build('hut'); const built = { ...state.built };
    openMap(); const text = dialogText(); closeDialog();
    travelTo('home'); const home = { cur: state.cur, zone: state.zone, visiting: state.visiting, built: state.built.market, name: settleName() };
    travelTo(s.id); const again = { cur: state.cur, built: state.built.hut, name: settleName() };
    travelTo(t.id); const away = { cur: state.cur, visiting: state.visiting, zone: state.zone, market: state.built.market };
    return { text, home, again, away, s: s.name };
  });
  assert.ok(r.text.includes('Brackenford') && r.text.includes('Ride'), r.text);
  assert.deepEqual(r.home, { cur: null, zone: 'town', visiting: null, built: true, name: 'Brackenford' });
  assert.deepEqual(r.again, { cur: 'town_0', built: true, name: r.s }); assert.deepEqual(r.away, { cur: null, visiting: 'town_1', zone: 'town', market: true });
}));

test('wars cannot touch an annexed settlement, and Brackenford being wiped out leaves it alone', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); interact(); closeDialog(); state.town.people = 6; build('hut'); build('longhouse'); exitTown();
    state.day = 20; for (const o of settlements) o.people = 8; settlements[1].discovered = true;
    const real = Math.random; let involved = 0;
    try { for (let i = 0; i < 300; i++) { Math.random = () => (i * 0.37) % 1; state.npcWars = []; maybeStartNpcWar(); if (state.npcWars.some(w => w.a === s.id || w.d === s.id)) involved++; } } finally { Math.random = real; }
    state.hostile[settlements[1].id] = { since: 1, vias: [], war: true, next: 0 }; hostilityTurn(); const raid = !!state.raid;
    wipeHome(); const colony = state.colonies[s.id];
    return { involved, raid, colony: { people: colony.town.people, hut: colony.built.hut, longhouse: colony.built.longhouse }, home: Object.values(state.built).filter(Boolean).length };
  });
  assert.equal(r.involved, 0); assert.equal(r.raid, true); assert.deepEqual(r.colony, { people: 6, hut: true, longhouse: true }); assert.equal(r.home, 0);
}));

test('dawn passes cleanly while you stand inside an annexed settlement, even when a war or a raid ends right then', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); interact(); closeDialog(); state.town.people = 6; build('hut'); build('longhouse'); build('garden'); assignWorker('garden', 1);
    const mine = townPeople.map(p => p.id).join(), homeFood = (state.parked).town.food;
    state.day = 20; for (const o of settlements) { o.owner = o === s ? 'player' : null; o.people = 8; }
    const a = settlements[1], d = settlements[2]; a.discovered = d.discovered = true; d.people = 1; a.people = 9;
    state.npcWars = [{ id: 7, a: a.id, d: d.id, since: 15, aid: 0, you: null, aSize: 9, dSize: 1 }];
    state.raid = { from: a.id, name: a.name, left: 0, total: 3, deadline: 0, looted: 0, killed: 0, war: true };
    let err = null; const real = Math.random; Math.random = () => 0.99;
    try { advanceDay(); } catch (e) { err = e.message; } finally { Math.random = real; }
    const saved = !!localStorage.getItem(AUTOSAVE_KEY);
    return { err, saved, cur: state.cur, zone: state.zone, built: state.built.garden === true, people: townPeople.map(p => p.id).join() === mine || townPeople.length > 0, night: state.day, warsLeft: state.npcWars.length, title: townTitle(), name: s.name };
  });
  assert.equal(r.err, null); assert.equal(r.saved, true); assert.equal(r.cur, 'town_0'); assert.equal(r.zone, 'town'); assert.equal(r.built, true); assert.equal(r.people, true); assert.equal(r.warsLeft, 0); assert.ok(r.title.startsWith(r.name), r.title);
}));

test('the world map keeps Brackenford’s and each colony’s own citizen counts, and a colony’s caravan post says deals run from home', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = setup(); state.town.people = 20; state.visited[s.id] = true; interact(); closeDialog(); state.town.people = 9; build('hut'); build('longhouse'); build('caravanPost');
    openMap(); const text = dialogText(); closeDialog(); openBuilding('caravanPost'); const post = dialogText(); closeDialog();
    return { text, post, name: s.name };
  });
  assert.ok(r.text.includes('Brackenford') && r.text.includes('20 citizens') && r.text.includes('9 citizens'), r.text); assert.ok(!/Brackenford[^·]*· your home · 9 citizens/.test(r.text));
  assert.ok(r.post.includes('run from Brackenford’s caravan post'), r.post);
}));
