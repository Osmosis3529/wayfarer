// Browser-driven tests for rivalries, quests, trade deals, alliances and passive caravan trade.
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
    window.RICH = () => {
      Object.assign(state.inv, { wood: 140, stone: 140, iron: 140, furs: 140, silver: 140, gold: 140, gems: 140, copper: 140, berries: 40 });
      state.unlocked = { smithy: true, huntersLodge: true, jeweler: true };
      state.coin = 500; state.town.people = 40;
    };
    // a known world: nobody dislikes anybody, then the pairs a test asks for
    window.RIVALS = (...pairs) => { for (const s of settlements) s.dislikes = []; for (const [a, b] of pairs) { settlements[a].dislikes.push(settlements[b].id); settlements[b].dislikes.push(settlements[a].id); } };
    window.visit = i => { const s = settlements[i]; s.discovered = true; s.people = 8; state.x = s.x; state.y = s.y; enterSettlement(s.id); closeDialog(); return s; };
    window.homeReady = () => { RICH(); build('hut'); build('longhouse'); build('caravanPost'); };
    window.finish = (s, n = 1) => { for (let i = 0; i < n; i++) { const r = relOf(s.id); r.quest = null; takeQuest(s.id, 0); const q = relOf(s.id).quest; state.inv[q.item] = Math.max(state.inv[q.item], q.n); turnInQuest(s.id); } };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('settlements have mutual dislikes, saved with the world and filled in for old saves', () => game(async page => {
  const r = await page.evaluate(() => {
    const ids = new Set(settlements.map(s => s.id));
    const mutual = settlements.every(s => s.dislikes.every(id => ids.has(id) && townById(id).dislikes.includes(s.id) && id !== s.id));
    const withRival = settlements.filter(s => s.dislikes.length).length;
    const save = JSON.parse(JSON.stringify(buildSaveData())); const kept = save.settlements.map(s => s.dislikes.join());
    for (const s of save.settlements) delete s.dislikes;
    hydrateWorld(save);
    const refilled = settlements.every(s => Array.isArray(s.dislikes)) && settlements.some(s => s.dislikes.length);
    const again = JSON.parse(JSON.stringify(buildSaveData())); hydrateWorld(again);
    const stable = settlements.map(s => s.dislikes.join()).join('|') === again.settlements.map(s => s.dislikes.join()).join('|');
    return { mutual, withRival, total: settlements.length, kept: kept.length, refilled, stable };
  });
  assert.equal(r.mutual, true); assert.ok(r.withRival >= 5 && r.withRival < r.total + 1, JSON.stringify(r)); assert.equal(r.refilled, true); assert.equal(r.stable, true);
}));

test('a gathering job: take it, bring the goods, get paid, and the settlement warms to you', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); RIVALS(); const s = visit(0); const before = state.coin;
    npcHallDialog(s); const board = dialogText();
    const offers = questOffers(s), same = JSON.stringify(offers) === JSON.stringify(questOffers(s));
    takeQuest(s.id, 0); const q = relOf(s.id).quest; takeQuest(s.id, 1); const stillOne = relOf(s.id).quest === q;
    state.inv[q.item] = q.n - 1; npcHallDialog(s); const notYet = [...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Turn in').disabled; turnInQuest(s.id); const unpaid = state.coin === before;
    state.inv[q.item] = q.n + 3; npcHallDialog(s); const ready = ![...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Turn in').disabled;
    turnInQuest(s.id);
    return { board, same, item: q.item, n: q.n, reward: q.reward, stillOne, notYet, unpaid, ready, left: state.inv[q.item], paid: state.coin - before, rel: { ...relOf(s.id) }, next: questOffers(s)[0] };
  });
  assert.ok(r.board.includes('Jobs on offer') && r.board.includes('Bring') && r.board.includes('Defeat'), r.board); assert.equal(r.same, true);
  assert.equal(r.stillOne, true); assert.equal(r.notYet, true); assert.equal(r.unpaid, true); assert.equal(r.ready, true);
  assert.equal(r.left, 3); assert.equal(r.paid, r.reward); assert.deepEqual([r.rel.favor, r.rel.done, r.rel.quest], [1, 1, null]);
  assert.ok(r.next.type === 'gather');
}));

