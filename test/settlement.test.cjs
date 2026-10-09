// Browser-driven tests for settlement mode: the Brackenford map, enterable buildings, jobs, routes and upgrades.
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
    // Plenty of everything, so a test can focus on one rule at a time.
    window.RICH = () => {
      Object.assign(state.inv, { wood: 9999, stone: 9999, iron: 999, furs: 999, silver: 999, gold: 999, gems: 999, copper: 999, berries: 20 });
      state.unlocked = { smithy: true, huntersLodge: true, gemHall: true };
      state.coin = 500; state.town.people = 40;
    };
    window.BUILD_ALL = () => { RICH(); for (const k of ['hut', 'market', 'garden', 'well', 'smithy', 'huntersLodge', 'gemHall', 'lumberMill', 'mine', 'tannery', 'fishingHut', 'huntingCamp', 'barracks']) build(k); };
    window.dialogText = () => document.getElementById('dialog').textContent;
    window.dialogOpen = () => document.getElementById('overlay').style.display === 'grid';
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('the settlement map is connected: every door, worksite and patrol stop can be walked to from the gate', () => game(async page => {
  const r = await page.evaluate(() => {
    const m = getTownMap(), bad = [];
    if (!townWalkable(m[TOWN_START[1]][TOWN_START[0]])) bad.push('start');
    for (const [k, p] of Object.entries(TOWN_PLOTS)) {
      if (m[p.door[1]][p.door[0]] !== '▤') bad.push('door ' + k);
      if (!townWalkable(m[p.front[1]][p.front[0]])) bad.push('front ' + k);
      if (!townPath(TOWN_START, p.front).length) bad.push('unreachable front ' + k);
      for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (plotContaining(x, y) !== k) bad.push('overlap ' + k);
    }
    for (const [k, w] of Object.entries(TOWN_WORKSITES)) { if (!townWalkable(m[w[1]][w[0]])) bad.push('site ' + k); if (!townPath(TOWN_START, w).length) bad.push('unreachable worksite ' + k); }
    TOWN_PATROL.forEach((w, i) => { if (!townWalkable(m[w[1]][w[0]]) || !townPath(TOWN_START, w).length) bad.push('patrol ' + i); });
    return { bad, rows: m.length, cols: m[0].length, gates: m[TOWN_H - 1].filter(c => c === '▼').length };
  });
  assert.deepEqual(r.bad, []);
  assert.equal(r.rows, 40); assert.equal(r.cols, 60); assert.equal(r.gates, 2);
}));

test('E on the home tile walks into Brackenford and the south gate leads back out', () => game(async page => {
  const r = await page.evaluate(() => {
    state.x = HOME.x; state.y = HOME.y; interact();
    const inside = { zone: state.zone, onTownMap: map === getTownMap(), pos: [state.x, state.y], mode: document.getElementById('mode').dataset.mode, panel: document.getElementById('town-panel').classList.contains('visible') };
    state.x = 29; state.y = TOWN_H - 2; move(0, 1);
    return { inside, after: { zone: state.zone, onOverworld: map === overworld, at: [state.x, state.y] } };
  });
  assert.equal(r.inside.zone, 'town'); assert.equal(r.inside.onTownMap, true); assert.deepEqual(r.inside.pos, [29, 37]);
  assert.equal(r.inside.mode, 'SETTLEMENT'); assert.equal(r.inside.panel, true);
  assert.equal(r.after.zone, 'overworld'); assert.equal(r.after.onOverworld, true);
}));

test('walls and building bodies block you, but bumping a door goes inside', () => game(async page => {
  const r = await page.evaluate(() => {
    enterTown(); closeDialog();
    state.x = 28; state.y = 14; move(0, -1);              // the hall body, left of its door
    const blocked = [state.x, state.y, dialogOpen()];
    state.x = 29; state.y = 14; move(0, -1);              // the hall door
    const door = [state.x, state.y, dialogOpen(), dialogText().includes('Empty plot')];
    closeDialog(); state.x = 1; state.y = 5; move(-1, 0);
    return { blocked, door, wall: state.x };
  });
  assert.deepEqual(r.blocked, [28, 14, false]);
  assert.deepEqual(r.door, [29, 14, true, true]);
  assert.equal(r.wall, 1);
}));

