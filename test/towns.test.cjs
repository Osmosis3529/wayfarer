// Browser-driven tests for walking into other settlements, the world map, fast travel, roads, and settlement colours.
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
    window.dialogOpen = () => document.getElementById('overlay').style.display === 'grid';
    window.ground = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (overworld[y] && overworld[y][x] !== undefined && !'SCDKM⌂'.includes(overworld[y][x])) overworld[y][x] = '.'; };
    // a strip of open grass joining two places, so a road between them always exists
    window.joinByLand = (a, b) => { ground(Math.min(a.x, b.x) - 1, a.y - 1, Math.max(a.x, b.x) + 1, a.y + 1); ground(b.x - 1, Math.min(a.y, b.y) - 1, b.x + 1, Math.max(a.y, b.y) + 1); };
    window.discover = n => { const out = []; for (let i = 0; i < n; i++) { settlements[i].discovered = true; out.push(settlements[i]); } return out; };
    // every tile you can walk to from (sx, sy) on the current town map
    window.townReach = (sx, sy) => {
      const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (map[ny] && townWalkable(map[ny][nx]) && !seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } }
      return seen;
    };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('the home icon is the same double-house icon the other settlements use', () => game(async page => {
  const r = await page.evaluate(() => ({ home: GFX.SPRITE_OF['⌂'], town: GFX.SPRITE_OF['S'] }));
  assert.equal(r.home, 'town'); assert.equal(r.home, r.town);
}));

test('a World map button is always in the menu outside caves, dungeons and mines, and M opens it', () => game(async page => {
  const r = await page.evaluate(() => {
    const has = () => document.getElementById('actions').textContent.includes('World map');
    const out = {};
    state.x = HOME.x + 15; state.y = HOME.y; render(); out.wilds = has();
    state.x = HOME.x; state.y = HOME.y; render(); out.home = has();
    enterTown(); out.brackenford = has();
    exitTown(); const s = discover(1)[0]; state.x = s.x; state.y = s.y; enterSettlement(s.id); out.visiting = has();
    exitTown(); enterInstance(caves[0], 'cave'); out.cave = has(); exitInstance();
    enterInstance(homeMine, 'mine'); out.mine = has(); exitInstance();
    manualPause = false; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })); manualPause = true;
    out.keyOpens = dialogOpen() && dialogText().includes('World map'); closeDialog();
    return out;
  });
  assert.deepEqual(r, { wilds: true, home: true, brackenford: true, visiting: true, cave: false, mine: false, keyOpens: true });
}));

test('the world map shows what you have explored and found, and fast travel is only offered from inside a settlement', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a, b] = discover(2); state.coin = 500;
    for (let y = a.y - 6; y <= a.y + 6; y++) for (let x = a.x - 6; x <= a.x + 6; x++) state.explored[y][x] = true;
    state.x = HOME.x + 15; state.y = HOME.y; openMap();
    const cv = document.getElementById('worldmap'), px = (x, y) => [...cv.getContext('2d').getImageData(x * 3 + 1, y * 3 + 1, 1, 1).data.slice(0, 3)];
    const dark = px(2, 2).join(), seen = px(a.x - 3, a.y + 3).join(), marker = px(a.x, a.y).join();
    const outside = { text: dialogText(), rides: [...document.querySelectorAll('#dialog button')].filter(x => x.textContent.startsWith('Ride')).map(x => x.disabled) };
    closeDialog(); state.x = HOME.x; state.y = HOME.y; enterTown(); state.visited[a.id] = true; openMap();
    const inside = { rides: [...document.querySelectorAll('#dialog button')].filter(x => x.textContent.startsWith('Ride')).map(x => [x.textContent, x.disabled]), text: dialogText() };
    return { dark, seen, marker, outside, inside, a: a.name, b: b.name, canvas: [cv.width, cv.height] };
  });
  assert.deepEqual(r.canvas, [183 * 3, 135 * 3]); assert.notEqual(r.dark, r.seen); assert.notEqual(r.marker, r.seen);
  assert.ok(r.outside.text.includes('Fast travel is arranged from inside a settlement') && r.outside.rides.every(d => d), JSON.stringify(r.outside));
  assert.ok(r.inside.text.includes(r.a) && r.inside.text.includes(r.b) && r.inside.text.includes('you are here'), r.inside.text);
  const rideA = r.inside.rides.find(x => true);
  assert.equal(r.inside.rides.length, 2); assert.equal(rideA[1], false);            // the visited one can be ridden to...
  assert.equal(r.inside.rides[1][1], true);                                         // ...the one you only saw cannot
}));

