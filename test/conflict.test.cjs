// Browser-driven tests for enemy assaults, allies sending help, calls for aid, and helping in wars between settlements.
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
    window.clearRect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (overworld[y] && overworld[y][x] !== undefined && !'SCDKM⌂'.includes(overworld[y][x])) overworld[y][x] = '.'; };
    window.dialogText = () => document.getElementById('dialog').textContent;
    window.dialogOpen = () => document.getElementById('overlay').style.display === 'grid';
    window.foeBox = () => [...enemyBucket(overworld)].map(([k, e]) => ({ k, e, x: +k.split(',')[0], y: +k.split(',')[1] })).filter(f => overworld[f.y][f.x] === 'g');
    window.RIVALS = (...pairs) => { for (const s of settlements) s.dislikes = []; for (const [a, b] of pairs) { settlements[a].dislikes.push(settlements[b].id); settlements[b].dislikes.push(settlements[a].id); } };
    // a settled Brackenford with citizens, jobs and a few buildings
    window.home = () => { RICH(); for (const k of ['hut', 'longhouse', 'market', 'garden', 'lumberMill', 'mine', 'smithy', 'caravanPost']) build(k); state.town.people = 20; state.town.food = 60; clearRect(HOME.x - 30, HOME.y - 30, HOME.x + 30, HOME.y + 30); };
    window.ally = (i) => { const s = settlements[i]; s.discovered = true; s.people = 8; state.deals[s.id] = { sell: null, buy: null, gear: false, last: state.day, since: state.day, trips: 0, profit: 0 }; return s; };
    window.setAlone = () => { for (const s of settlements) { s.owner = null; s.aggression = 0; } state.npcWars = []; };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('a settlement at war with you sends warbands on a schedule, and one at peace with you does not', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const s = settlements[0], t = settlements[1]; s.people = 9; state.day = 20;
    state.hostile[s.id] = { since: 18, via: null, next: 22 };
    hostilityTurn(); const early = !!state.raid;
    state.day = 22; hostilityTurn(); const raid = state.raid ? { ...state.raid } : null, foes = foeBox().filter(f => f.e.raid).length;
    const next = state.hostile[s.id].next;
    hostilityTurn(); const same = state.raid && state.raid.from === s.id;
    return { early, raid, foes, next, same, quiet: !state.hostile[t.id], day: state.day };
  });
  assert.equal(r.early, false); assert.equal(r.raid.war, true); assert.equal(r.raid.from, 'town_0'); assert.equal(r.foes, r.raid.left); assert.ok(r.raid.total >= 3 && r.raid.total <= 9);
  assert.ok(r.next >= r.day + 4 && r.next <= r.day + 6, JSON.stringify(r)); assert.equal(r.same, true); assert.equal(r.quiet, true);
}));

test('raiders that get through a war assault kill citizens and burn buildings, but never take the settlement', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const s = settlements[0]; s.people = 9;
    const before = { people: state.town.people, built: Object.keys(state.built).filter(k => state.built[k]).length };
    startRaid(s, { war: true }); const total = state.raid.total;
    const real = Math.random; Math.random = () => 0.1;        // every raider also burns something
    try { for (const [x, y] of raiderTiles().slice(0, 3)) raiderLoots(x, y); } finally { Math.random = real; }
    const after = { people: state.town.people, built: Object.keys(state.built).filter(k => state.built[k]).length, left: state.raid.left, looted: state.raid.looted, hall: state.built.hut, longhouse: state.built.longhouse };
    const jobs = employed() <= state.town.people;
    for (const [x, y] of raiderTiles()) overworld[y][x] = '.'; state.raid.left = 0; endRaid();
    return { before, after, jobs, total, text: state.log.map(l => l.t).join(' | '), people: state.town.people };
  });
  assert.equal(r.after.people, r.before.people - 3); assert.equal(r.after.built, r.before.built - 3); assert.equal(r.after.hall, true); assert.equal(r.after.longhouse, true);
  assert.equal(r.after.looted, 3); assert.equal(r.after.left, r.total - 3); assert.equal(r.jobs, true);
  assert.ok(r.text.includes('kills a citizen') && r.text.includes('burns down'), r.text); assert.ok(r.text.includes('assault from') && r.text.includes('is over'), r.text);
}));

