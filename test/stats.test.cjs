// Browser-driven tests for stats, numeric HP, gear slots, charm and the blacksmith's tiers.
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
      Object.assign(state.inv, { wood: 140, stone: 140, iron: 140, furs: 140, silver: 140, gold: 140, gems: 140, copper: 140, berries: 40 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40;
    };
    window.discover = n => { const out = []; for (let i = 0; i < n; i++) { settlements[i].discovered = true; out.push(settlements[i]); } return out; };
    window.homeReady = () => { RICH(); build('hut'); build('longhouse'); build('caravanPost'); };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('you start with HP numbers and four stats, not hearts', () => game(async page => {
  const r = await page.evaluate(() => ({
    hud: document.getElementById('hearts').textContent, stats: statTotals(), hp: [state.hp, state.maxHp], slots: GEAR_SLOTS.map(s => state.equipped[s] && state.equipped[s].name),
    points: state.statPoints, pill: document.getElementById('points-pill').style.display
  }));
  assert.equal(r.hud, '12/12'); assert.deepEqual(r.stats, { charm: 2, health: 3, attack: 3, defense: 2 }); assert.deepEqual(r.hp, [12, 12]);
  assert.deepEqual(r.slots, ['Traveler’s knife', null, 'Travel clothes', null]); assert.equal(r.points, 0); assert.equal(r.pill, 'none');
}));

test('levelling up gives 2 points: both in one stat, or one in each of two', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    state.xp = state.nextXp; checkLevelUp(); render(); out.afterLevel = [state.level, state.statPoints, state.maxHp, state.hp, document.getElementById('points-pill').style.display];
    spendPoint('health'); spendPoint('health'); out.twoInOne = [state.stats.health, state.statPoints, state.maxHp, state.hp];
    spendPoint('attack'); out.noneLeft = [state.stats.attack, state.statPoints];
    state.xp = state.nextXp; checkLevelUp(); spendPoint('charm'); spendPoint('defense'); spendPoint('defense');
    out.split = [state.stats.charm, state.stats.defense, state.statPoints];
    spendPoint('luck'); out.bogus = state.statPoints;
    state.statPoints = 1; render(); out.hud = document.getElementById('points').textContent;
    return out;
  });
  assert.deepEqual(r.afterLevel, [2, 2, 12, 12, '']);
  assert.deepEqual(r.twoInOne, [5, 0, 20, 20]);       // two Health is +8 HP, and the extra HP arrives as HP
  assert.deepEqual(r.noneLeft, [3, 0]);
  assert.deepEqual(r.split, [3, 3, 0]);
  assert.equal(r.bogus, 0); assert.equal(r.hud, '1');
}));

test('gear adds to and subtracts from stats, and helmet, armor and leggings each have a slot', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    equipGear('weapon', GEAR_BY_ID.weapon2b); out.axe = statTotals();                  // Hand axe: +3 Attack, -1 Defense
    equipGear('helmet', GEAR_BY_ID.helmet3a); equipGear('armor', GEAR_BY_ID.armor3a); equipGear('leggings', GEAR_BY_ID.leggings3a);
    out.all = statTotals(); out.hp = [state.hp, state.maxHp];
    out.slots = GEAR_SLOTS.map(s => state.equipped[s].name);
    equipGear('weapon', GEAR_BY_ID.weapon3b); out.mace = statTotals().charm;           // War mace: -1 Charm
    out.line = gearLine(state.equipped.weapon);
    out.panel = document.getElementById('equipment').textContent; render(); out.panelAfter = document.getElementById('equipment').textContent;
    return out;
  });
  assert.deepEqual(r.axe, { charm: 2, health: 3, attack: 6, defense: 1 });
  // Iron helm +2 Defense +1 Health, Ring mail +3 Defense +2 Health, Chain chausses +2 Defense +1 Health, on top of the Hand axe
  assert.deepEqual(r.all, { charm: 2, health: 7, attack: 6, defense: 8 });
  assert.deepEqual(r.hp, [28, 28]);
  assert.deepEqual(r.slots, ['Hand axe', 'Iron helm', 'Ring mail', 'Chain chausses']);
  assert.equal(r.mace, 1); assert.equal(r.line, 'War mace · −1 Charm, +4 Attack');
  assert.ok(r.panelAfter.includes('Helmet') && r.panelAfter.includes('Leggings') && r.panelAfter.includes('War mace'), r.panelAfter);
}));

