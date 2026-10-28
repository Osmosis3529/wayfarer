// Browser-driven tests for coal, the ores in each mine, and the fuel working buildings burn.
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
      state.coin = 500; state.town.people = 40; state.town.food = 40;
    };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('coal is an item with a price, a pack slot, a storage limit and a place in the markets', () => game(async page => {
  const r = await page.evaluate(() => {
    const s = { id: 'town_0', name: 'T', bias: 0, surplus: [], scarce: [] };
    return { name: itemNames.coal, start: state.inv.coal, capped: CAPPED.includes('coal'), trade: TRADE_GOODS.includes('coal'), buy: regionPrice(s, 'coal', 'buy'), sell: regionPrice(s, 'coal', 'sell'),
      pack: document.getElementById('inventory').textContent.includes('Coal'), icon: GFX.icon('coal').startsWith('data:'), glyph: GFX.SPRITE_OF.k, shop: SHOP_GOODS.market.buy.includes('coal') && SHOP_GOODS.mine.sell.includes('coal') && NPC_SHOPS.mine.buy.includes('coal') };
  });
  assert.deepEqual(r, { name: 'Coal', start: 4, capped: true, trade: true, buy: 5, sell: 3, pack: true, icon: true, glyph: 'ore_k', shop: true });
}));

test('picking a coal seam gives coal, and caves have coal', () => game(async page => {
  const r = await page.evaluate(() => {
    state.x = HOME.x + 20; state.y = HOME.y; for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) overworld[state.y + dy][state.x + dx] = '.'; overworld[state.y][state.x + 1] = 'k';
    const c0 = state.inv.coal; interact();
    const cave = makeInstance('cave', 1, caves[0]);
    return { gained: state.inv.coal - c0, caveCoal: cave.flat().filter(c => c === 'k').length, html: document.getElementById('map').innerHTML.includes('>k<') || true };
  });
  assert.ok(r.gained >= 1); assert.ok(r.caveCoal >= 8, 'coal in caves: ' + r.caveCoal);
}));

test('each mine holds one or two kinds of ore, and the rare ones lie deeper', () => game(async page => {
  const r = await page.evaluate(() => {
    const out = { sizes: new Set(), commons: 0, rare: 0, ok: true, reach: true, home: homeMine.ores };
    const glyph = o => ORE_GLYPH[o], all = Object.keys(ORE_GLYPH);
    for (const m of [...mines, homeMine, ...Array.from({ length: 80 }, (_, i) => { const s = { id: 'x' + i, maxDepth: 2 + (i % 4) }; assignMineOres(s); return s; })]) {
      out.sizes.add(m.ores.length);
      if (!COMMON_ORES.includes(m.ores[0])) out.ok = false;
      for (const o of m.ores) if (RARE_ORES[o]) { out.rare++; if (m.maxDepth <= RARE_ORES[o]) out.reach = false; } else out.commons++;
      for (let depth = 1; depth <= m.maxDepth; depth++) {
        const grid = makeInstance('mine', depth, m), seen = new Set(grid.flat());
        for (const o of all) {
          const there = seen.has(glyph(o)), should = m.ores.includes(o) && (!RARE_ORES[o] || depth >= RARE_ORES[o]);
          if (there !== should) out.ok = false;
        }
      }
    }
    out.sizes = [...out.sizes].sort();
    return out;
  });
  assert.deepEqual(r.sizes, [1, 2]); assert.equal(r.ok, true, 'ore layout broke the rules'); assert.equal(r.reach, true); assert.ok(r.rare > 5 && r.commons > r.rare);
  assert.equal(r.home[0], 'coal'); assert.equal(r.home.length, 2);
}));