test('settlements get a colour each, workers wear it, and Brackenford has its own', () => game(async page => {
  const r = await page.evaluate(() => {
    const colors = settlements.map(s => settlementColor(s.id));
    const worker = (id) => workerColor(id);
    // the tint changes the chest of a worker sprite and nothing else
    const px = (color, x, y) => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); GFX.sprite(g, 'worker', 0, 0, 1, false, null, color); return [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]; };
    return { distinct: new Set([...colors, settlementColor('home')]).size, count: colors.length + 1, bracken: settlementColor('home'), homeWorker: worker('home:lumberMill:0'), townWorker: worker(settlements[3].id + ':worker:1'), expected: colors[3],
      chestA: px('#e0554d', 8, 10), chestB: px('#4aa3df', 8, 10), plain: px(null, 8, 10), headA: px('#e0554d', 8, 5), headB: px('#4aa3df', 8, 5), plainHead: px(null, 8, 5) };
  });
  assert.equal(r.distinct, r.count); assert.equal(r.homeWorker, r.bracken); assert.equal(r.townWorker, r.expected);
  assert.notDeepEqual(r.chestA, r.chestB); assert.notDeepEqual(r.chestA, r.plain); assert.deepEqual(r.headA, r.headB); assert.deepEqual(r.headA, r.plainHead);
}));

test('workers on the overworld wear their own settlement’s colour, in sprites and in text', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); ground(s.x - 7, s.y - 7, s.x + 7, s.y + 7);
    for (let y = s.y - 8; y <= s.y + 8; y++) for (let x = s.x - 8; x <= s.x + 8; x++) state.explored[y][x] = true;
    state.x = s.x + 3; state.y = s.y + 3; syncWorkers(); useGfx = false; render();
    const spans = [...document.querySelectorAll('#map .worker')].map(e => e.style.color);
    useGfx = true; render();
    return { spans: spans.length, colors: [...new Set(spans)], expected: settlementColor(s.id) };
  });
  assert.ok(r.spans > 0); assert.equal(r.colors.length, 1);
  const hex = r.expected.replace('#', ''), rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
  assert.equal(r.colors[0], rgb);
}));

test('every settlement is a walkable map whose size follows its population, with a door for every building and a way out', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = { bad: [], dims: {}, houses: {} };
    const s = settlements[0]; s.discovered = true;
    for (const people of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 30]) {
      for (const id of [settlements[0].id, settlements[5].id, settlements[9].id]) {
        const t = settlements.find(q => q.id === id); t.people = people; t.cap = Math.max(t.cap, people);
        state.visiting = id; npcCurrent = null; map = npcMap().grid; const tm = npcMap(), { w, h, plots } = tm;
        if (map.length !== h || map[0].length !== w) bad(out, 'dims', people);
        const reach = townReach(tm.start[0], tm.start[1]), kinds = Object.values(plots).map(p => p.kind);
        for (const k of ['market', 'inn', 'travel', 'hall']) if (kinds.filter(x => x === k).length !== 1) out.bad.push('kind ' + k + ' @' + people);
        const expectedHouses = Math.min(kinds.length - 4 + (Object.keys(plots).length - kinds.length), Math.ceil(people * 0.9));
        for (const [key, p] of Object.entries(plots)) {
          if (map[p.door[1]][p.door[0]] !== '▤') out.bad.push('door ' + key + ' @' + people);
          if (!reach.has(p.front[0] + ',' + p.front[1])) out.bad.push('front ' + key + ' @' + people + ' ' + id);
          for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (plotContaining(x, y) !== key) out.bad.push('overlap ' + key);
        }
        if (map[h - 1].filter(c => c === '▼').length !== 2 || !reach.has(tm.start[0] + ',' + tm.start[1])) out.bad.push('gate @' + people);
        out.dims[people] = [w, h]; out.houses[people] = kinds.filter(k => k === 'house').length;
        townPeople = []; const folks = syncNpcPeople();
        if (folks.length !== Math.min(26, Math.max(2, people))) out.bad.push('people count @' + people);
        for (const p of folks) if (!townWalkable(map[p.y][p.x])) out.bad.push('person in wall @' + people);
        if (folks.some(p => p.targets.some(t => !reach.has(t[0] + ',' + t[1])))) out.bad.push('unreachable target @' + people);
      }
    }
    state.visiting = null; map = overworld;
    function bad(o, what, p) { o.bad.push(what + ' @' + p); }
    return out;
  });
  assert.deepEqual([...new Set(r.bad)], []);
  assert.deepEqual([r.dims[2], r.dims[4]], [[34, 19], [34, 19]]); assert.deepEqual([r.dims[5], r.dims[7]], [[42, 25], [42, 25]]); assert.deepEqual([r.dims[8], r.dims[10]], [[50, 25], [50, 25]]);
  assert.deepEqual([r.dims[11], r.dims[13]], [[58, 31], [58, 31]]); assert.deepEqual([r.dims[14], r.dims[30]], [[66, 31], [66, 31]]);
  assert.ok(r.houses[30] > r.houses[10] && r.houses[10] > r.houses[3], JSON.stringify(r.houses));
}));

