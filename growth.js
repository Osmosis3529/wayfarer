// How the other settlements grow up: each is born a village with a destiny (stay a village, grow into a town or a city).
// Loaded after towns.js; like the other scripts it uses the main script's globals at call time.

// ---------------------------------------------------------------- destinies
// Towns are as many as cities and villages put together, villages outnumber cities, and cities are few.
const DESTINIES = ['village', 'town', 'city'];
const DESTINY_SIZE = { village: [8, 12], town: [18, 24], city: [30, 36] };   // the most citizens each can grow to
function destinyCounts(n) {
  const m = Math.floor(n / 2);                  // towns are half of everything
  let c = Math.max(1, Math.round(m * .36)), v = m - c;
  while (v <= c && c > 1) { c--; v++; }
  return { city: c, town: n - c - v, village: v };
}
function assignDestinies(list = settlements) {
  if (!list.length || list.some(s => s.destiny)) return;
  const bag = [];
  for (const [k, n] of Object.entries(destinyCounts(list.length))) for (let i = 0; i < n; i++) bag.push(k);
  bag.sort(() => Math.random() - .5);
  list.forEach((s, i) => { s.destiny = bag[i]; });
}
// The size a settlement is heading for; picked once, then kept.
function goalOf(s) {
  if (!Number.isFinite(s.goal)) { const [lo, hi] = DESTINY_SIZE[s.destiny || 'village']; s.goal = lo + Math.floor(Math.random() * (hi - lo + 1)); }
  return s.goal;
}
// What to call a settlement of this many people: the same sizes as your own village, town and city (12, 24, 36).
function scaleOf(people) { return people <= 12 ? 'village' : people <= 24 ? 'town' : 'city'; }

// ---------------------------------------------------------------- growing up
// A settlement that has filled its houses sometimes finds room for one more family, up to the size it is destined for.
const GROWTH_PER_DAY = .35;
const SCALE_RANK = { village: 0, town: 1, city: 2 };
function growSettlements() {
  for (const s of settlements) {
    if (s.owner === 'player' || warOf(s.id) || (state.wars && state.wars[s.id])) continue;
    const goal = goalOf(s);
    if (s.people >= s.cap && s.cap < goal && Math.random() < GROWTH_PER_DAY) s.cap++;
    if (s.people < s.cap && Math.random() < .4) s.people++;
    const rank = SCALE_RANK[scaleOf(s.people)];
    if (!Number.isFinite(s.rank)) s.rank = rank;
    if (rank > s.rank) { s.rank = rank; logWorld(s.name + ' has grown into a ' + scaleOf(s.people) + ' of ' + s.people + ' people.', 'gold', s.id); }
  }
}
// What the world has been up to, newest first: it fills the world-logs tab of the menu.
function logWorld(text, cls, id) {
  if (!state.worldLog) state.worldLog = [];
  state.worldLog.unshift({ day: state.day, t: text, cls: cls || '', id: id || null });
  if (state.worldLog.length > 150) state.worldLog.length = 150;
}

// ---------------------------------------------------------------- buildings you can see around a settlement
// The people a settlement needs before it has each building (the same offsets as around Brackenford).
const MARK_AT = { market: 0, garden: 0, well: 0, lumberMill: 5, huntersLodge: 5, longhouse: 5, smithy: 8, barracks: 8, fishingHut: 8, jeweler: 11, mine: 11, caravanPost: 13, warehouse: 25 };
function recordOf(id) {
  if (!id || id === 'home') return state.cur ? state.parked : state;
  return state.cur === id ? state : (state.colonies && state.colonies[id]) || null;
}
function marksOf(s) {
  if (s.owner === 'player') { const rec = recordOf(s.id); return rec ? BUILDING_MARKS.filter(b => rec.built[b.key]) : []; }
  const list = BUILDING_MARKS.filter(b => b.key in MARK_AT && s.people >= MARK_AT[b.key]);
  return s.wreck > 0 ? list.slice(0, Math.max(0, list.length - s.wreck)) : list;
}
let markCache = null;
function refreshMarks() {
  markCache = new Map();
  const add = (cx, cy, list, visible, id) => { for (const b of list) markCache.set((cx + b.dx) + ',' + (cy + b.dy), { key: b.key, icon: b.icon, id, visible }); };
  add(HOME.x, HOME.y, BUILDING_MARKS.filter(b => (recordOf('home').built || {})[b.key]), true, 'home');
  for (const s of settlements) add(s.x, s.y, marksOf(s), !!s.discovered, s.id);
}
// The building standing on a tile you can see, if any; markTile is the same for every settlement, seen or not.
function markAt(x, y) { if (!markCache) refreshMarks(); const m = markCache.get(x + ',' + y); return m && m.visible ? m : null; }
function markTile(x, y) { if (!markCache) refreshMarks(); return markCache.get(x + ',' + y) || null; }
// Ground around a settlement is cleared so its buildings stand on grass.
function clearGrounds() {
  for (const s of settlements) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (overworld[y] && ['♣', '≈', '▲'].includes(overworld[y][x]) && Math.max(Math.abs(dx), Math.abs(dy)) <= 3) overworld[y][x] = '.';
  }
}
// Their citizens go about on the map in numbers that follow the population.
function npcWorkers(s) { return clamp(Math.ceil(peopleOf(s) / 3), 2, 9); }