test('an empty plot shows its cost and builds from the prompt, hiring a first worker', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; enterTown();
    state.x = 39; state.y = 14; move(0, -1);              // the trading post door
    const prompt = dialogText(), cost = costLabel('market');
    const before = { ...state.inv };
    document.querySelector('#dialog button').click();     // Build
    return { prompt, cost, built: state.built.market, wood: before.wood - state.inv.wood, stone: before.stone - state.inv.stone, crew: crew('market'), shop: dialogText() };
  });
  assert.ok(r.prompt.includes('Empty plot') && r.prompt.includes(r.cost), r.prompt);
  assert.equal(r.built, true); assert.equal(r.wood, 3); assert.equal(r.stone, 2); assert.equal(r.crew, 1);
  assert.ok(r.shop.includes('Trader') && r.shop.includes('Buy'), r.shop);
}));

test('citizens are assigned to jobs within building capacity and the number of free citizens', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); state.town.people = 3; build('hut'); build('lumberMill'); build('garden'); build('market');   // 3 citizens: each of the three working buildings gets one
    const start = { lumber: crew('lumberMill'), garden: crew('garden'), market: crew('market'), free: unassigned() };
    assignWorker('lumberMill', 1); const nobodyFree = crew('lumberMill');
    state.town.people = 8;
    assignWorker('market', 1); assignWorker('market', 1); const marketCap = crew('market');
    assignWorker('lumberMill', 1); assignWorker('lumberMill', 1); assignWorker('lumberMill', 1); const lumberCap = crew('lumberMill');
    assignWorker('garden', -1); assignWorker('garden', -1); const gardenOff = crew('garden');
    return { start, nobodyFree, marketCap, lumberCap, gardenOff, free: unassigned(), employed: employed(), capLumber: capacity('lumberMill'), capMarket: capacity('market') };
  });
  assert.deepEqual(r.start, { lumber: 1, garden: 1, market: 1, free: 0 });
  assert.equal(r.nobodyFree, 1); assert.equal(r.marketCap, 1); assert.equal(r.lumberCap, 2); assert.equal(r.gardenOff, 0);
  assert.equal(r.capLumber, 2); assert.equal(r.capMarket, 1);
  assert.equal(r.free, 8 - r.employed);
}));

test('the hall dialog opens the job list, and its buttons change the crews', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); build('lumberMill'); state.town.people = 5; enterTown();
    openBuilding('hut'); const hall = dialogText();
    citizensDialog(); const jobs = dialogText();
    const plus = [...document.querySelectorAll('#dialog button')].find(b => b.textContent === '+');
    plus.click();
    return { hall, jobs, crew: crew('lumberMill'), still: dialogOpen() };
  });
  assert.ok(r.hall.includes('Longhouse') && r.hall.includes('Settlement upgrades') && r.hall.includes('Citizens and jobs'), r.hall);
  assert.ok(r.jobs.includes('Lumber mill') && r.jobs.includes('Lumberjack'), r.jobs);
  assert.equal(r.crew, 2); assert.equal(r.still, true);
}));

test('daily output is crew size times rate times upgrade bonus, and nobody means nothing', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); state.inv.wood = 0; state.town.people = 6; state.assign.lumberMill = 2; state.town.food = 999;
    const day = () => { const b = state.inv.wood; advanceDay(); return state.inv.wood - b; };
    const plain = day();
    state.up.lumberMill = [true, false, false]; const one = day();
    state.up.lumberMill = [true, true, false]; const two = day();
    state.assign.lumberMill = 0; const empty = day();
    return { plain, one, two, empty };
  });
  assert.deepEqual(r, { plain: 4, one: 6, two: 8, empty: 0 });
}));