test('if every citizen dies the settlement starts again with two and loses every building', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const s = settlements[0]; s.people = 9; state.town.people = 2; state.up.market = [true, false, false]; state.town.tier = 2; const inv = state.inv.wood, coin = state.coin;
    startRaid(s, { war: true });
    for (const [x, y] of raiderTiles().slice(0, 2)) raiderLoots(x, y);
    return { people: state.town.people, built: Object.values(state.built).filter(Boolean).length, tier: state.town.tier, up: Object.keys(state.up).length, food: state.town.food, raid: state.raid, foes: foeBox().filter(f => f.e.raid).length, wood: state.inv.wood === inv, coin: state.coin === coin, housing: housingCap(), soldiers: state.soldiers.length, log: state.log[0].t };
  });
  assert.equal(r.people, 2); assert.equal(r.built, 0); assert.equal(r.tier, 1); assert.equal(r.up, 0); assert.equal(r.raid, null); assert.equal(r.foes, 0);
  assert.equal(r.wood, true); assert.equal(r.coin, true); assert.equal(r.housing, 2); assert.ok(r.log.includes('silent') || r.log.includes('start again'), r.log);
}));

test('allies send soldiers when you are attacked, and a plain raid still only loots', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const s = settlements[5], a = ally(0), b = ally(1); b.people = 4; ally(2).people = 2;   // the third is too small to help
    startRaid(s, { war: true }); const total = state.raid.total, left = state.raid.left;
    const text = state.log.slice(0, 3).map(l => l.t).join(' | '), raiders = foeBox().filter(f => f.e.raid).length;
    for (const [x, y] of raiderTiles()) overworld[y][x] = '.'; state.raid = null;
    state.hostile[settlements[3].id] = { since: 1, via: null, next: 99 }; ally(3).people = 8; const hostileAlly = state.hostile[settlements[3].id];
    startRaid(s, {}); const plain = state.raid.war;
    return { total, left, raiders, text, plain, helpers: total - left, hostileAlly: !!hostileAlly };
  });
  assert.ok(r.helpers >= 2 && r.helpers <= 5, JSON.stringify(r)); assert.equal(r.raiders, r.left); assert.ok(r.text.includes('Allied soldiers ride to your aid'), r.text); assert.equal(r.plain, false);
}));

test('an ally that is attacked calls for help: send supplies or fight for them, or lose the alliance after three days', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const a = ally(0), foe = settlements[1]; a.people = 9; foe.people = 9; state.day = 10;
    const war = startNpcWar(foe, a); const call = { ...state.aid[a.id] };
    const log = state.log.slice(0, 4).map(l => l.t).join(' | ');
    journal(); const shown = dialogText(); closeDialog();
    state.coin = 5; sendAid(a.id); const poor = state.aid[a.id].helped;
    state.coin = 100; sendAid(a.id); const sent = { helped: state.aid[a.id].helped, coin: 100 - state.coin, cost: aidCost(a), bonus: war.aid };
    state.day = 14; aidTurn(); const kept = isAlly(a.id);
    // the second ally is ignored
    const b = ally(2); b.people = 9; const foe2 = settlements[3]; foe2.people = 9; startNpcWar(foe2, b); state.day = 14;
    aidTurn(); const early = isAlly(b.id); state.day = 20; aidTurn();
    return { call, log, shown, poor, sent, kept, early, lost: !isAlly(b.id), lostText: state.log.slice(0, 3).map(l => l.t).join(' | '), cleared: !state.aid[b.id] };
  });
  assert.deepEqual([r.call.against, r.call.deadline, r.call.helped], ['town_1', 13, false]); assert.ok(r.log.includes('calls on you'), r.log);
  assert.ok(r.shown.includes('Send supplies') && r.shown.includes('is attacked by'), r.shown);
  assert.equal(r.poor, false); assert.equal(r.sent.helped, true); assert.equal(r.sent.coin, r.sent.cost); assert.equal(r.sent.bonus, 1); assert.equal(r.kept, true);
  assert.equal(r.early, true); assert.equal(r.lost, true); assert.ok(r.lostText.includes('sent no help'), r.lostText); assert.equal(r.cleared, true);
}));

