// Browser-driven tests for soldiers on the march, wars of conquest, raids and rivalries between settlements.
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
      Object.assign(state.inv, { wood: 9999, stone: 9999, iron: 999, furs: 999, silver: 999, gold: 999, gems: 999, copper: 999, berries: 20 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40;
    };
    // Plain grass in a rectangle, so a test never depends on the random world.
    window.clearRect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (overworld[y] && overworld[y][x] !== undefined && !'SCDKM⌂'.includes(overworld[y][x])) overworld[y][x] = '.'; };
    // An army: a barracks with n soldiers, and the player standing on open ground away from home.
    window.army = (n, at = 20) => {
      RICH(); build('barracks'); state.town.people = n + 2;
      for (let i = 0; i < 60 && crew('barracks') < n; i++) assignWorker('barracks', 1);
      syncSoldiers();
      state.x = HOME.x + at; state.y = HOME.y; clearRect(HOME.x - 5, HOME.y - 15, HOME.x + at + 45, HOME.y + 15);
    };
    window.target = (i = 0) => { const s = settlements[i]; s.discovered = true; clearRect(s.x - 9, s.y - 9, s.x + 9, s.y + 9); overworld[s.y][s.x] = 'S'; return s; };
    window.foeBox = () => [...enemyBucket(overworld)].map(([k, e]) => ({ k, e, x: +k.split(',')[0], y: +k.split(',')[1] })).filter(f => overworld[f.y][f.x] === 'g');
    window.dialogText = () => document.getElementById('dialog').textContent;
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('settlements get a size and a randomized temper, and their tempers drift but stay in range', () => game(async page => {
  const r = await page.evaluate(() => {
    ensureWarWorld();
    const start = settlements.map(s => s.aggression), sizes = settlements.map(s => s.people);
    state.day = 3;
    for (let i = 0; i < 200; i++) worldTurn();
    return { n: settlements.length, start, sizes, end: settlements.map(s => s.aggression), peopleOk: settlements.every(s => s.people >= 2 && s.people <= s.cap + 3), owners: settlements.every(s => 'owner' in s) };
  });
  assert.ok(r.n >= 10);
  assert.ok(r.start.every(a => a >= 0 && a <= 0.5) && new Set(r.start).size > 3, JSON.stringify(r.start));
  assert.ok(r.sizes.every(p => p >= 3 && p <= 7));
  assert.ok(r.end.every(a => a >= 0 && a <= 0.6)); assert.equal(r.peopleOk, true); assert.equal(r.owners, true);
}));

test('marching soldiers follow you across the map, keep up and are not left behind', () => game(async page => {
  const r = await page.evaluate(() => {
    army(6); setEscort(3);
    const flagged = state.soldiers.filter(g => g.escort).length;
    moveEscort(); const gathered = escorts().map(g => Math.abs(g.x - state.x) + Math.abs(g.y - state.y));
    for (let i = 0; i < 40; i++) { state.x++; moveEscort(); moveEscort(); moveSoldiers(); }
    const folks = escorts(), dist = folks.map(g => Math.abs(g.x - state.x) + Math.abs(g.y - state.y)), cells = new Set(folks.map(g => g.x + ',' + g.y));
    const patrol = state.soldiers.filter(g => !g.escort);
    return { flagged, gathered, dist, distinct: cells.size, onPlayer: folks.some(g => g.x === state.x && g.y === state.y), patrol: patrol.length, patrolNear: patrol.every(g => Math.abs(g.x - HOME.x) + Math.abs(g.y - HOME.y) <= 11 + 2) };
  });
  assert.equal(r.flagged, 3); assert.ok(r.gathered.every(d => d <= 12), JSON.stringify(r.gathered));
  assert.equal(r.dist.length, 3); assert.ok(r.dist.every(d => d <= 8), JSON.stringify(r.dist)); assert.equal(r.distinct, 3); assert.equal(r.onPlayer, false);
  assert.equal(r.patrol, 3); assert.equal(r.patrolNear, true);
}));