test('a hunting job counts every enemy you or your soldiers defeat, and pays when you report back', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); RIVALS(); const s = visit(0); takeQuest(s.id, 1); const q = relOf(s.id).quest, n = q.n;
    noteKill({ name: 'Briar Wolf' }); noteKill({ name: 'Cave Spider' }); const two = q.kills;
    noteKill({ name: 'Town Guard', faction: 'war', townId: 'town_9' }); noteKill({ name: 'Raider', faction: 'raid', raid: true }); const warOnly = q.kills;   // wars and raids do not count
    for (let i = 0; i < n + 3; i++) noteKill({ name: 'Briar Wolf' });
    const capped = q.kills; npcHallDialog(s); const ready = ![...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Turn in').disabled;
    const coin = state.coin; turnInQuest(s.id); const paid = state.coin - coin;
    // a fight in the open counts too
    takeQuest(s.id, 1); const q2 = relOf(s.id).quest; state.x = HOME.x + 12; state.y = HOME.y; exitTown(); state.x = HOME.x + 12; state.y = HOME.y;
    overworld[state.y][state.x + 1] = 'g'; enemyBucket(overworld).set((state.x + 1) + ',' + state.y, { ...enemyCatalog.wolf }); startCombat(state.x + 1, state.y, state.x, state.y); state.combat.hp = 1; battleAction('attack');
    return { n, two, warOnly, capped, ready, paid, reward: q.reward, fight: q2.kills, quest: relOf(s.id).quest && relOf(s.id).quest.type };
  });
  assert.equal(r.two, 2); assert.equal(r.warOnly, 2); assert.equal(r.capped, r.n); assert.equal(r.ready, true); assert.equal(r.paid, r.reward);
  assert.equal(r.fight, 1); assert.equal(r.quest, 'hunt');
}));

test('a trade deal needs trust, a caravan post with a caravaner and the fee; it makes you allies', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); RIVALS(); const s = visit(0), out = {};
    out.offeredEarly = questOffers(s).some(o => o.type === 'deal'); out.noPost = dealBlock(s);
    build('hut'); build('caravanPost'); out.noTrust = dealBlock(s);
    finish(s, 2); out.offered = questOffers(s).some(o => o.type === 'deal'); out.ready = dealBlock(s);
    state.assign.caravanPost = 0; out.noCaravaner = dealBlock(s); state.assign.caravanPost = 1;
    npcHallDialog(s); out.button = [...document.querySelectorAll('#dialog button')].find(b => b.textContent.startsWith('Strike a trade deal')).disabled;
    state.coin = 10; signDeal(s.id); out.poor = isAlly(s.id); state.coin = 500;
    const coin = state.coin; signDeal(s.id); out.ally = isAlly(s.id); out.fee = coin - state.coin; out.deal = { ...state.deals[s.id] };
    out.after = dealBlock(s); npcHallDialog(s); out.hall = dialogText(); out.standing = standingText(s);
    return out;
  });
  assert.equal(r.offeredEarly, false); assert.match(r.noPost, /caravan post/i); assert.match(r.noTrust, /2 more/); assert.equal(r.offered, true); assert.equal(r.ready, '');
  assert.match(r.noCaravaner, /nobody working/); assert.equal(r.button, false); assert.equal(r.poor, false); assert.equal(r.ally, true); assert.equal(r.fee, 20 + 10 * 2);   // eight citizens: a town, bracket 2
  assert.deepEqual([r.deal.sell, r.deal.buy, r.deal.gear, r.deal.trips], [null, null, false, 0]); assert.match(r.after, /already/); assert.equal(r.standing, 'ally'); assert.ok(r.hall.includes('ally'), r.hall);
}));