test('better gear goes on at once, the rest waits in the pack where it can be worn or sold', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    out.better = equipGear('weapon', GEAR_BY_ID.weapon3a); out.worse = equipGear('weapon', GEAR_BY_ID.weapon1a);
    out.bagAfter = state.bag.map(g => g.name);                                          // the knife you started with is not kept; the replaced piece is not either when worse is refused
    acquireGear(GEAR_BY_ID.weapon1b, 'a test'); out.packed = state.bag.map(g => g.name); out.worn = state.equipped.weapon.name;
    wearFromBag(0); out.swapped = [state.equipped.weapon.name, state.bag.map(g => g.name)];
    const coin0 = state.coin, v = gearValue(state.bag[0]); sellFromBag(0); out.sold = [state.coin - coin0, v, state.bag.length];
    takeOff('weapon'); out.off = [state.equipped.weapon.name, statTotals().attack, state.bag.map(g => g.name)];
    for (let i = 0; i < BAG_SIZE + 3; i++) acquireGear(GEAR_BY_ID.helmet1b, 'a test'); out.full = state.bag.length;
    const c = state.coin; acquireGear(GEAR_BY_ID.helmet1b, 'a test'); out.soldFull = state.coin > c;
    return out;
  });
  assert.equal(r.better, true); assert.equal(r.worse, false); assert.deepEqual(r.bagAfter, []);
  assert.deepEqual(r.packed, ['Oak club']); assert.equal(r.worn, 'Iron longsword');
  assert.deepEqual(r.swapped, ['Oak club', ['Iron longsword']]);
  assert.equal(r.sold[0], r.sold[1]); assert.equal(r.sold[2], 0);
  assert.equal(r.off[0], 'Bare hands'); assert.deepEqual(r.off[2], ['Oak club']);
  assert.equal(r.full, 12); assert.equal(r.soldFull, true);
}));

test('defense softens every blow and monsters have stats that grow with their level', () => game(async page => {
  const r = await page.evaluate(() => {
    const real = Math.random; Math.random = () => 0.5;
    try {
      const wolf = enemyCatalog.wolf, out = {};
      out.low = [mobStats(wolf, 1), mobStats(wolf, 10)];
      out.hit = [strike(5, 0), strike(5, 10), strike(5, 30)];
      out.atk = [enemyDamage(10, wolf, 0), enemyDamage(10, wolf, 10)];
      out.boss = mobStats(enemyCatalog.king, 10).health > mobStats(wolf, 10).health;
      return out;
    } finally { Math.random = real; }
  });
  assert.deepEqual(r.low[0], { health: 3, attack: 2, defense: 0, charm: 1 + 0 });
  assert.ok(r.low[1].health > r.low[0].health * 4 && r.low[1].attack > r.low[0].attack && r.low[1].defense > 0 && r.low[1].charm > 1, JSON.stringify(r.low));
  assert.equal(r.hit[0], 11); assert.equal(r.hit[1], 6); assert.ok(r.hit[2] >= 1 && r.hit[2] < r.hit[1]);       // 10 defense halves a blow; it never drops below 1
  assert.ok(r.atk[1] < r.atk[0]); assert.equal(r.boss, true);
}));