test('a settlement’s map grows with its people: bigger once it crosses a size, and more homes within a size, with the same landmarks', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); state.x = s.x; state.y = s.y; s.cap = 40;
    const look = () => { state.visiting = null; npcCurrent = null; enterSettlement(s.id, true); const t = npcMap(); const spot = k => Object.values(t.plots).find(p => p.kind === k); const out = { w: t.w, h: t.h, homes: Object.values(t.plots).filter(p => p.kind === 'house').length, market: [spot('market').x0, spot('market').y0], hall: spot('hall').name }; exitTown(); return out; };
    s.people = 5; const small = look(); s.people = 7; const bigger = look(); s.people = 9; const larger = look(); s.people = 15; const city = look();
    return { small, bigger, larger, city };
  });
  assert.equal(r.small.w, 42); assert.equal(r.bigger.w, 42); assert.deepEqual(r.small.market, r.bigger.market); assert.ok(r.bigger.homes > r.small.homes);
  assert.equal(r.larger.w, 50); assert.equal(r.city.w, 66); assert.equal(r.city.h, 31);
  assert.deepEqual([r.small.hall, r.larger.hall, r.city.hall], ['Hall', 'Town hall', 'City hall']);
}));

test('E on a settlement tile walks you in; the gate walks you out where you came in', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); state.x = s.x; state.y = s.y; s.people = 8;
    interact();
    const inside = { zone: state.zone, visiting: state.visiting, onMap: map === npcMap().grid, visited: !!state.visited[s.id], mode: document.getElementById('mode').dataset.mode, title: document.getElementById('map-title').textContent, people: townPeople.length, panel: document.getElementById('town-stats').textContent, actions: document.getElementById('actions').textContent };
    const t = npcMap(); state.x = t.cx; state.y = t.h - 2; move(0, 1);
    return { inside, after: { zone: state.zone, visiting: state.visiting, at: [state.x, state.y], expected: [s.x, s.y], onOverworld: map === overworld }, name: s.name };
  });
  assert.equal(r.inside.zone, 'town'); assert.notEqual(r.inside.visiting, null); assert.equal(r.inside.onMap, true); assert.equal(r.inside.visited, true); assert.equal(r.inside.mode, 'SETTLEMENT');
  assert.ok(r.inside.title.includes(r.name), r.inside.title); assert.equal(r.inside.people, 8);
  assert.ok(r.inside.panel.includes('Citizens') && r.inside.panel.includes('Mood') && !r.inside.panel.includes('Pantry'), r.inside.panel);
  assert.ok(r.inside.actions.includes('Leave ' + r.name) && !r.inside.actions.includes('Donate'), r.inside.actions);
  assert.equal(r.after.zone, 'overworld'); assert.equal(r.after.visiting, null); assert.deepEqual(r.after.at, r.after.expected); assert.equal(r.after.onOverworld, true);
}));