test('upgrade costs scale by tier, and every upgrade of a tier must be bought before the settlement evolves', () => game(async page => {
  const r = await page.evaluate(() => {
    BUILD_ALL();
    const costs = [1, 2, 3].map(t => upgradeCost('lumberMill', t));
    const tiers = [], names = [], resets = [], progress = [];
    const untilLast = [];
    for (let t = 1; t <= 3; t++) {
      for (const k of UPGRADE_KEYS.slice(0, -1)) buyUpgrade(k);
      untilLast.push(state.town.tier);                    // still the same tier with one upgrade missing
      progress.push(tierProgress());
      buyUpgrade(UPGRADE_KEYS[UPGRADE_KEYS.length - 1]);
      tiers.push(state.town.tier); names.push(hallName());
      resets.push(UPGRADE_KEYS.filter(k => hasUpgrade(k)).length);
    }
    const mult = upMult('lumberMill'), maxed = state.town.maxed;
    const spent = { ...state.inv }; buyUpgrade('lumberMill'); const idle = JSON.stringify(spent) === JSON.stringify(state.inv);
    return { costs, tiers, names, resets, untilLast, progress, mult, maxed, idle, beacon: UPGRADE_KEYS.includes('beacon') };
  });
  assert.deepEqual(r.costs, [{ wood: 4, stone: 2 }, { wood: 8, stone: 4 }, { wood: 12, stone: 6 }]);
  assert.deepEqual(r.untilLast, [1, 2, 3]); assert.deepEqual(r.progress, [12, 12, 12]);
  assert.deepEqual(r.tiers, [2, 3, 3]); assert.deepEqual(r.names, ['Town Hall', 'City Hall', 'City Hall']);
  assert.deepEqual(r.resets, [0, 0, 13]);                 // each new tier starts with nothing bought; the last one stays complete
  assert.equal(r.mult, 2.5); assert.equal(r.maxed, true); assert.equal(r.idle, true); assert.equal(r.beacon, false);
}));

test('an upgrade you cannot afford is refused, and an unbuilt building has none', () => game(async page => {
  const r = await page.evaluate(() => {
    state.inv.wood = 50; state.inv.stone = 50; build('lumberMill'); state.inv.wood = 1;
    buyUpgrade('lumberMill'); const poor = [hasUpgrade('lumberMill'), state.inv.wood];
    state.inv.wood = 50; buyUpgrade('mine'); const unbuilt = hasUpgrade('mine');
    buyUpgrade('lumberMill');
    return { poor, unbuilt, bought: hasUpgrade('lumberMill'), wood: state.inv.wood };
  });
  assert.deepEqual(r.poor, [false, 1]); assert.equal(r.unbuilt, false); assert.equal(r.bought, true); assert.equal(r.wood, 46);
}));

test('buildings hold more workers and the housing limit grows with each tier', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('market'); build('hut');
    const out = { t1: [capacity('lumberMill'), capacity('market'), housingCap()] };
    state.town.tier = 2; out.t2 = [capacity('lumberMill'), capacity('market'), housingCap()];
    state.town.tier = 3; out.t3 = [capacity('lumberMill'), capacity('market'), housingCap()];
    state.town.tier = 1; state.built.hut = false; out.noHut = housingCap();
    return out;
  });
  assert.deepEqual(r.t1, [2, 1, 14]); assert.deepEqual(r.t2, [4, 2, 26]); assert.deepEqual(r.t3, [6, 3, 38]); assert.equal(r.noHut, 2);
}));

test('newcomers follow the pantry: none when it is thin, the odd one when it is comfortable, one or two a day when it is full', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut');
    const day = (people, meals, roll) => {                       // meals are the ones in the pantry before the day's eating
      state.town.people = people; state.town.food = meals; state.starving = false;
      const real = Math.random; Math.random = () => roll;
      try { const before = state.town.people; advanceDay(); return state.town.people - before; } finally { Math.random = real; }
    };
    const out = { thin: day(4, 5, 0), slowLucky: day(4, 16, 0.1), slowUnlucky: day(4, 16, 0.9), steady: day(4, 24, 0.99), fast: day(4, 40, 0.99) };
    out.capped = day(housingCap() - 1, 999, 0.99);
    out.full = day(housingCap(), 999, 0.99);
    state.built.hut = false; out.noHall = day(4, 40, 0.99);
    return out;
  });
  assert.deepEqual(r, { thin: 0, slowLucky: 1, slowUnlucky: 0, steady: 1, fast: 2, capped: 1, full: 0, noHall: 0 });
}));