test('a battle shows your HP and the foe’s stats; intimidating scares weak monsters but never a guardian', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {};
    state.x = HOME.x + 12; state.y = HOME.y; const x = state.x + 1, y = state.y; overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.wolf });
    startCombat(x, y, state.x, state.y);
    out.hp = document.getElementById('player-hp').textContent; out.foe = document.getElementById('enemy-stats').textContent; out.chance = document.getElementById('intimidate-button').textContent;
    state.stats.charm = 12; recalcStats(); refreshBattle();
    out.high = intimidateChance(state.combat);
    const real = Math.random; Math.random = () => 0; const xp0 = state.xp;
    try { battleAction('intimidate'); } finally { Math.random = real; }
    out.fled = { combat: state.combat, tile: overworld[y][x], xp: state.xp - xp0, left: !!enemyBucket(overworld).get(x + ',' + y) };
    // a failed glare costs a turn
    overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.boar }); startCombat(x, y, state.x, state.y);
    const hp0 = state.hp; Math.random = () => 0.999; try { battleAction('intimidate'); } finally { Math.random = real; }
    out.failed = { still: !!state.combat, hurt: state.hp < hp0 }; state.combat = null; closeDialog();
    // guardians and fortified houses cannot be scared
    out.immune = [canIntimidate(enemyCatalog.king), canIntimidate({ mini: true }), canIntimidate({ building: true }), canIntimidate({ raid: true }), canIntimidate(enemyCatalog.wolf)];
    overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, { ...enemyCatalog.king }); startCombat(x, y, state.x, state.y);
    out.bossButton = document.getElementById('intimidate-button').disabled; const bossHp = state.hp; battleAction('intimidate'); out.bossIgnored = state.hp === bossHp;
    state.combat = null; closeDialog();
    return out;
  });
  assert.match(r.hp, /^HP .* 12\/12$/); assert.match(r.foe, /^Attack \d+ · Defense \d+ · Charm \d+$/); assert.match(r.chance, /^Intimidate · \d+% \(6\)$/);
  assert.ok(r.high > .5); assert.equal(r.fled.combat, null); assert.equal(r.fled.tile, '.'); assert.ok(r.fled.xp >= 1); assert.equal(r.fled.left, false);
  assert.deepEqual(r.failed, { still: true, hurt: true });
  assert.deepEqual(r.immune, [false, false, false, false, true]); assert.equal(r.bossButton, true); assert.equal(r.bossIgnored, true);
}));

test('charm lowers what you pay, raises what you are paid, and every favour counts for more', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}, s = { id: 'town_0', name: 'Test', bias: 0, surplus: [], scarce: [] };
    out.base = [regionPrice(s, 'wood', 'buy'), regionPrice(s, 'wood', 'sell'), favorGain(), charmReward(100), gearPrice(s, 3, 'weapon')];
    state.stats.charm = 12; out.rich = [regionPrice(s, 'iron', 'buy'), regionPrice(s, 'iron', 'sell'), favorGain(), charmReward(100), gearPrice(s, 3, 'weapon')];
    state.stats.charm = 0; out.poor = [regionPrice(s, 'iron', 'buy'), favorGain()];
    state.stats.charm = 2; out.plain = [regionPrice(s, 'iron', 'buy'), regionPrice(s, 'iron', 'sell')];
    state.stats.charm = 40; out.cap = [charmBuyMod(), charmSellMod()];
    return out;
  });
  assert.deepEqual(r.base, [6, 3, 1, 100, 90]);
  assert.ok(r.rich[0] < r.plain[0] && r.rich[1] > r.plain[1] && r.rich[2] === 3 && r.rich[3] === 140 && r.rich[4] < r.base[4], JSON.stringify(r));
  assert.ok(r.poor[0] > r.plain[0] && r.poor[1] === 1);
  assert.deepEqual(r.cap, [.7, 1.25]);
}));