test('every building of a settlement opens: market, inn, caravan post, hall and homes', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); state.x = s.x; state.y = s.y; s.people = 8; interact();
    const t = npcMap(), by = k => Object.entries(t.plots).find(([, p]) => p.kind === k)[0], bump = key => { const p = t.plots[key]; closeDialog(); state.x = p.front[0]; state.y = p.front[1]; move(0, -1); return dialogText(); };
    const out = { market: bump(by('market')), travel: bump(by('travel')), hall: bump(by('hall')), house: bump(by('house')) };
    state.coin = 50; state.hp = 1; out.inn = bump(by('inn')); const day = state.day;
    document.querySelector('#dialog button').click();
    out.rested = { hp: state.hp, max: state.maxHp, day: state.day - day, coin: state.coin, still: state.zone, cost: 5 + (s.bias || 0) };
    return { ...out, name: s.name };
  });
  assert.ok(r.market.includes(r.name) && r.market.includes('Buy') && r.market.includes('Sell'), r.market);
  assert.ok(r.travel.includes('World map'), r.travel); assert.ok(r.hall.includes(r.name) && r.hall.includes('citizens'), r.hall); assert.ok(r.house.includes('home'), r.house);
  assert.ok(r.inn.includes('inn') && r.inn.includes('Rest for the night'), r.inn);
  assert.equal(r.rested.hp, r.rested.max); assert.equal(r.rested.day, 1); assert.equal(r.rested.coin, 50 - r.rested.cost); assert.equal(r.rested.still, 'town');
}));

test('citizens of other settlements walk their streets, talk, and the guards wear the settlement’s colour', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); state.x = s.x; state.y = s.y; s.people = 12; interact();
    const guards = townPeople.filter(p => p.job === 'guard').length, villagers = townPeople.filter(p => p.job === 'villager').length;
    const seen = new Set(), bad = [];
    for (let i = 0; i < 300; i++) { moveTownPeople(); const cells = new Set(); for (const p of townPeople) { if (!townWalkable(map[p.y][p.x])) bad.push('wall'); if (cells.has(p.x + ',' + p.y)) bad.push('stacked'); cells.add(p.x + ',' + p.y); seen.add(p.x + ',' + p.y); } }
    const p = townPeople[townPeople.length - 1]; state.x = p.x - 1; state.y = p.y; map[state.y][state.x] = '.'; move(1, 0);
    return { guards, villagers, bad: bad.slice(0, 3), explored: seen.size, talk: dialogText(), name: p.name, color: currentColor() === settlementColor(s.id) };
  });
  assert.equal(r.guards, 3); assert.equal(r.villagers, 9); assert.deepEqual(r.bad, []); assert.ok(r.explored > 25, 'people barely move: ' + r.explored);
  assert.ok(r.talk.includes(r.name) && (r.talk.includes('Villager') || r.talk.includes('Guard')), r.talk); assert.equal(r.color, true);
}));

test('both renderers draw another settlement', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); state.x = s.x; state.y = s.y; s.people = 9; interact(); for (let i = 0; i < 20; i++) moveTownPeople();
    const t = npcMap(); state.x = t.cx; state.y = t.py + 1;
    useGfx = true; render(); const gfx = !!document.getElementById('view').width;
    useGfx = false; render(); const text = document.getElementById('map').textContent, coloured = [...document.querySelectorAll('#map span')].some(e => e.style.color);
    useGfx = true; render();
    return { gfx, player: text.includes('@'), door: text.includes('▤'), people: /[ws]/.test(text), coloured };
  });
  assert.deepEqual(r, { gfx: true, player: true, door: true, people: true, coloured: true });
}));

test('a settlement at war shuts its gates, and declaring war from its hall puts you outside', () => game(async page => {
  const r = await page.evaluate(() => {
    Object.assign(state.inv, { wood: 99, stone: 99 }); state.town.people = 8; build('barracks'); assignWorker('barracks', 1);
    const [s] = discover(1); state.x = s.x; state.y = s.y; ground(s.x - 9, s.y - 9, s.x + 9, s.y + 9); overworld[s.y][s.x] = 'S';
    interact(); const t = npcMap(), hall = Object.entries(t.plots).find(([, p]) => p.kind === 'hall')[0];
    npcBuilding(hall); const text = dialogText(); const button = [...document.querySelectorAll('#dialog button')].find(b => b.textContent.startsWith('Declare war'));
    button.click();
    const out = { zone: state.zone, visiting: state.visiting, at: [state.x, state.y], war: !!state.wars[s.id], expected: [s.x, s.y] };
    closeDialog(); interact();                                  // try to walk back in while at war
    out.blocked = { zone: state.zone, dialog: dialogText() };
    return { text, out };
  });
  assert.ok(r.text.includes('Declare war'), r.text);
  assert.equal(r.out.zone, 'overworld'); assert.equal(r.out.visiting, null); assert.equal(r.out.war, true); assert.deepEqual(r.out.at, r.out.expected);
  assert.equal(r.out.blocked.zone, 'overworld'); assert.ok(r.out.blocked.dialog.includes('at war'), r.out.blocked.dialog);
}));