test('the growth forecast follows the pantry and the housing', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); const out = { noHall: growthLabel() };
    build('hut'); state.town.people = 4;
    const at = meals => { state.town.food = meals; return growthLabel(); };
    out.thin = at(5); out.slow = at(12); out.steady = at(20); out.fast = at(40);
    state.town.people = housingCap(); out.full = at(999);
    state.town.people = 4; state.starving = true; out.starving = at(40);
    state.starving = false; state.town.food = 40; renderTown(); out.panel = document.getElementById('town-stats').textContent;
    return out;
  });
  assert.equal(r.noHall, 'needs a longhouse'); assert.ok(r.thin.startsWith('none')); assert.equal(r.slow, 'slow'); assert.equal(r.steady, 'steady'); assert.equal(r.fast, 'fast');
  assert.equal(r.full, 'housing full'); assert.equal(r.starving, 'starving'); assert.ok(r.panel.includes('Growth') && r.panel.includes('fast'), r.panel);
}));

test('a working building needs a free citizen: you can only build while citizens outnumber the working buildings', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); state.town.people = 3;
    build('market'); build('garden'); build('lumberMill');          // 3 citizens: room for the first three
    const three = staffedBuildings();
    build('well'); const blocked = !!state.built.well;
    buildPrompt('well'); const prompt = dialogText(), button = [...document.querySelectorAll('#dialog button')].some(b => b.textContent.startsWith('Build')); closeDialog();
    build('hut'); const hut = !!state.built.hut;                     // the hall never needs staff
    state.town.people = 4; build('well'); const fourth = !!state.built.well;
    buildPrompt('tannery'); const stillFull = dialogText(); closeDialog();
    state.town.people = 5; buildPrompt('tannery'); const open = [...document.querySelectorAll('#dialog button')].some(b => b.textContent.startsWith('Build'));
    return { three, blocked, prompt, button, hut, fourth, stillFull, open, crews: employed() };
  });
  assert.equal(r.three, 3); assert.equal(r.blocked, false); assert.ok(r.prompt.includes('Nobody is free'), r.prompt); assert.equal(r.button, false);
  assert.equal(r.hut, true); assert.equal(r.fourth, true); assert.ok(r.stillFull.includes('Nobody is free'), r.stillFull); assert.equal(r.open, true);
}));

test('upgrades need one citizen per building in a Village, two in a Town and three in a City', () => game(async page => {
  const r = await page.evaluate(() => {
    BUILD_ALL();                                                    // 12 working buildings
    const need = [1, 2, 3].map(t => staffNeeded(t));
    const tryUp = (tier, people, key) => { state.town.tier = tier; state.town.people = people; buyUpgrade(key); return hasUpgrade(key, tier); };
    const out = { need, v11: tryUp(1, 11, 'lumberMill'), v12: tryUp(1, 12, 'lumberMill'), t23: tryUp(2, 23, 'market'), t24: tryUp(2, 24, 'market'), c35: tryUp(3, 35, 'garden'), c36: tryUp(3, 36, 'garden') };
    state.town.tier = 1; state.town.people = 11; upgradesDialog();
    out.dialog = dialogText(); out.disabled = [...document.querySelectorAll('#dialog button')].filter(b => b.textContent.startsWith('Upgrade')).every(b => b.disabled);
    state.town.people = 12; upgradesDialog(); out.enabled = [...document.querySelectorAll('#dialog button')].some(b => b.textContent.startsWith('Upgrade') && !b.disabled);
    return out;
  });
  assert.deepEqual(r.need, [12, 24, 36]);
  assert.equal(r.v11, false); assert.equal(r.v12, true); assert.equal(r.t23, false); assert.equal(r.t24, true); assert.equal(r.c35, false); assert.equal(r.c36, true);
  assert.ok(r.dialog.includes('Not enough citizens') && r.dialog.includes('12 needed'), r.dialog); assert.equal(r.disabled, true); assert.equal(r.enabled, true);
}));

