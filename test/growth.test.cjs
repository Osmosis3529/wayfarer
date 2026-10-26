// Browser-driven tests for other settlements growing up on the overworld: population, destinies, the buildings you see.
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
    window.calm = () => { state.day = 5; for (const s of settlements) { s.aggression = 0; s.owner = null; } state.npcWars = []; };
  });
  try { await fn(page); } finally { await ctx.close(); }
  assert.deepEqual(errors, [], 'page errors');
}

test('settlements fill their houses, make room, and stop at the size they are destined for', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const out = {};
    const v = settlements.find(s => s.destiny === 'village'), c = settlements.find(s => s.destiny === 'city');
    v.people = v.cap = 5; c.people = c.cap = 5; v.goal = 9; c.goal = 33; delete v.rank; delete c.rank;
    const real = Math.random; Math.random = () => 0.01;
    try { growSettlements(); out.first = [c.cap, c.people]; for (let i = 0; i < 80; i++) growSettlements(); out.late = [v.cap, v.people, c.cap, c.people]; } finally { Math.random = real; }
    out.news = state.worldLog.map(l => l.t).filter(t => t.includes(c.name) && t.includes('grown into'));
    return out;
  });
  assert.deepEqual(r.first, [6, 6]); assert.deepEqual(r.late, [9, 9, 33, 33]);
  assert.deepEqual(r.news.map(t => t.replace(/^.* a (\w+) of .*$/, '$1')).sort(), ['city', 'town']);
}));

test('over a long time villages stay villages and the few cities become cities', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); for (const s of settlements) { s.people = 3 + (s.people % 3); s.cap = s.people; delete s.goal; delete s.rank; }
    for (let day = 0; day < 450; day++) growSettlements();
    const by = { village: [], town: [], city: [] };
    for (const s of settlements) by[s.destiny].push(s.people);
    return { by, within: settlements.every(s => s.people <= s.goal && s.people <= s.cap), scale: settlements.map(s => [s.destiny, scaleOf(s.people)].join(':')) };
  });
  assert.equal(r.within, true);
  assert.ok(r.by.village.every(p => p <= 12) && r.by.town.every(p => p >= 18 && p <= 24) && r.by.city.every(p => p >= 30 && p <= 36), JSON.stringify(r.by));
  assert.equal(r.scale.filter(x => x === 'city:city').length, 4); assert.equal(r.scale.filter(x => x === 'town:town').length, 11); assert.equal(r.scale.filter(x => x === 'village:village').length, 7);
}));

test('growth stops while a settlement is at war or belongs to you, and the world turn calls it', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const [a, b, c] = settlements; for (const s of [a, b, c]) { s.people = s.cap = 6; s.goal = 30; }
    b.owner = 'player'; ensureColonies(); state.wars[c.id] = { total: 3, left: 3 };
    const real = Math.random; Math.random = () => 0.01;
    try { worldTurn(); } finally { Math.random = real; }
    return { a: [a.people, a.cap], b: b.people, c: c.cap };
  });
  assert.ok(r.a[1] === 7, 'a free settlement grows: ' + r.a.join()); assert.equal(r.b, 6); assert.equal(r.c, 6);
}));

test('the buildings you see around a settlement depend on how big it is', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0], keys = () => marksOf(s).map(m => m.key);
    s.discovered = true; const out = {};
    for (const p of [3, 5, 8, 11, 13, 25]) { s.people = p; out[p] = keys(); }
    s.people = 25; s.wreck = 3; out.wrecked = keys().length - out[25].length;
    s.wreck = 0; refreshMarks(); const m = marksOf(s)[0]; out.at = markAt(s.x + m.dx, s.y + m.dy);
    s.discovered = false; refreshMarks(); out.hidden = [markAt(s.x + m.dx, s.y + m.dy), !!markTile(s.x + m.dx, s.y + m.dy)];
    state.built.market = true; refreshMarks(); out.home = markAt(HOME.x + 1, HOME.y).key;
    return out;
  });
  assert.deepEqual(r[3], ['market', 'garden', 'well']); assert.ok(r[5].includes('lumberMill') && r[5].includes('huntersLodge') && r[5].includes('longhouse'));
  assert.ok(r[8].includes('smithy') && r[8].includes('barracks') && !r[8].includes('jeweler')); assert.ok(r[11].includes('jeweler') && r[11].includes('mine') && !r[11].includes('caravanPost'));
  assert.ok(r[13].includes('caravanPost') && !r[13].includes('warehouse')); assert.ok(r[25].includes('warehouse'));
  assert.equal(r.wrecked, -3); assert.ok(r.at && r.at.id); assert.deepEqual(r.hidden, [null, true]); assert.equal(r.home, 'market');
}));

test('an annexed settlement shows what you have built there, and the map draws it', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0]; s.discovered = true; s.owner = 'player'; ensureColonies(); state.colonies[s.id].built.smithy = true; state.colonies[s.id].built.market = true;
    refreshMarks(); const keys = marksOf(s).map(m => m.key).sort();
    state.x = s.x; state.y = s.y; useGfx = false; render(); const text = document.getElementById('map').textContent;
    const icons = marksOf(s).map(m => m.icon);
    return { keys, drawn: icons.every(i => text.includes(i)) };
  });
  assert.deepEqual(r.keys, ['market', 'smithy']); assert.equal(r.drawn, true);
}));

test('citizens of other settlements keep off the buildings, and their number follows the population', () => game(async page => {
  const r = await page.evaluate(() => {
    calm(); const s = settlements[0]; s.discovered = true; s.people = 12; s.cap = 12;
    const count = () => state.workers.filter(w => w.townId === s.id).length;
    syncWorkers(); const twelve = count(); s.people = 30; s.cap = 30; syncWorkers(); const thirty = count(); s.people = 3; syncWorkers(); const three = count();
    s.people = 20; syncWorkers(); refreshMarks(); let onMarks = 0;
    for (let i = 0; i < 80; i++) { moveWorkers(); for (const w of state.workers) if (markTile(w.x, w.y)) onMarks++; }
    return { twelve, thirty, three, onMarks, rule: [npcWorkers({ id: 'x', people: 1 }), npcWorkers({ id: 'x', people: 100 })] };
  });
  assert.deepEqual([r.twelve, r.thirty, r.three], [4, 9, 2]); assert.equal(r.onMarks, 0); assert.deepEqual(r.rule, [2, 9]);
}));

test('the ground around each settlement is cleared for its buildings', () => game(async page => {
  const r = await page.evaluate(() => settlements.every(s => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (['♣', '≈', '▲'].includes(overworld[s.y + dy]?.[s.x + dx])) return false; return true; }));
  assert.equal(r, true);
}));

test('the world log keeps the news, newest first, and is saved with the world', () => game(async page => {
  const r = await page.evaluate(() => {
    state.worldLog = []; for (let i = 0; i < 200; i++) logWorld('news ' + i);
    const out = { n: state.worldLog.length, first: state.worldLog[0].t, day: state.worldLog[0].day };
    const save = JSON.parse(JSON.stringify(buildSaveData())); hydrateWorld(save); out.kept = state.worldLog.length;
    delete save.state.worldLog; hydrateWorld(save); out.old = Array.isArray(state.worldLog) && state.worldLog.length === 0;
    return out;
  });
  assert.equal(r.n, 150); assert.equal(r.first, 'news 199'); assert.equal(r.kept, 150); assert.equal(r.old, true);
}));