test('an annexed settlement can still be walked into, and says whose banner it flies', () => game(async page => {
  const r = await page.evaluate(() => {
    const [s] = discover(1); s.owner = 'player'; state.x = s.x; state.y = s.y; interact();
    const t = npcMap(), hall = Object.entries(t.plots).find(([, p]) => p.kind === 'hall')[0]; npcBuilding(hall);
    return { zone: state.zone, hall: dialogText(), panel: document.getElementById('town-stats').textContent };
  });
  assert.equal(r.zone, 'town'); assert.ok(r.hall.includes('annexed by Brackenford'), r.hall); assert.ok(r.panel.includes('annexed by Brackenford'), r.panel);
}));

test('fast travel costs more the farther you go, needs a visited settlement and enough coin, and arrives inside', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a, b] = discover(2); joinByLand({ x: HOME.x, y: HOME.y }, a);
    const home = { x: HOME.x, y: HOME.y }, near = { x: 0, y: 0 }, far = { x: 100, y: 0 };
    const costs = [travelCost(near, { x: 9, y: 0 }), travelCost(near, { x: 30, y: 0 }), travelCost(near, far), travelCost(near, { x: 200, y: 0 })];
    // outside a settlement
    state.x = HOME.x + 20; state.y = HOME.y; state.coin = 1000; travelTo(a.id); const outside = { zone: state.zone, coin: state.coin };
    // in Brackenford, not yet visited
    state.x = HOME.x; state.y = HOME.y; enterTown(); travelTo(a.id); const unvisited = { visiting: state.visiting, coin: state.coin };
    state.visited[a.id] = true; state.visited[b.id] = true;
    const costA = travelCost(home, a); state.coin = costA - 1; travelTo(a.id); const poor = { visiting: state.visiting, coin: state.coin };
    state.coin = 100; travelTo(a.id);
    const arrived = { zone: state.zone, visiting: state.visiting, paid: 100 - state.coin, costA, at: [state.x, state.y], start: npcMap().start, log: state.log[0].t };
    travelTo(a.id); const same = { paid: 100 - state.coin };
    state.coin = 500; travelTo('home'); const back = { zone: state.zone, visiting: state.visiting, onBrackenford: map === getTownMap() && state.visiting === null };
    return { costs, outside, unvisited, poor, arrived, same, back };
  });
  assert.equal(r.costs[0], 3); assert.ok(r.costs[1] < r.costs[2] && r.costs[2] < r.costs[3], JSON.stringify(r.costs));
  assert.deepEqual(r.outside, { zone: 'overworld', coin: 1000 }); assert.deepEqual(r.unvisited, { visiting: null, coin: 1000 });
  assert.equal(r.poor.visiting, null);
  assert.equal(r.arrived.zone, 'town'); assert.notEqual(r.arrived.visiting, null); assert.equal(r.arrived.paid, r.arrived.costA); assert.deepEqual(r.arrived.at, r.arrived.start); assert.ok(r.arrived.log.includes('You ride from Brackenford'), r.arrived.log);
  assert.equal(r.same.paid, r.arrived.costA); assert.equal(r.back.zone, 'town'); assert.equal(r.back.onBrackenford, true);
}));

test('fast travel to a settlement at war is refused', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a] = discover(1); state.visited[a.id] = true; state.coin = 500; state.wars[a.id] = { total: 3, left: 3 };
    enterTown(); travelTo(a.id); const refused = { zone: state.zone, visiting: state.visiting, coin: state.coin };
    openMap(); const text = dialogText(); return { refused, text };
  });
  assert.deepEqual(r.refused, { zone: 'town', visiting: null, coin: 500 }); assert.ok(r.text.includes('At war'), r.text);
}));