test('fighting for an attacked ally counts as help, and you share the winner’s spoils when your side wins', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const a = ally(0), att = settlements[1]; a.people = 9; att.people = 6; a.stock = {}; att.stock = { wood: 20, iron: 10 }; state.day = 10;
    const w = startNpcWar(att, a); const coin0 = state.coin, wood0 = state.inv.wood = 0;
    joinWar(w.id, 'd'); const foes = foeBox().filter(f => f.e.faction === 'npcwar'), n = foes.length;
    const sameFoes = foes.every(f => f.e.npcWar === w.id && f.e.foeSide === 'a' && Math.hypot(f.x - a.x, f.y - a.y) <= 6.6);
    joinWar(w.id, 'd'); const again = foeBox().filter(f => f.e.faction === 'npcwar').length;
    const out = { n, sameFoes, again, helped: state.aid[a.id].helped, you: w.you, foeSide: new Set(foes.map(f => f.e.foeSide)).size };
    const before = att.people; const first = foes[0]; removeEnemyData(overworld, first.x, first.y); overworld[first.y][first.x] = '.'; noteKill(first.e); out.dead = before - att.people;
    att.people = 1; const last = foes[1]; removeEnemyData(overworld, last.x, last.y); overworld[last.y][last.x] = '.'; noteKill(last.e);
    Object.assign(out, { over: !state.npcWars.includes(w), loserPeople: att.people, winnerStock: a.stock, coin: state.coin - coin0, wood: state.inv.wood - wood0, left: foeBox().filter(f => f.e.faction === 'npcwar').length, wreck: att.wreck > 0, ally: isAlly(a.id), log: state.log.slice(0, 4).map(l => l.t).join(' | ') });
    return out;
  });
  assert.ok(r.n >= 2 && r.n <= 6); assert.equal(r.sameFoes, true); assert.equal(r.again, r.n); assert.equal(r.helped, true); assert.equal(r.you, 'd'); assert.equal(r.foeSide, 1); assert.equal(r.dead, 1);
  assert.equal(r.over, true); assert.equal(r.loserPeople, 2); assert.equal(r.wreck, true); assert.ok(r.winnerStock.wood >= 20 && r.winnerStock.iron >= 10, JSON.stringify(r.winnerStock));
  assert.ok(r.coin >= 15, 'coin ' + r.coin); assert.equal(r.wood, 10); assert.equal(r.left, 0); assert.equal(r.ally, true); assert.ok(r.log.includes('winning side'), r.log);
}));

test('you can also join an attack: the defenders take the field and each one you beat is a citizen fewer', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const a = settlements[0], d = settlements[1]; a.people = 8; d.people = 8; d.discovered = true; state.day = 10;
    const w = startNpcWar(a, d); joinWar(w.id, 'a');
    const foes = foeBox().filter(f => f.e.faction === 'npcwar'), kinds = new Set(foes.map(f => f.e.name)), sides = new Set(foes.map(f => f.e.foeSide));
    const before = d.people; for (const f of foes) { removeEnemyData(overworld, f.x, f.y); overworld[f.y][f.x] = '.'; noteKill(f.e); }
    return { kinds: [...kinds], sides: [...sides], dead: before - d.people, n: foes.length, running: state.npcWars.includes(w), journal: (journal(), dialogText()) };
  });
  assert.deepEqual(r.kinds, ['Town Guard']); assert.deepEqual(r.sides, ['d']); assert.equal(r.dead, r.n); assert.equal(r.running, true); assert.ok(r.journal.includes('Wars between') || r.journal.includes('attacks'), r.journal);
}));

test('the war board in the journal lists wars, and wars end in a draw after two weeks without a winner', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const a = settlements[0], d = settlements[1]; a.people = 6; d.people = 6; a.discovered = d.discovered = true; state.day = 3;
    const w = startNpcWar(a, d); journal(); const board = dialogText(); closeDialog();
    const real = Math.random; Math.random = () => 0.5;
    try { for (let i = 0; i < 20 && state.npcWars.includes(w); i++) { state.day++; a.people = 6; d.people = 6; npcWarTurn(); } } finally { Math.random = real; }
    return { board, over: !state.npcWars.includes(w), days: state.day - 3, news: state.log.some(l => l.t.includes('fizzles out')), people: [a.people, d.people] };
  });
  assert.ok(r.board.includes('attacks') && r.board.includes('Defend') && r.board.includes('Attack'), r.board);
  assert.equal(r.over, true); assert.equal(r.days, 14); assert.equal(r.news, true); assert.ok(r.people.every(n => n >= 4 && n <= 6), 'a draw leaves both sides standing ' + r.people);
}));

test('wars start on their own, between rivals most often, never involve annexed settlements, and never more than three at once', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); state.day = 10; RIVALS([0, 1]); settlements[2].owner = 'player';
    for (const s of settlements) { s.people = 6; s.discovered = true; }
    const real = Math.random; let started = 0, rivalWars = 0, max = 0, annexedInvolved = 0;
    try {
      for (let i = 0; i < 400; i++) {
        Math.random = () => (i * 0.6180339) % 1; const n = state.npcWars.length; maybeStartNpcWar(); started += state.npcWars.length - n; max = Math.max(max, state.npcWars.length);
        if (state.npcWars.length > n) { const w = state.npcWars[state.npcWars.length - 1]; if ((w.a === 'town_0' && w.d === 'town_1') || (w.a === 'town_1' && w.d === 'town_0')) rivalWars++; if (w.a === 'town_2' || w.d === 'town_2') annexedInvolved++; }
        state.npcWars = state.npcWars.slice(-2);
        if (i % 3 === 0) state.npcWars = [];
      }
    } finally { Math.random = real; }
    return { started, rivalWars, max, annexedInvolved };
  });
  assert.ok(r.started >= 10, JSON.stringify(r)); assert.ok(r.max <= 3, JSON.stringify(r)); assert.equal(r.annexedInvolved, 0); assert.ok(r.rivalWars >= 1, JSON.stringify(r));
}));