test('quests pay more and win more trust from a charming traveler', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); const s = discover(1)[0]; state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog();
    const run = charm => {
      state.stats.charm = charm; const rel = relOf(s.id); rel.favor = 0; rel.done = 0;
      rel.quest = { type: 'gather', item: 'wood', n: 1, reward: 100, day: state.day }; state.inv.wood = 5; const c0 = state.coin;
      turnInQuest(s.id); closeDialog(); return { paid: state.coin - c0, favor: rel.favor };
    };
    return { plain: run(2), charming: run(12) };
  });
  assert.deepEqual(r.plain, { paid: 100, favor: 1 }); assert.deepEqual(r.charming, { paid: 140, favor: 3 });
}));

test('the blacksmith’s upgrades teach better tiers; the forge sells every slot', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}; state.built.smithy = true; state.inv.copper = 20; state.inv.iron = 20; state.inv.wood = 20; state.inv.furs = 20; state.inv.silver = 20; state.inv.gold = 20; state.inv.gems = 20;
    out.levels = [smithyLevel()]; openSmithy(); out.text0 = dialogText();
    state.up.smithy = [true, false, false]; out.levels.push(smithyLevel()); openSmithy(); out.text1 = dialogText();
    state.up.smithy = [true, true, true]; out.levels.push(smithyLevel()); openSmithy(); out.text3 = dialogText();
    const before = [state.inv.iron, state.inv.copper];
    craftGear('weapon5a'); out.moonsteel = [state.equipped.weapon.name, state.inv.gold, state.inv.gems, state.inv.silver];
    craftGear('helmet1a'); out.cap = state.equipped.helmet && state.equipped.helmet.name;
    state.up.smithy = [false, false, false]; craftGear('weapon5b'); out.tooFine = state.equipped.weapon.name;
    out.recipes = [recipeFor(GEAR_BY_ID.weapon1a), recipeFor(GEAR_BY_ID.armor3a), recipeFor(GEAR_BY_ID.helmet5b)];
    return out;
  });
  assert.deepEqual(r.levels, [2, 3, 5]);
  assert.ok(r.text0.includes('Hunter’s spear') && r.text0.includes('Bronze knife') && r.text0.includes('Helmets') && r.text0.includes('Leggings') && !r.text0.includes('Iron longsword'), r.text0);
  assert.ok(r.text1.includes('Iron longsword') && !r.text1.includes('Steel saber'), r.text1);
  assert.ok(r.text3.includes('Moonsteel blade') && r.text3.includes('Gem-set plate') && r.text3.includes('Gem-set circlet') && !r.text3.includes('Bronze knife'), r.text3);
  assert.deepEqual(r.moonsteel, ['Moonsteel blade', 18, 18, 18]); assert.equal(r.cap, 'Leather cap'); assert.equal(r.tooFine, 'Moonsteel blade');
  assert.deepEqual(r.recipes[0], { copper: 2, wood: 1 }); assert.ok(r.recipes[1].iron >= 3 && r.recipes[2].gems >= 1);
}));

test('chests and fallen foes give gear for every slot, better the deeper and farther you go', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}, real = Math.random, seen = { slots: new Set(), tiers: new Set() };
    try {
      for (let i = 0; i < 400; i++) {
        state.equipped = startGear(); state.bag = []; findGear('a test chest');
        const g = state.bag[0] || GEAR_SLOTS.map(s => state.equipped[s]).find(x => x && x.tier);
        if (g) { seen.slots.add(g.slot); seen.tiers.add(g.tier); }
      }
      const tier = () => { state.equipped = startGear(); state.bag = []; findGear('x'); const g = GEAR_SLOTS.map(s => state.equipped[s]).concat(state.bag).find(x => x && x.tier); return g.tier; };
      Math.random = () => 0.1; out.lucky = tier(); Math.random = () => 0.95; state.zone = 'dungeon'; out.deep = tier(); state.zone = 'overworld';
    } finally { Math.random = real; }
    out.slots = [...seen.slots].sort(); out.tiers = [...seen.tiers].sort();
    return out;
  });
  assert.deepEqual(r.slots, ['armor', 'helmet', 'leggings', 'weapon']); assert.ok(r.tiers.length >= 4 && r.tiers[0] === 1, r.tiers.join());
  assert.equal(r.lucky, 1); assert.equal(r.deep, 5);
}));