test('any number of soldiers can march, up to everyone in the barracks', () => game(async page => {
  const r = await page.evaluate(() => {
    army(9); setEscort(99); const all = [state.escort, state.soldiers.filter(g => g.escort).length];
    setEscort(1); const one = state.soldiers.filter(g => g.escort).length;
    setEscort(0); const none = state.soldiers.filter(g => g.escort).length;
    setEscort(4); assignWorker('barracks', -1); assignWorker('barracks', -1); syncSoldiers();
    return { all, one, none, shrunk: [soldierCount(), state.soldiers.length, state.soldiers.filter(g => g.escort).length] };
  });
  assert.deepEqual(r.all, [9, 9]); assert.equal(r.one, 1); assert.equal(r.none, 0); assert.deepEqual(r.shrunk, [7, 7, 4]);
}));

test('marching soldiers attack enemies near them', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3); setEscort(2); moveEscort();
    const g = escorts()[0]; let x = g.x + 1, y = g.y;
    overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.boar, hp: 8 });
    moveEscort();
    const foe = enemyBucket(overworld).get(x + ',' + y);
    return { hurt: foe.curHp < foe.maxHp, curHp: foe.curHp, maxHp: foe.maxHp };
  });
  assert.equal(r.hurt, true, JSON.stringify(r));
}));

test('marching soldiers fight beside you in battle, and the foe may turn on them instead of you', () => game(async page => {
  const r = await page.evaluate(() => {
    const run = (escort) => {
      army(4); setEscort(escort); moveEscort();
      const ex = state.x + 1, ey = state.y; clearRect(ex, ey, ex, ey);
      overworld[ey][ex] = 'g'; enemyBucket(overworld).set(ex + ',' + ey, { ...enemyCatalog.boar, hp: 8 });
      const real = Math.random; Math.random = () => 0.5;
      try {
        startCombat(ex, ey, state.x, state.y);
        const hp0 = state.combat.hp, mine = state.hp, soldiers = state.soldiers.map(g => g.hp);
        battleAction('attack');
        const out = { dealt: hp0 - state.combat.hp, myLoss: mine - state.hp, soldierHurt: state.soldiers.some((g, i) => g.hp < (soldiers[i] ?? 99)) };
        state.combat = null; closeDialog();
        return out;
      } finally { Math.random = real; }
    };
    return { alone: run(0), marching: run(3) };
  });
  assert.equal(r.alone.dealt, 3); assert.equal(r.alone.myLoss, 1); assert.equal(r.alone.soldierHurt, false);
  assert.equal(r.marching.dealt, 3 + 3 * 2); assert.equal(r.marching.myLoss, 0); assert.equal(r.marching.soldierHurt, true);
}));

test('a soldier who falls in battle is replaced for 2 meals, and the marching order stays', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3); setEscort(3); moveEscort(); state.town.food = 6;
    const ex = state.x + 1, ey = state.y; clearRect(ex, ey, ex, ey);
    overworld[ey][ex] = 'g'; enemyBucket(overworld).set(ex + ',' + ey, { ...enemyCatalog.boar, hp: 40 });
    const real = Math.random; Math.random = () => 0.5;
    try {
      startCombat(ex, ey, state.x, state.y);
      for (const g of state.soldiers) g.hp = 1;
      battleAction('guard');                                   // the foe picks a soldier (0.5 < 3/4)
    } finally { Math.random = real; }
    state.combat = null; closeDialog();
    return { food: state.town.food, soldiers: state.soldiers.length, escort: state.escort, debt: state.soldierDebt || 0 };
  });
  assert.equal(r.food, 4); assert.equal(r.soldiers, 3); assert.equal(r.escort, 3); assert.equal(r.debt, 0);
}));

test('sending the escort home puts the soldiers back at the barracks', () => game(async page => {
  const r = await page.evaluate(() => {
    army(4); setEscort(3); moveEscort(); render();
    const button = document.getElementById('actions').textContent.includes('send them home');
    dismissEscort();
    return { button, escort: state.escort, flagged: state.soldiers.filter(g => g.escort).length, count: state.soldiers.length, home: state.soldiers.every(g => Math.max(Math.abs(g.x - HOME.x), Math.abs(g.y - HOME.y)) <= 8), after: document.getElementById('actions').textContent.includes('send them home') };
  });
  assert.equal(r.button, true); assert.equal(r.escort, 0); assert.equal(r.flagged, 0); assert.equal(r.count, 4); assert.equal(r.home, true); assert.equal(r.after, false);
}));