test('a ruined settlement shows fewer buildings, can still be entered, and recovers over days', () => game(async page => {
  const r = await page.evaluate(() => {
    setAlone(); state.day = 5; const s = settlements[0]; s.discovered = true; s.people = 8; s.wreck = 0;      // before day 7 the world starts no new wars
    const total = Object.keys(buildNpcTown(s).plots).length;
    s.wreck = 3; const three = Object.keys(buildNpcTown(s).plots).length;
    respawnSettlement(s); const none = Object.keys(buildNpcTown(s).plots).length;
    state.x = s.x; state.y = s.y; enterSettlement(s.id); const inside = state.zone === 'town', people = townPeople.length;
    renderMap(); document.getElementById('town-panel').classList.contains('visible');
    exitTown(); state.day = 5; const grown = []; for (let i = 0; i < 30; i++) { worldTurn(); grown.push(Object.keys(buildNpcTown(s).plots).length); }
    return { total, three, none, inside, people, grown, wreck: s.wreck };
  });
  assert.equal(r.three, r.total - 3); assert.equal(r.none, 0); assert.equal(r.inside, true); assert.ok(r.people >= 2);
  assert.ok(r.grown[r.grown.length - 1] > 0 && r.grown.every((n, i) => i === 0 || n >= r.grown[i - 1]), JSON.stringify(r.grown));
}));

test('wars, hostility, aid calls and settlement wars survive saving', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); const a = ally(0), d = settlements[1], x = settlements[2]; state.day = 7;
    startNpcWar(d, a); joinWar(state.npcWars[0].id, 'd'); state.hostile[x.id] = { since: 5, via: a.id, next: 9 };
    const keep = { wars: JSON.parse(JSON.stringify(state.npcWars)), aid: JSON.parse(JSON.stringify(state.aid)), hostile: JSON.parse(JSON.stringify(state.hostile)), foes: foeBox().length, seq: state.npcWarSeq };
    const save = JSON.parse(JSON.stringify(buildSaveData())); state.npcWars = []; state.aid = {}; state.hostile = {}; state.npcWarSeq = 0; hydrateWorld(save);
    // a save from before any of this existed
    const old = JSON.parse(JSON.stringify(save)); for (const k of ['npcWars', 'npcWarSeq', 'aid', 'hostile', 'deals', 'rel']) delete old.state[k]; state.npcWars = [1]; state.deals = { x: 1 };
    const again = { wars: JSON.parse(JSON.stringify(state.npcWars)) }; hydrateWorld(save); hydrateWorld(old);
    return { keep, same: { wars: JSON.parse(JSON.stringify(state.npcWars)) }, again, old: { wars: state.npcWars, aid: state.aid, hostile: state.hostile, deals: state.deals } };
  });
  assert.equal(r.keep.wars.length, 1); assert.equal(Object.keys(r.keep.aid).length, 1); assert.equal(Object.keys(r.keep.hostile).length, 1);
  assert.deepEqual(r.old, { wars: [], aid: {}, hostile: {}, deals: {} });
}));

test('allies join a war you declare: they cut down some defenders, never the captain or the buildings', () => game(async page => {
  const r = await page.evaluate(() => {
    home(); setAlone(); RIVALS([0, 1]); RICH(); build('barracks'); state.town.people = 40; for (let i = 0; i < 30 && crew('barracks') < 4; i++) assignWorker('barracks', 1); syncSoldiers();
    const s = settlements[0], hater = settlements[1]; s.discovered = true; s.people = 9; clearRect(s.x - 9, s.y - 9, s.x + 9, s.y + 9); overworld[s.y][s.x] = 'S';
    ally(2); ally(3); hater.discovered = true; hater.people = 8; state.deals[hater.id] = { sell: null, buy: null, gear: false, last: 1, since: 1, trips: 0, profit: 0 };
    const blocked = declareWar(hater.id);                       // an ally cannot be attacked
    const ok = declareWar(s.id), w = state.wars[s.id], foes = foeBox().filter(f => f.e.townId === s.id);
    return { blocked, ok, guards: w.guards, size: w.size, alive: foes.filter(f => !f.e.building).length, houses: foes.filter(f => f.e.building).length, holds: w.holds, captain: foes.some(f => f.e.name === 'Town Captain'), left: w.left, total: w.total, count: foes.length, log: state.log.find(l => l.t.includes('You declare war')).t, people: s.people };
  });
  assert.equal(r.blocked, false); assert.equal(r.ok, true); assert.ok(r.alive < r.size && r.alive >= Math.ceil(r.size / 2), JSON.stringify(r));
  assert.equal(r.captain, true); assert.equal(r.houses, r.holds); assert.equal(r.left, r.count); assert.equal(r.guards, r.alive); assert.ok(r.log.includes('Allied soldiers have already cut down'), r.log);
}));