test('saves from the heart days come back with numbers, spent points and gear that still counts', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = {}, old = JSON.parse(JSON.stringify(buildSaveData()));
    for (const k of ['stats', 'statPoints', 'bag']) delete old.state[k];
    old.state.level = 5; old.state.maxHp = 7; old.state.hp = 7; old.state.lodgeBonus = false;
    old.state.equipped = { weapon: { name: 'Iron longsword', damage: 3 }, armor: { name: 'Ring mail', health: 3 } };
    hydrateWorld(old);
    out.stats = statTotals(); out.hp = [state.hp, state.maxHp]; out.points = state.statPoints; out.bag = state.bag.length;
    out.gear = GEAR_SLOTS.map(s => state.equipped[s] && state.equipped[s].name); out.hud = document.getElementById('hearts').textContent;
    old.state.hp = 3; hydrateWorld(old); out.hurt = state.hp / state.maxHp;
    return out;
  });
  assert.equal(r.points, 0); assert.equal(r.bag, 0); assert.deepEqual(r.gear, ['Iron longsword', null, 'Ring mail', null]);
  assert.equal(r.stats.health, 3 + 4 + 2); assert.ok(r.stats.attack >= 3 + 2 + 3, JSON.stringify(r.stats));       // four levels of training plus the sword
  assert.deepEqual(r.hp, [r.stats.health * 4, r.stats.health * 4]); assert.equal(r.hud, r.hp[0] + '/' + r.hp[1]);
  assert.ok(Math.abs(r.hurt - 3 / 7) < .05, 'wounds keep their share: ' + r.hurt);
}));

test('stats, worn gear, the pack and unspent points survive saving and loading', () => game(async page => {
  const r = await page.evaluate(() => {
    state.stats = { charm: 5, health: 6, attack: 7, defense: 4 }; state.statPoints = 2; equipGear('helmet', GEAR_BY_ID.helmet4b); acquireGear(GEAR_BY_ID.weapon1b, 'a test');
    recalcStats(true); const before = { stats: statTotals(), hp: state.maxHp, bag: state.bag.map(g => g.name), helm: state.equipped.helmet.name };
    saveWorld(); const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    state.stats = { ...START_STATS }; state.statPoints = 0; state.bag = []; state.equipped = startGear(); recalcStats(true);
    hydrateWorld(saved);
    return { before, after: { stats: statTotals(), hp: state.maxHp, bag: state.bag.map(g => g.name), helm: state.equipped.helmet.name }, points: state.statPoints };
  });
  assert.deepEqual(r.after, r.before); assert.equal(r.points, 2);
}));

test('people have stats too: a citizen shows theirs, and soldiers carry the stats of your gear', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); const out = {};
    const p = state.visiting ? townPeople[0] : (syncTownPeople(), townPeople[0]); enterTown(); syncTownPeople(); talkTo(townPeople[0]); out.talk = dialogText(); closeDialog();
    out.person = [personStats({ id: 'town_1', people: 3 }, { name: 'A' }), personStats({ id: 'town_1', people: 30 }, { name: 'A' })];
    out.plain = soldierStats(); equipGear('armor', GEAR_BY_ID.armor3a); equipGear('weapon', GEAR_BY_ID.weapon3a); out.geared = soldierStats(); out.hp = soldierMaxHp();
    return out;
  });
  assert.match(r.talk, /Charm \d+ · Health \d+ · Attack \d+ · Defense \d+/);
  assert.ok(r.person[1].charm > r.person[0].charm && r.person[1].health > r.person[0].health);
  assert.ok(r.geared.defense > r.plain.defense && r.geared.attack > r.plain.attack && r.geared.health > r.plain.health); assert.equal(r.hp, 4 * r.geared.health);
}));