test('allying with one settlement makes enemies of the ones that cannot stand it, and ending the alliance ends their war', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS([0, 1], [0, 2]); const a = settlements[0], b = settlements[1], c = settlements[2], d = settlements[3];
    const s = visit(1); finish(s, 2);
    npcHallDialog(s); const warning = dialogText();
    signDeal(s.id); const first = { ally: isAlly(b.id), rivals: [a, c, d].map(x => isHostile(x.id)) };
    const tellsOfWar = state.log.some(l => l.t.includes('declares war on Brackenford'));
    // now their rival wants in: allying with it ends the first alliance
    exitTown(); const t = visit(2); finish(t, 2);
    const hostileBefore = isHostile(c.id);
    // b dislikes a only: allying c with b's rival is blocked while at war
    const block = dealBlock(c);
    breakAlliance(b.id); const after = { ally: isAlly(b.id), rivals: [a, c, d].map(x => isHostile(x.id)), favor: relOf(b.id).favor };
    return { warning, first, tellsOfWar, hostileBefore, block, after };
  });
  assert.deepEqual(r.first, { ally: true, rivals: [true, false, false] }.constructor === Object ? { ally: true, rivals: [true, false, false] } : null);
  assert.ok(r.warning.includes('makes enemies of') && r.warning.includes('cannot stand'), r.warning);
  assert.equal(r.tellsOfWar, true); assert.equal(r.hostileBefore, false);
  assert.deepEqual(r.after, { ally: false, rivals: [false, false, false], favor: 0 });
}));

test('an alliance with a settlement your ally dislikes is dropped when war is made on it', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS([0, 1]); const a = settlements[0], b = settlements[1];
    const sa = visit(0); finish(sa, 2); signDeal(sa.id); const allied = isAlly(a.id);
    // b becomes an enemy because it dislikes a, but suppose b had also been an ally
    delete state.hostile[b.id]; state.deals[b.id] = { sell: null, buy: null, gear: false, last: state.day, since: state.day, trips: 0, profit: 0 };
    makeHostile(b, a.id);
    const out = { allied, bAlly: isAlly(b.id), bHostile: isHostile(b.id), log: state.log.slice(0, 6).map(l => l.t).join(' ') };
    breakAlliance(a.id); out.stood = isHostile(b.id); return out;
  });
  assert.equal(r.allied, true); assert.equal(r.bAlly, false); assert.equal(r.bHostile, true); assert.match(r.log, /alliance with .* ends/i); assert.equal(r.stood, false);
}));

test('caravans run the deals: each caravaner one deal, a trip every two days, selling, buying and fetching gear', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS(); const a = visit(0); finish(a, 2); signDeal(a.id); exitTown(); const b = visit(1); finish(b, 2); signDeal(b.id); exitTown();
    const out = {};
    out.running1 = runningDeals().length; state.assign.caravanPost = 2; out.running2 = runningDeals().length;
    const d = state.deals[a.id]; d.sell = 'wood'; d.buy = 'iron'; d.gear = true;
    state.inv.wood = 40; state.inv.iron = 0; state.coin = 300; state.equipped.weapon = { name: 'Traveler’s knife', damage: 0 }; state.equipped.armor = { name: 'Travel clothes', health: 0 };
    const sellP = regionPrice(a, 'wood', 'sell'), buyP = regionPrice(a, 'iron', 'buy'), load = caravanLoad();
    d.last = state.day; caravanTurn(); out.tooSoon = [state.inv.wood, state.inv.iron];
    state.day += 2; const coin0 = state.coin, gear0 = state.equipped.weapon.damage + state.equipped.armor.health; caravanTurn();
    out.trip = { wood: 40 - state.inv.wood, iron: state.inv.iron, load, sellP, buyP, gear: state.equipped.weapon.damage + state.equipped.armor.health > gear0, trips: d.trips, other: state.deals[b.id].trips, coinMoved: state.coin - coin0, profit: d.profit };
    out.log = state.log.slice(0, 3).map(l => l.t).find(t => t.startsWith('The caravan from ' + a.name));
    // the reserve is never sold, and nothing is bought without coin
    state.inv.wood = 7; state.coin = 12; d.last = state.day - 2; d.gear = false; caravanTurn(); out.reserve = [state.inv.wood, state.coin >= 10];
    d.sell = null; d.buy = 'gems'; state.coin = 10; state.inv.gems = 0; d.last = state.day - 2; caravanTurn(); out.broke = state.inv.gems;
    state.assign.caravanPost = 0; d.last = state.day - 5; const t0 = d.trips; caravanTurn(); out.idle = d.trips === t0;
    return out;
  });
  assert.equal(r.running1, 1); assert.equal(r.running2, 2); assert.deepEqual(r.tooSoon, [40, 0]);
  assert.equal(r.trip.wood, r.trip.load); assert.equal(r.trip.iron, Math.min(r.trip.load, Math.floor((300 + r.trip.wood * r.trip.sellP - 10) / r.trip.buyP)));
  assert.equal(r.trip.gear, true); assert.deepEqual([r.trip.trips, r.trip.other], [1, 1]); assert.equal(r.trip.profit, r.trip.coinMoved);
  assert.ok(r.log.includes('returns') && r.log.includes('sold') && r.log.includes('bought') && r.log.includes('brought back'), r.log);
  assert.deepEqual(r.reserve, [5, true]); assert.equal(r.broke, 0); assert.equal(r.idle, true);
}));