test('calling every citizen to arms fills the barracks, and standing down restores the old jobs', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); build('barracks'); build('lumberMill'); build('garden'); state.town.people = 7;
    assignWorker('lumberMill', 1); assignWorker('garden', 1); assignWorker('barracks', 1);
    const before = { lumber: crew('lumberMill'), garden: crew('garden'), barracks: crew('barracks') };
    callToArms(); syncSoldiers();
    const armed = { lumber: crew('lumberMill'), garden: crew('garden'), barracks: crew('barracks'), free: unassigned(), soldiers: state.soldiers.length, people: townPeople.filter(p => p.job === 'barracks').length };
    standDown();
    return { before, armed, after: { lumber: crew('lumberMill'), garden: crew('garden'), barracks: crew('barracks') }, backup: state.assignBackup };
  });
  assert.deepEqual(r.armed, { lumber: 0, garden: 0, barracks: 7, free: 0, soldiers: 7, people: 7 });
  assert.deepEqual(r.after, r.before); assert.equal(r.backup, null);
}));

test('declaring war needs a known settlement and a barracks, and fills the field with defenders and fortified houses', () => game(async page => {
  const r = await page.evaluate(() => {
    ensureWarWorld(); const s = target(0); s.discovered = false;
    const unknown = declareWar(s.id); s.discovered = true;
    const noBarracks = declareWar(s.id);
    army(3, 10);
    const ok = declareWar(s.id), again = declareWar(s.id);
    const foes = foeBox().filter(f => f.e.townId === s.id), w = state.wars[s.id];
    return { unknown, noBarracks, ok, again, count: foes.length, total: w.total, left: w.left, guardsLeft: w.guards, holdsLeft: w.holds, size: w.size, people: s.people, captains: foes.filter(f => f.e.name === 'Town Captain').length, guards: foes.filter(f => f.e.name === 'Town Guard').length, houses: foes.filter(f => f.e.building).length, near: foes.every(f => Math.hypot(f.x - s.x, f.y - s.y) <= 5.6), leashed: foes.filter(f => !f.e.building).every(f => f.e.leash && f.e.leash.x === s.x && f.e.faction === 'war'), hostile: !!state.hostile[s.id], bracket: townBracket(Math.max(2, s.people)) };
  });
  assert.equal(r.unknown, false); assert.equal(r.noBarracks, false); assert.equal(r.ok, true); assert.equal(r.again, false);
  assert.equal(r.count, r.total); assert.equal(r.left, r.total); assert.equal(r.total, r.guardsLeft + r.holdsLeft);
  assert.ok(r.guardsLeft >= r.size - 1 && r.guardsLeft <= r.size); assert.equal(r.holdsLeft, 2 + r.bracket); assert.equal(r.houses, r.holdsLeft);
  assert.equal(r.captains, 1); assert.equal(r.guards, r.guardsLeft - 1); assert.equal(r.near, true); assert.equal(r.leashed, true); assert.equal(r.hostile, true);
}));

test('defenders keep to their town, but chase you when you get close', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); const s = target(0); declareWar(s.id);
    state.x = s.x + 30; state.y = s.y; clearRect(state.x - 14, state.y - 14, state.x + 14, state.y + 14);
    const far = [];
    for (let i = 0; i < 80; i++) { moveEnemies(); }
    for (const f of foeBox().filter(f => f.e.townId === s.id)) far.push(Math.hypot(f.x - s.x, f.y - s.y));
    return { far: Math.max(...far), count: far.length, total: state.wars[s.id].total };
  });
  assert.ok(r.far <= 7.01, 'a defender left its town: ' + r.far); assert.equal(r.count, r.total);
}));

test('merchants shut their gates while you are at war', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); const s = target(0); state.x = s.x; state.y = s.y;
    trade(s.id); const peace = dialogText(); closeDialog();
    declareWar(s.id); trade(s.id);
    return { peace, war: dialogText() };
  });
  assert.ok(r.peace.includes('Declare war') && r.peace.includes('Buy'), r.peace);
  assert.ok(r.war.includes('at war') && r.war.includes('defenders') && !r.war.includes('Buy'), r.war);
}));