test('the housing limit can hold the citizens a full city needs for its upgrades', () => game(async page => {
  const r = await page.evaluate(() => { RICH(); build('hut'); return [1, 2, 3].map(t => { state.town.tier = t; return housingCap() >= staffNeeded(t) || [t, housingCap(), staffNeeded(t)]; }); });
  assert.deepEqual(r, [true, true, true]);
}));

test('shops need a worker, trade at the building’s own prices, and specialists pay more for their goods', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('market'); build('lumberMill'); state.town.people = 6; assignWorker('lumberMill', 1);
    state.coin = 100; state.inv.wood = 3; state.inv.stone = 0;
    openBuilding('market'); const open = dialogText();
    shopAction('market', 'sell', 'wood'); const afterSell = [state.coin, state.inv.wood];
    shopAction('market', 'buy', 'stone'); const afterBuy = [state.coin, state.inv.stone];
    const prices = { marketSell: shopPrice('market', 'wood', 'sell'), millSell: shopPrice('lumberMill', 'wood', 'sell'), marketBuy: shopPrice('market', 'wood', 'buy'), millBuy: shopPrice('lumberMill', 'wood', 'buy') };
    assignWorker('market', -1); openBuilding('market'); const closed = dialogText();
    return { open, afterSell, afterBuy, prices, closed };
  });
  assert.ok(r.open.includes('Buy') && r.open.includes('Sell') && r.open.includes('Trader'), r.open);
  assert.deepEqual(r.afterSell, [103, 2]); assert.deepEqual(r.afterBuy, [96, 1]);
  assert.ok(r.prices.millSell > r.prices.marketSell && r.prices.millBuy < r.prices.marketBuy, JSON.stringify(r.prices));
  assert.ok(r.closed.includes('Nobody works here') && !r.closed.includes('Sell'), r.closed);
}));

test('the fishing hut and hunting camp sell meals for the pantry, the well heals once a day, the hall rests for free', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('fishingHut'); build('well'); build('hut'); state.town.people = 6; assignWorker('well', 1); state.coin = 50; state.town.food = 4;
    openBuilding('fishingHut'); const meals = dialogText();
    buyMeals('fishingHut', 5); const pantry = [state.town.food, state.coin];
    state.hp = 1; state.maxHp = 5; drinkWell(); const drank = state.hp; drinkWell(); const again = state.hp;
    state.day++; state.hp = 1; drinkWell(); const nextDay = state.hp;
    hallRest(); return { meals, pantry, drank, again, nextDay, rested: state.hp, max: state.maxHp };
  });
  assert.ok(r.meals.includes('Fisher') && r.meals.includes('meal'), r.meals);
  assert.deepEqual(r.pantry, [9, 41]); assert.equal(r.drank, 3); assert.equal(r.again, 3); assert.equal(r.nextDay, 3); assert.equal(r.rested, r.max);
}));

test('the smithy and the mine shaft open from their buildings once someone works there', () => game(async page => {
  const r = await page.evaluate(() => {
    BUILD_ALL(); state.town.people = 14; for (const k of ['smithy', 'mine']) for (let i = 0; i < 20 && crew(k) < 1; i++) assignWorker(k, 1);
    openBuilding('smithy'); const smithy = dialogText();
    openBuilding('mine'); const shaft = dialogText();
    closeDialog(); exitToMine(); const down = [state.zone, map === homeMine.layers[1]];
    exitInstance(); return { smithy, shaft, down, back: [state.zone, state.x === HOME.x && state.y === HOME.y] };
  });
  assert.ok(r.smithy.includes('Blacksmith') && r.smithy.includes('Make'), r.smithy);
  assert.ok(r.shaft.includes('Descend') && r.shaft.includes('Sell'), r.shaft);
  assert.deepEqual(r.down, ['mine', true]); assert.deepEqual(r.back, ['overworld', true]);
}));