test('the caravan post shows the deals and lets you change what the caravans carry or end them', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS(); const a = visit(0); finish(a, 2); signDeal(a.id); exitTown();
    state.x = HOME.x + 2; state.y = HOME.y; interact(); const text = dialogText();
    const click = label => [...document.querySelectorAll('#dialog button')].find(b => b.textContent.startsWith(label)).click();
    click('Sell:'); const sell1 = state.deals[a.id].sell; click('Buy:'); const buy1 = state.deals[a.id].buy; click('Equipment:'); const gear = state.deals[a.id].gear;
    for (let i = 0; i < 12; i++) click('Sell:'); const cycled = state.deals[a.id].sell;
    click('End the deal'); return { text, sell1, buy1, gear, cycled, ally: isAlly(a.id), after: dialogText() };
  });
  assert.ok(r.text.includes('Caravan post') && r.text.includes('Sell: nothing') && r.text.includes('Equipment: no'), r.text);
  assert.equal(r.sell1, 'berries'); assert.equal(r.buy1, 'berries'); assert.equal(r.gear, true); assert.equal(r.cycled, 'stone');   // 13 clicks round nothing + 9 goods: the fourth entry
  assert.equal(r.ally, false); assert.ok(r.after.includes('No deals yet'), r.after);
}));

test('the journal lists jobs, allies and enemies, and J opens it', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS([0, 1]); const a = visit(0); finish(a, 2); signDeal(a.id); takeQuest(a.id, 0); exitTown();
    manualPause = false; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); manualPause = true;
    const open = dialogOpen(), text = dialogText(), buttons = document.getElementById('actions').textContent.includes('Journal');
    closeDialog(); return { open, text, buttons, n: settlements[1].name };
  });
  assert.equal(r.open, true); assert.equal(r.buttons, true);
  assert.ok(r.text.includes('Jobs') && r.text.includes('Allies') && r.text.includes('Enemies') && r.text.includes(r.n) && r.text.includes('at war with you'), r.text);
}));

test('quests, deals, enemies and standing survive saving and loading', () => game(async page => {
  const r = await page.evaluate(() => {
    homeReady(); RIVALS([0, 1]); const a = visit(0); finish(a, 2); signDeal(a.id); const b = visit(2); takeQuest(b.id, 1); noteKill({ name: 'x' });
    state.deals[a.id].sell = 'wood'; const save = JSON.parse(JSON.stringify(buildSaveData()));
    state.deals = {}; state.hostile = {}; state.rel = {}; hydrateWorld(save);
    return { deal: state.deals[a.id], hostile: Object.keys(state.hostile), quest: relOf(b.id).quest, favor: relOf(a.id).favor, rivals: settlements[0].dislikes };
  });
  assert.equal(r.deal.sell, 'wood'); assert.equal(r.hostile.length, 1); assert.deepEqual([r.quest.type, r.quest.kills], ['hunt', 1]); assert.equal(r.favor, 2); assert.equal(r.rivals.length, 1);
}));

test('giving up a job from the journal works wherever you stand, including at a settlement’s gate', () => game(async page => {
  const r = await page.evaluate(() => {
    RICH(); RIVALS(); const s = visit(0); takeQuest(s.id, 0); exitTown();            // standing on its tile outside
    const here = inSettlement(s); journal(); const before = dialogText();
    [...document.querySelectorAll('#dialog button')].find(b => b.textContent === 'Give up').click();
    return { here, before: before.includes(s.name), quest: relOf(s.id).quest, after: dialogText(), open: dialogOpen() };
  });
  assert.equal(r.here, true); assert.equal(r.before, true); assert.equal(r.quest, null); assert.ok(r.open && r.after.includes('No jobs taken'), r.after);
}));