test('a siege: every defender and building must fall, the gates stay shut until then, and walking in claims the settlement', () => game(async page => {
  const r = await page.evaluate(() => {
    army(4, 10); build('hut'); const s = target(0); const before = { coin: state.coin, size: s.people };
    declareWar(s.id);
    const foes = foeBox().filter(f => f.e.townId === s.id), houses = foes.filter(f => f.e.building), guards = foes.filter(f => !f.e.building);
    // the gates are shut, and houses neither walk nor ambush
    state.x = s.x; state.y = s.y; closeDialog(); enterSettlement(s.id); const shut = { zone: state.zone, dialog: dialogText().includes('gates are shut') }; closeDialog();
    const spots = houses.map(h => h.k).sort().join(); state.x = HOME.x + 10; state.y = HOME.y;
    for (let i = 0; i < 8; i++) moveEnemies(); const still = foeBox().filter(f => f.e.building).map(f => f.k).sort().join() === spots;
    // a house is fought by walking into it, in the ordinary battle
    const taken = new Set(foes.map(f => f.k)); let pick = null;       // an approach tile with no other foe beside it, so only the house is in play
    for (const h of houses) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const sx = h.x + dx, sy = h.y + dy;
      if (pick || taken.has(sx + ',' + sy)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => (sx + a !== h.x || sy + b !== h.y) && taken.has((sx + a) + ',' + (sy + b)))) continue;
      pick = { h, sx, sy, dx: -dx, dy: -dy };
    }
    const h0 = pick.h; state.x = pick.sx; state.y = pick.sy; clearRect(state.x, state.y, state.x, state.y); enemyContact(); const noAmbush = !state.combat;
    move(pick.dx, pick.dy); const fighting = !!state.combat && state.combat.enemy.building; const panel = dialogText(); state.combat.hp = 1; battleAction('attack');
    const afterHouse = { holds: state.wars[s.id].holds, guards: state.wars[s.id].guards, left: state.wars[s.id].left };
    // the rest through the same bookkeeping soldiers and fights use
    const rest = foes.filter(f => f !== h0); const last = rest.pop();
    for (const f of rest) { removeEnemyData(overworld, f.x, f.y); overworld[f.y][f.x] = '.'; noteKill(f.e); }
    const open = { cleared: state.wars[s.id].cleared, left: state.wars[s.id].left, people: s.people, owner: s.owner };
    removeEnemyData(overworld, last.x, last.y); overworld[last.y][last.x] = '.'; noteKill(last.e);
    const cleared = { cleared: state.wars[s.id].cleared, left: state.wars[s.id].left, people: s.people, owner: s.owner, log: state.log[0].t };
    state.x = s.x; state.y = s.y; closeDialog(); interact();
    return { total: foes.length, houses: houses.length, guards: guards.length, shut, still, noAmbush, fighting, panel, afterHouse, open, cleared, claimed: { owner: s.owner, people: s.people, cur: state.cur, colony: isColony(s.id), war: state.wars[s.id], hostile: state.hostile[s.id], zone: state.zone, visiting: state.visiting, coin: state.coin - before.coin, annexed: annexedCount() }, before };
  });
  assert.deepEqual(r.shut, { zone: 'overworld', dialog: true }); assert.equal(r.still, true); assert.equal(r.noAmbush, true); assert.equal(r.fighting, true); assert.ok(r.panel.includes('Barricaded House'), r.panel);
  assert.deepEqual(r.afterHouse, { holds: r.houses - 1, guards: r.guards, left: r.total - 1 });
  assert.equal(r.open.cleared, false); assert.equal(r.open.left, 1); assert.equal(r.open.owner, null);
  assert.equal(r.cleared.cleared, true); assert.equal(r.cleared.left, 0); assert.equal(r.cleared.people, 0); assert.equal(r.cleared.owner, null); assert.ok(r.cleared.log.includes('Walk into'), r.cleared.log);
  assert.equal(r.claimed.owner, 'player'); assert.equal(r.claimed.people, 2); assert.equal(r.claimed.war, undefined); assert.equal(r.claimed.hostile, undefined); assert.equal(r.claimed.zone, 'town'); assert.equal(r.claimed.annexed, 1); assert.equal(r.claimed.colony, true); assert.ok(r.claimed.cur, 'you are inside it, running it');
  assert.ok(r.claimed.coin >= 20 + r.before.size * 3, JSON.stringify(r.claimed));
}));