test('riding between two settlements lays a road over open ground, marks it on every view, and keeps it in saves', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a] = discover(1); joinByLand({ x: HOME.x, y: HOME.y }, a); state.visited[a.id] = true; state.coin = 500;
    const before = state.roads.length; enterTown(); travelTo(a.id);
    const roads = [...state.roads], set = new Set(roads), W = WORLD_W;
    const tiles = roads.map(k => [k % W, Math.floor(k / W)]);
    const water = tiles.filter(([x, y]) => overworld[y][x] === '≈').length;
    // connected from Brackenford to the settlement over 4-neighbour steps
    const seen = new Set([HOME.y * W + HOME.x]), q = [[HOME.x, HOME.y]];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (y + dy) * W + x + dx; if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } } }
    const linked = seen.has(a.y * W + a.x);
    // views
    exitTown(); state.x = HOME.x + 2; state.y = HOME.y; const far = (x, y, p) => Math.hypot(x - p.x, y - p.y) > 7, roadTile = tiles.find(([x, y]) => overworld[y][x] === '.' && far(x, y, { x: HOME.x, y: HOME.y }) && far(x, y, a) && !isRoad(x + 3, y + 3));
    let gfxDiffers = null, text = null, map3 = null;
    if (roadTile) {
      state.x = roadTile[0]; state.y = roadTile[1] + 1; if (overworld[state.y][state.x] === '≈') state.y -= 2;
      useGfx = true; render(); const cv = document.getElementById('view'), g = cv.getContext('2d'), T = 16;
      const at = (x, y) => [...g.getImageData((x - (state.x - 12)) * T + 3, (y - (state.y - 7)) * T + 6, 1, 1).data.slice(0, 3)].join();
      const offRoad = [roadTile[0] + 3, roadTile[1] + 3];
      gfxDiffers = !set.has(offRoad[1] * W + offRoad[0]) ? at(roadTile[0], roadTile[1]) !== at(offRoad[0], offRoad[1]) : null;
      useGfx = false; render(); text = document.querySelectorAll('#map .road').length; useGfx = true; render();
      openMap(); const m = document.getElementById('worldmap').getContext('2d').getImageData(roadTile[0] * 3 + 1, roadTile[1] * 3 + 1, 1, 1).data; map3 = [m[0], m[1], m[2]].join(); closeDialog();
    }
    // saved and loaded
    saveWorld(); const data = JSON.parse(localStorage.getItem(SAVE_KEY)); state.roads = []; hydrateWorld(data);
    return { before, count: roads.length, water, linked, gfxDiffers, text, map3, saved: state.roads.length === roads.length, startsAtBoth: set.has(HOME.y * W + HOME.x) && set.has(a.y * W + a.x), };
  });
  assert.equal(r.before, 0); assert.ok(r.count > 5); assert.equal(r.water, 0); assert.equal(r.linked, true); assert.equal(r.startsAtBoth, true);
  assert.notEqual(r.gfxDiffers, false); assert.ok(r.text > 0, 'no road in the text map'); assert.equal(r.map3, [201, 169, 110].join()); assert.equal(r.saved, true);
}));

test('a second trip over the same ground adds no new road, and roads never cross water', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a] = discover(1); joinByLand({ x: HOME.x, y: HOME.y }, a);
    const first = addRoad({ x: HOME.x, y: HOME.y }, a), count = state.roads.length, again = addRoad({ x: HOME.x, y: HOME.y }, a);
    const W = WORLD_W, wet = state.roads.filter(k => overworld[Math.floor(k / W)][k % W] === '≈').length;
    return { first, again, count, after: state.roads.length, wet };
  });
  assert.ok(r.first > 5); assert.equal(r.again, 0); assert.equal(r.after, r.count); assert.equal(r.wet, 0);
}));

test('a settlement you can only reach across water gets no road', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a] = discover(1);
    // a lake from edge to edge, halfway between them
    if (Math.abs(a.x - HOME.x) >= Math.abs(a.y - HOME.y)) { const x = Math.round((HOME.x + a.x) / 2); for (let y = 0; y < WORLD_H; y++) overworld[y][x] = '≈'; }
    else { const y = Math.round((HOME.y + a.y) / 2); for (let x = 0; x < WORLD_W; x++) overworld[y][x] = '≈'; }
    return { added: addRoad({ x: HOME.x, y: HOME.y }, a), roads: state.roads.length };
  });
  assert.deepEqual(r, { added: 0, roads: 0 });
}));