test('rarer seams grow richer the deeper you go, and old mines get the same ores every time', () => game(async page => {
  const r = await page.evaluate(() => {
    const m = { id: 'old_mine', maxDepth: 5, ores: ['copper', 'gold'] }, count = d => makeInstance('mine', d, m).flat().filter(c => c === 'a').length;
    const out = { gold: [1, 2, 3, 4, 5].map(count) };
    const a = { id: 'mine_7', maxDepth: 3 }, b = { id: 'mine_7', maxDepth: 3 };
    out.same = JSON.stringify(mineOres(a)) === JSON.stringify(mineOres(b)); out.assigned = Array.isArray(a.ores);
    out.label = oresLabel({ ores: ['coal', 'silver'] }); out.single = oresLabel({ ores: ['iron'] });
    const save = JSON.parse(JSON.stringify(buildSaveData())); for (const s of save.mines) delete s.ores; hydrateWorld(save);
    out.afterLoad = mines.every(s => Array.isArray(mineOres(s)) && mineOres(s).length >= 1);
    enterInstance(mines[0], 'mine'); out.msg = state.log[0].t; exitInstance();
    return out;
  });
  assert.deepEqual(r.gold.slice(0, 2), [0, 0]); assert.ok(r.gold[2] > 0 && r.gold[3] > r.gold[2] && r.gold[4] > r.gold[3], r.gold.join());
  assert.equal(r.same, true); assert.equal(r.assigned, true); assert.equal(r.label, 'coal and silver'); assert.equal(r.single, 'iron'); assert.equal(r.afterLoad, true);
  assert.ok(/seams hold/.test(r.msg), r.msg);
}));

test('working mines, jewelers and lodges burn a coal a day, and run at half pace without it', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); build('mine'); build('jeweler'); build('huntersLodge'); state.assign.mine = 2; state.assign.jeweler = 2; state.assign.huntersLodge = 2;
    const out = {};
    out.burning = fuelBuildings().sort(); out.note = fuelNote(); render(); out.panel = document.getElementById('town-stats').textContent.includes('Fuel');
    state.inv.coal = 5; state.town.food = 40; const real = Math.random; Math.random = () => .99;
    try {
      advanceDay(); out.fed = { coal: state.inv.coal - 0, cold: [...fuelCold] };            // the three furnaces took three; today's mine drops are added after
      state.inv.coal = 0; state.inv.furs = 0; state.town.food = 40; const meals0 = state.town.food; advanceDay(); out.starved = { lodgeFurs: state.inv.furs, log: state.log.slice(0, 12).map(l => l.t).find(t => t.startsWith('No coal')) };
      state.inv.coal = 10; state.inv.furs = 0; state.town.food = 40; advanceDay(); out.warm = state.inv.furs;
    } finally { Math.random = real; }
    state.assign.mine = 0; state.assign.jeweler = 0; state.assign.huntersLodge = 0; state.inv.coal = 7; advanceDay(); out.idle = state.inv.coal;
    out.factor = [fuelFactor('mine'), (fuelCold = new Set(['mine']), fuelFactor('mine'))]; fuelCold = new Set();
    return out;
  });
  assert.deepEqual(r.burning, ['huntersLodge', 'jeweler', 'mine']); assert.equal(r.note, 'Coal: 4 · burning 3 a day'); assert.equal(r.panel, true);
  assert.ok(r.fed.coal >= 2 && r.fed.coal <= 4 && r.fed.cold.length === 0, JSON.stringify(r.fed));
  assert.ok(/mine.*jeweler|hunters/.test(r.starved.log || '') && r.starved.log.includes('half pace'), r.starved.log);
  assert.ok(r.starved.lodgeFurs < r.warm, 'a cold lodge brings fewer furs: ' + r.starved.lodgeFurs + ' vs ' + r.warm);
  assert.equal(r.idle, 7, 'buildings nobody works in burn nothing'); assert.deepEqual(r.factor, [1, .5]);
}));

test('the forge burns coal for everything it makes', () => game(async page => {
  const r = await page.evaluate(() => {
    state.built.smithy = true; Object.assign(state.inv, { copper: 20, wood: 20, coal: 0 });
    const cost = recipeFor(GEAR_BY_ID.weapon1a); openSmithy(); const dlg = dialogText();
    craftGear('weapon1a'); const refused = state.equipped.weapon.name;
    state.inv.coal = 1; craftGear('weapon1a'); const made = [state.equipped.weapon.name, state.inv.coal];
    return { cost, dlg: dlg.includes('coal'), refused, made, tiers: [1, 2, 3, 4, 5].map(t => recipeFor(GEAR_BY_ID['armor' + t + 'a']).coal) };
  });
  assert.equal(r.cost.coal, 1); assert.equal(r.dlg, true); assert.equal(r.refused, 'Traveler’s knife'); assert.deepEqual(r.made, ['Bronze knife', 0]);
  assert.ok(r.tiers.every((c, i) => c >= 1 && (i === 0 || c >= r.tiers[i - 1])), r.tiers.join());
}));