test('an annexed settlement cannot be attacked again, and it stays out of raids and rivalries', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); const s = target(0); s.owner = 'player';
    const again = declareWar(s.id);
    state.day = 20; state.built.hut = true; for (const t of settlements) t.aggression = 0.6;
    const real = Math.random; Math.random = () => 0.001;
    try { for (let i = 0; i < 30; i++) worldTurn(); } finally { Math.random = real; }
    return { again, owner: s.owner, people: s.people, aggression: s.aggression, raiders: state.raid ? state.raid.from : null };
  });
  assert.equal(r.again, false); assert.equal(r.owner, 'player'); assert.notEqual(r.raiders, 'town_0');
}));

test('making peace costs coin, sends the defenders home and leaves a grudge', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); const s = target(0); s.aggression = 0.1; declareWar(s.id);
    const cost = peaceCost(s.id), coin = state.coin, left = state.wars[s.id].left;
    state.coin = cost - 1; sueForPeace(s.id); const refused = !!state.wars[s.id];
    state.coin = coin; sueForPeace(s.id);
    return { cost, left, refused, paid: coin - state.coin, war: state.wars[s.id], foes: warFoes(s.id).length, aggression: s.aggression, owner: s.owner };
  });
  assert.equal(r.cost, 6 + 4 * r.left); assert.equal(r.refused, true); assert.equal(r.paid, r.cost);
  assert.equal(r.war, undefined); assert.equal(r.foes, 0); assert.ok(r.aggression > 0.1); assert.equal(r.owner, null);
}));

test('raiders march on Brackenford, reach it and make off with coin and meals', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); const s = settlements[0];
    clearRect(HOME.x + 3, HOME.y - 3, HOME.x + 16, HOME.y + 3);
    state.x = HOME.x - 30; state.y = HOME.y; clearRect(state.x - 14, state.y - 14, state.x + 14, state.y + 14);
    const rx = HOME.x + 12, ry = HOME.y; overworld[ry][rx] = 'g';
    enemyBucket(overworld).set(rx + ',' + ry, { ...WAR_FOES.raider, faction: 'raid', raid: true, townId: s.id });
    state.raid = { from: s.id, name: s.name, left: 1, total: 1, deadline: state.day + 2, looted: 0 };
    state.coin = 40; state.town.food = 10; state.town.people = 2;
    for (let i = 0; i < 14; i++) moveEnemies();
    return { raid: state.raid, coin: state.coin, food: state.town.food, raiders: foeBox().filter(f => f.e.raid).length, log: state.log.map(l => l.t).join(' ') };
  });
  assert.equal(r.raid, null); assert.equal(r.coin, 33); assert.equal(r.food, 8); assert.equal(r.raiders, 0); assert.ok(r.log.includes('makes off with'), r.log);
}));

test('a raid begins with a warning, and unstopped raiders loot the town when time runs out', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); const s = settlements[0]; s.aggression = 0.4;
    const started = startRaid(s), raid = { ...state.raid }, foes = foeBox().filter(f => f.e.raid);
    const far = foes.every(f => Math.hypot(f.x - HOME.x, f.y - HOME.y) >= 12);
    const warned = state.log.some(l => l.t.includes('Raiders from ' + s.name) && l.cls === 'alert');
    const second = startRaid(s);
    state.coin = 100; state.town.food = 30; advanceDay(); const afterOne = !!state.raid; advanceDay();
    return { started, second, raid, count: foes.length, far, warned, afterOne, after: state.raid, left: foeBox().filter(f => f.e.raid).length, coin: state.coin };
  });
  assert.equal(r.started, true); assert.equal(r.second, false); assert.equal(r.count, r.raid.total); assert.equal(r.raid.left, r.raid.total);
  assert.equal(r.far, true); assert.equal(r.warned, true); assert.equal(r.afterOne, true); assert.equal(r.after, null); assert.equal(r.left, 0);
  assert.ok(r.coin < 100, 'the raiders took nothing: ' + r.coin);
}));

test('driving off every raider ends the raid with a reward and a chastened raider town', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); const s = settlements[0]; s.aggression = 0.4;
    startRaid(s); const total = state.raid.total, coin = state.coin;
    for (const f of foeBox().filter(f => f.e.raid)) { removeEnemyData(overworld, f.x, f.y); overworld[f.y][f.x] = '.'; noteKill(f.e); }
    return { total, raid: state.raid, gain: state.coin - coin, aggression: s.aggression };
  });
  assert.equal(r.raid, null); assert.equal(r.gain, 5 * r.total); assert.ok(r.aggression < 0.4);
}));