test('visited settlements, roads and the settlement you are inside survive saving; old saves get defaults', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a, b] = discover(2); joinByLand({ x: HOME.x, y: HOME.y }, a); state.visited[a.id] = true; state.coin = 500;
    enterTown(); travelTo(a.id);
    const t = npcMap(), people = a.people; state.x = t.cx; state.y = t.py + 1;
    saveWorld(); const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    exitTown(); state.visited = {}; state.roads = [];
    hydrateWorld(data);
    const loaded = { zone: state.zone, visiting: state.visiting, onTown: map === npcMap().grid, pos: [state.x, state.y], expected: [t.cx, t.py + 1], people: townPeople.length, visited: Object.keys(state.visited).sort(), roads: state.roads.length > 0, expectedPeople: Math.min(26, Math.max(2, people)) };
    const old = JSON.parse(JSON.stringify(data)); for (const k of ['visited', 'roads', 'visiting']) delete old.state[k];
    state.visited = { stale: true }; state.roads = [1, 2, 3]; state.visiting = a.id;
    hydrateWorld(old);
    const defaults = { visited: Object.keys(state.visited), roads: state.roads.length, visiting: state.visiting };
    // a save that points at a settlement that does not exist falls back to Brackenford
    const lost = JSON.parse(JSON.stringify(data)); lost.state.visiting = 'nowhere';
    hydrateWorld(lost);
    return { loaded, defaults, lost: { zone: state.zone, visiting: state.visiting, onBrackenford: map === getTownMap() } };
  });
  assert.equal(r.loaded.zone, 'town'); assert.notEqual(r.loaded.visiting, null); assert.equal(r.loaded.onTown, true); assert.deepEqual(r.loaded.pos, r.loaded.expected);
  assert.equal(r.loaded.people, r.loaded.expectedPeople); assert.equal(r.loaded.roads, true); assert.equal(r.loaded.visited.length, 1);
  assert.deepEqual(r.defaults, { visited: [], roads: 0, visiting: null }); assert.deepEqual(r.lost, { zone: 'town', visiting: null, onBrackenford: true });
}));

test('the market, mine, jeweler, hunters’ lodge, blacksmith, well and caravan post can be used from their marks on the overworld', () => game(async page => {
  const r = await page.evaluate(() => {
    Object.assign(state.inv, { wood: 9999, stone: 9999, iron: 999, furs: 999, silver: 999, gold: 999, gems: 999 }); state.unlocked = { smithy: true, huntersLodge: true, jeweler: true }; state.town.people = 40;
    const keys = ['market', 'mine', 'jeweler', 'huntersLodge', 'smithy', 'well', 'caravanPost', 'garden', 'lumberMill'];
    for (const k of keys) build(k);
    const out = {};
    for (const k of keys) {
      const mark = BUILDING_MARKS.find(b => b.key === k);
      state.x = HOME.x + mark.dx; state.y = HOME.y + mark.dy; closeDialog(); render();
      const button = document.getElementById('actions').textContent.includes('Use the ');
      interact();
      out[k] = [dialogOpen(), button, dialogOpen() ? dialogText().slice(0, 30) : ''];
      closeDialog();
    }
    return out;
  });
  for (const k of ['market', 'mine', 'jeweler', 'huntersLodge', 'smithy', 'well', 'caravanPost']) assert.deepEqual(r[k].slice(0, 2), [true, true], k + ' ' + JSON.stringify(r[k]));
  assert.ok(r.market[2].includes('Market') && r.mine[2].includes('Mine') && r.well[2].includes('Well') && r.caravanPost[2].includes('Caravan post'), JSON.stringify(r));
  assert.deepEqual(r.garden.slice(0, 2), [false, false]); assert.deepEqual(r.lumberMill.slice(0, 2), [false, false]);   // those stay inside the settlement
}));