test('workers walk back and forth between their building and their worksite, never through walls', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('fishingHut'); build('garden'); state.town.people = 8;
    for (const k of ['lumberMill', 'fishingHut', 'garden']) for (let i = 0; i < 20 && crew(k) < 1; i++) assignWorker(k, 1);
    enterTown(); closeDialog();
    const seen = {}, bad = [];
    for (let i = 0; i < 600; i++) {
      moveTownPeople();
      const cells = new Set();
      for (const p of townPeople) {
        if (!townWalkable(map[p.y][p.x])) bad.push(p.name + ' in a wall');
        if (p.x === state.x && p.y === state.y) bad.push('on the player');
        if (cells.has(p.x + ',' + p.y)) bad.push('stacked'); cells.add(p.x + ',' + p.y);
        (seen[p.job] = seen[p.job] || new Set()).add(p.x + ',' + p.y);
      }
    }
    const visits = k => [seen[k].has(TOWN_PLOTS[k].front.join(',')), seen[k].has(TOWN_WORKSITES[k].join(','))];
    return { bad: bad.slice(0, 5), lumber: visits('lumberMill'), fish: visits('fishingHut'), farm: visits('garden') };
  });
  assert.deepEqual(r.bad, []);
  assert.deepEqual(r.lumber, [true, true]); assert.deepEqual(r.fish, [true, true]); assert.deepEqual(r.farm, [true, true]);
}));

test('soldiers are assigned citizens and patrol the whole route, in town and in the wilds', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('barracks'); state.town.people = 6;
    const one = soldierCount();
    assignWorker('barracks', 1); assignWorker('barracks', 1); assignWorker('barracks', 1);
    syncSoldiers(); const wild = state.soldiers.length;
    enterTown(); closeDialog();
    const stops = new Set(), bad = [];
    for (let i = 0; i < 800; i++) {
      moveTownPeople();
      for (const p of townPeople) if (p.job === 'barracks') { stops.add(p.x + ',' + p.y); if (!townWalkable(map[p.y][p.x])) bad.push('wall'); }
    }
    const patrolled = TOWN_PATROL.map(([x, y]) => stops.has(x + ',' + y));
    const soldiers = townPeople.filter(p => p.job === 'barracks').length;
    assignWorker('barracks', -1); syncSoldiers();
    return { one, wild, patrolled, bad, soldiers, after: state.soldiers.length };
  });
  assert.equal(r.one, 1); assert.equal(r.wild, 4); assert.deepEqual(r.patrolled, [true, true, true, true]); assert.deepEqual(r.bad, []);
  assert.equal(r.soldiers, 4); assert.equal(r.after, 3);
}));

test('walking into a citizen starts a conversation with their name and job', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('hut'); state.town.people = 4; enterTown(); closeDialog();
    const p = townPeople.find(q => q.job === 'lumberMill');
    state.x = p.x - 1; state.y = p.y; map[state.y][state.x] = '.';
    move(1, 0); const text = dialogText();
    return { name: p.name, text, pos: [state.x, p.x] };
  });
  assert.ok(r.text.includes(r.name) && r.text.includes('Lumberjack'), r.text);
  assert.equal(r.pos[0], r.pos[1] - 1);
}));

test('citizens keep their place when jobs change, and newcomers get routes', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('garden'); state.town.people = 5; syncTownPeople();
    const before = townPeople.map(p => [p.id, p.x, p.y]);
    assignWorker('garden', 1); assignWorker('lumberMill', 1);
    const moved = townPeople.filter((p, i) => p.x !== before[i][1] || p.y !== before[i][2]).length;
    state.town.people = 7; syncTownPeople();
    return { moved, count: townPeople.length, routes: townPeople.every(p => p.targets.length >= 2), ids: new Set(townPeople.map(p => p.id)).size };
  });
  assert.equal(r.moved, 0); assert.equal(r.count, 7); assert.equal(r.routes, true); assert.equal(r.ids, 7);
}));