test('natural enemy spawning does not count war armies and raiders against its cap', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); const natural = () => foeBox().filter(f => !f.e.faction).length;
    clearRect(5, 5, 60, 40);
    for (let i = 0; i < OW_CAP + 5; i++) { const x = 6 + (i % 50), y = 6 + Math.floor(i / 50) * 2; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...WAR_FOES.raider, faction: 'raid', raid: true, townId: 'town_0' }); }
    const before = natural(); spawnEnemy();
    return { before, after: natural() };
  });
  assert.equal(r.after, r.before + 1);
}));

test('settlements go to war: citizens die and buildings burn, nobody is annexed, and the loser starts again with two citizens and nothing built', () => game(async page => {
  const r = await page.evaluate(() => {
    const [a, b] = [settlements[0], settlements[1]]; ensureWarWorld(); state.day = 10;
    for (const s of settlements) { s.owner = null; s.stock = {}; }
    a.people = 12; a.aggression = .5; b.people = 3; a.surplus = ['wood', 'iron']; b.surplus = ['gems', 'gold']; b.stock = { gems: 30, gold: 20 };
    const w = startNpcWar(a, b); const listed = state.npcWars.length;
    const real = Math.random; Math.random = () => 0.9;
    let days = 0; try { while (state.npcWars.includes(w) && days < 20) { state.day++; npcWarTurn(); days++; } } finally { Math.random = real; }
    const plots = Object.keys(buildNpcTown(b).plots).length;
    // before day 7 the world starts no new wars, so only the rebuilding is measured
    state.day = 5; const regrown = []; for (let i = 0; i < 30; i++) { worldTurn(); regrown.push(Object.keys(buildNpcTown(b).plots).length); }
    return { listed, over: !state.npcWars.includes(w), days, a: [a.people, a.owner], b: [b.people, b.owner, b.wreck], plots, loot: { gems: a.stock.gems, gold: a.stock.gold }, emptied: Object.keys(b.stock).length, regrown, news: state.log.some(l => l.t.includes('has won the war')) };
  });
  assert.equal(r.listed, 1); assert.equal(r.over, true); assert.ok(r.days >= 1 && r.days <= 8, 'days ' + r.days);
  assert.ok(r.a[0] >= 8 && r.a[1] === null); assert.equal(r.b[0] >= 2, true); assert.equal(r.b[1], null);
  assert.equal(r.plots, 0, 'every building of the loser is gone'); assert.equal(r.loot.gems >= 30 && r.loot.gold >= 20, true);
  assert.ok(r.regrown[r.regrown.length - 1] > 0 && r.regrown.every((n, i) => i === 0 || n >= r.regrown[i - 1]), JSON.stringify(r.regrown));
}));

test('days of random raids and rivalries keep the world consistent', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('hut'); ensureWarWorld();
    for (const s of settlements) s.aggression = 0.6;
    state.day = 10; const bad = [];
    for (let i = 0; i < 300; i++) {
      worldTurn();
      const raiders = foeBox().filter(f => f.e.raid).length;
      if (state.raid ? raiders !== state.raid.left : raiders !== 0) bad.push('raid ' + i + ': ' + raiders + ' vs ' + (state.raid ? state.raid.left : 'none'));
      for (const s of settlements) { if (s.people < 1 || s.people > s.cap + 3) bad.push(s.id + ' people ' + s.people); if (s.aggression < 0 || s.aggression > 0.6) bad.push(s.id + ' temper'); if (s.owner && s.owner !== 'player' && !settlements.some(t => t.id === s.owner)) bad.push('owner'); }
      if (bad.length) break;
    }
    return { bad, ruled: settlements.filter(s => s.owner).length, wars: state.npcWars.length };
  });
  assert.deepEqual(r.bad, []);
}));