test('bigger settlements have more to use: every one a well, then a lodge, a smithy, a jeweler and a mine', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = discover(1)[0], out = {}, problems = [];
    for (const people of [3, 6, 9, 12, 15]) {
      s.people = people; npcCurrent = null; state.visiting = s.id; state.zone = 'town';
      const t = npcMap(); map = t.grid; state.x = t.start[0]; state.y = t.start[1];
      const reach = townReach(state.x, state.y), kinds = Object.values(t.plots).map(p => p.kind);
      out[people] = ['well', 'huntersLodge', 'smithy', 'jeweler', 'mine', 'market', 'inn', 'travel', 'hall'].filter(k => kinds.includes(k));
      for (const [k, p] of Object.entries(t.plots)) if (!reach.has(p.front[0] + ',' + p.front[1])) problems.push(people + ':' + p.kind + ' unreachable');
    }
    return { out, problems };
  });
  assert.deepEqual(r.problems, []);
  const core = ['market', 'inn', 'travel', 'hall'];
  assert.deepEqual(r.out[3], ['well', ...core].sort((a, b) => ['well', 'market', 'inn', 'travel', 'hall'].indexOf(a) - ['well', 'market', 'inn', 'travel', 'hall'].indexOf(b)));
  assert.deepEqual(r.out[6], ['well', 'huntersLodge', ...core]);
  assert.deepEqual(r.out[9], ['well', 'huntersLodge', 'smithy', ...core]);
  assert.deepEqual(r.out[12], ['well', 'huntersLodge', 'smithy', 'jeweler', 'mine', ...core]);
  assert.deepEqual(r.out[15], r.out[12]);
}));

test('inside another settlement: the lodge, mine and jeweler trade their goods, the smith sells gear, and the well heals once a day', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = discover(1)[0]; s.people = 13; state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog();
    const door = kind => { const [k, p] = Object.entries(npcMap().plots).find(([, q]) => q.kind === kind); return k; };
    state.coin = 300; state.inv.furs = 0; state.hp = 1; state.maxHp = 5;
    npcBuilding(door('huntersLodge')); const lodge = dialogText(); npcShopAction(s.id, 'huntersLodge', 'buy', 'furs'); const furs = state.inv.furs;
    npcShopAction(s.id, 'huntersLodge', 'sell', 'furs'); const sold = state.inv.furs;
    npcShopAction(s.id, 'huntersLodge', 'buy', 'gems'); const wrongGood = state.inv.gems;     // a lodge does not deal in gems
    closeDialog(); npcBuilding(door('jeweler')); const jewel = dialogText();
    closeDialog(); npcBuilding(door('mine')); const mine = dialogText();
    closeDialog(); npcBuilding(door('smithy')); const smithy = dialogText();
    const top = smithTier(s), coin0 = state.coin; buyGear(s.id, 'weapon', 2); const weapon = [state.equipped.weapon.name, coin0 - state.coin];
    buyGear(s.id, 'weapon', 1); const noDowngrade = state.equipped.weapon.name;
    buyGear(s.id, 'armor', 4); const maxHp = state.maxHp;
    closeDialog(); npcBuilding(door('well')); state.hp = 1; drinkNpcWell(s.id); const hp1 = state.hp; state.hp = 1; drinkNpcWell(s.id); const hp2 = state.hp;
    state.day++; drinkNpcWell(s.id); const hp3 = state.hp;
    return { lodge, furs, sold, wrongGood, jewel, mine, smithy, top, weapon, noDowngrade, maxHp, hp: [hp1, hp2, hp3], price: gearPrice(s, 2) };
  });
  assert.ok(r.lodge.includes('Hunters’ lodge') && r.lodge.includes('Buy Furs'), r.lodge); assert.equal(r.furs, 1); assert.equal(r.sold, 0); assert.equal(r.wrongGood, 0);
  assert.ok(r.jewel.includes('Gems') && r.jewel.includes('Silver') && r.jewel.includes('Gold'), r.jewel);
  assert.ok(r.mine.includes('Copper') && r.mine.includes('Iron') && r.mine.includes('Stone'), r.mine);
  assert.ok(r.smithy.includes('Hunter’s spear') && r.smithy.includes('Moonsteel blade') && r.smithy.includes('Warden’s plate') && r.top === 4, r.smithy);
  assert.deepEqual(r.weapon, ['Hunter’s spear', r.price]); assert.equal(r.noDowngrade, 'Hunter’s spear'); assert.equal(r.maxHp, 5 + 4);
  assert.deepEqual(r.hp, [3, 1, 3]);        // +2 hearts; no second drink the same day; the next day it works again
}));