test('saving and loading inside the settlement returns you there with your citizens', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('hut'); state.town.people = 4; enterTown(); closeDialog();
    state.x = 29; state.y = 30; saveWorld();
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    exitTown(); state.coin = 1;
    hydrateWorld(saved);
    return { zone: state.zone, pos: [state.x, state.y], onTown: map === getTownMap(), people: townPeople.length, crew: crew('lumberMill'), coin: state.coin };
  });
  assert.equal(r.zone, 'town'); assert.deepEqual(r.pos, [29, 30]); assert.equal(r.onTown, true); assert.equal(r.people, 4);
  assert.equal(r.crew, 1); assert.equal(r.coin, 500);
}));

test('an old save without jobs staffs the buildings it already had, one citizen each', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); state.built.market = state.built.garden = state.built.lumberMill = true; state.town.people = 2;
    state.assign = {}; state.up = {}; state.assignReady = false;
    ensureSettlementState();
    return { employed: employed(), free: unassigned(), up: state.up };
  });
  assert.equal(r.employed, 2); assert.equal(r.free, 0); assert.deepEqual(r.up, {});
}));

test('overworld workers match the crews', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('lumberMill'); build('garden'); state.town.people = 8;
    assignWorker('lumberMill', 1); assignWorker('lumberMill', 1); syncWorkers();
    const lumber = state.workers.filter(w => w.building === 'lumberMill').length, farm = state.workers.filter(w => w.building === 'garden').length;
    assignWorker('lumberMill', -1); syncWorkers();
    return { lumber, farm, after: state.workers.filter(w => w.building === 'lumberMill').length, expected: [crew('lumberMill'), crew('garden')] };
  });
  assert.equal(r.lumber, 2); assert.equal(r.farm, 1); assert.equal(r.after, 1);
}));

test('both renderers draw the settlement, its people and the player', () => game(async page => {
  const r = await page.evaluate(() => {
    BUILD_ALL(); state.town.people = 10; for (const k of ['market', 'lumberMill', 'barracks']) assignWorker(k, 1);
    enterTown(); closeDialog(); for (let i = 0; i < 20; i++) moveTownPeople();
    state.x = 29; state.y = 15; useGfx = true; render();
    const gfx = !!document.getElementById('view').width;
    useGfx = false; render();
    const text = document.getElementById('map').textContent;
    state.y = 36; render(); const south = document.getElementById('map').textContent;
    const sidebar = document.getElementById('town-stats').textContent;
    useGfx = true; render();
    return { gfx, text: { player: text.includes('@'), door: text.includes('▤'), people: /[ws]/.test(text), gate: south.includes('▼') }, sidebar };
  });
  assert.equal(r.gfx, true);
  assert.deepEqual(r.text, { player: true, door: true, people: true, gate: true });
  assert.ok(r.sidebar.includes('Longhouse') && r.sidebar.includes('Citizens') && r.sidebar.includes('upgrades'), r.sidebar);
}));

test('the world clock keeps running in town: citizens walk and the day advances', () => game(async page => {
  const r = await page.evaluate(async () => {
    RICH(); build('lumberMill'); build('hut'); state.town.people = 4; enterTown(); closeDialog(); manualPause = false;
    const p = townPeople.find(q => q.job === 'lumberMill'), start = [p.x, p.y], day = state.day;
    state.dayClock = DAY_MS - 300;
    await new Promise(res => setTimeout(res, 1800));
    manualPause = true;
    return { moved: p.x !== start[0] || p.y !== start[1] || p.path.length > 0 || p.wait > 0, dayAdvanced: state.day > day, zone: state.zone };
  });
  assert.equal(r.moved, true); assert.equal(r.dayAdvanced, true); assert.equal(r.zone, 'town');
}));