test('wars, raids, marching orders and settlement tempers survive saving; old saves get defaults', () => game(async page => {
  const r = await page.evaluate(() => {
    army(4, 10); build('hut'); const s = target(0), t = settlements[1]; declareWar(s.id); setEscort(2); startRaid(t); s.people = 6; s.aggression = 0.33;
    const raid = { ...state.raid }, war = { ...state.wars[s.id] }, foes = foeBox().length;
    const data = JSON.parse(JSON.stringify(buildSaveData()));
    state.wars = {}; state.raid = null; state.escort = 0; s.people = 99;
    hydrateWorld(data);
    const same = { war: state.wars[s.id], raid: state.raid, escort: state.escort, people: settlements[0].people, aggression: settlements[0].aggression, foes: foeBox().length, faction: foeBox().filter(f => f.e.faction === 'war').every(f => f.e.townId === s.id && (f.e.leash || f.e.building)) };
    // a save from before wars existed
    const old = JSON.parse(JSON.stringify(data));
    for (const k of ['wars', 'raid', 'escort', 'assignBackup']) delete old.state[k];
    for (const x of old.settlements) { delete x.people; delete x.aggression; delete x.owner; delete x.cap; }
    state.wars = { stale: { total: 1, left: 1 } }; state.raid = { from: 'x', name: 'X', left: 1, total: 1, deadline: 9, looted: 0 }; state.escort = 5;
    hydrateWorld(old);
    return { raid, war, foes, same, old: { wars: state.wars, raid: state.raid, escort: state.escort, filled: settlements.every(x => Number.isFinite(x.people) && Number.isFinite(x.aggression) && x.owner === null && x.cap === x.people) } };
  });
  assert.deepEqual(r.same.war, r.war); assert.deepEqual(r.same.raid, r.raid); assert.equal(r.same.escort, 2);
  assert.equal(r.same.people, 6); assert.equal(r.same.aggression, 0.33); assert.equal(r.same.foes, r.foes); assert.equal(r.same.faction, true);
  assert.deepEqual(r.old, { wars: {}, raid: null, escort: 0, filled: true });
}));

test('the war council and the barracks offer marching orders, war and peace from their dialogs', () => game(async page => {
  const r = await page.evaluate(() => {
    army(4, 10); build('hut'); const s = target(0);
    openBuilding('barracks'); const barracks = dialogText();
    setEscort(2, 'barracks'); const marching = dialogText();
    openBuilding('hut'); const hall = dialogText();
    warCouncil(); const council = dialogText();
    [...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Declare war').click();
    const declared = !!state.wars[s.id], after = dialogText();
    return { barracks, marching, hall, council, declared, after, name: s.name };
  });
  assert.ok(r.barracks.includes('Marching order') && r.barracks.includes('War council'), r.barracks);
  assert.ok(r.marching.includes('2 of 4 soldiers'), r.marching);
  assert.ok(r.hall.includes('War council'), r.hall);
  assert.ok(r.council.includes(r.name) && r.council.includes('Declare war') && r.council.includes('Call every citizen to arms'), r.council);
  assert.equal(r.declared, true); assert.ok(r.after.includes('Peace'), r.after);
}));

test('both renderers draw war defenders, raiders and marching soldiers', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); setEscort(2); moveEscort(); const s = target(0); declareWar(s.id);
    state.x = s.x + 3; state.y = s.y + 3; clearRect(state.x, state.y, state.x, state.y); moveEscort();
    useGfx = true; render(); const gfx = !!document.getElementById('view').width;
    useGfx = false; render(); const text = document.getElementById('map').textContent;
    useGfx = true; render();
    return { gfx, mob: text.includes('g'), soldier: text.includes('s') };
  });
  assert.equal(r.gfx, true); assert.equal(r.mob, true);
}));

test('the world map lists size, temper and war status', () => game(async page => {
  const r = await page.evaluate(() => {
    army(3, 10); const s = target(0); s.aggression = 0.5; state.x = HOME.x; state.y = HOME.y; openMap(); const calm = document.getElementById('dialog').textContent;
    declareWar(s.id); openMap(); const war = document.getElementById('dialog').textContent; s.owner = 'player'; delete state.wars[s.id]; openMap();
    return { calm, war, annexed: document.getElementById('dialog').textContent, name: s.name, canvas: !!document.getElementById('worldmap') };
  });
  assert.ok(r.calm.includes(r.name) && r.calm.includes('citizens') && r.calm.includes('hostile'), r.calm);
  assert.ok(r.war.includes('at war'), r.war); assert.ok(r.annexed.includes('annexed by Brackenford'), r.annexed); assert.equal(r.canvas, true);
}));
