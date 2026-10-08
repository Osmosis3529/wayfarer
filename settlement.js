// Settlement mode: a detailed map of Brackenford that you can walk around, buildings you can enter, citizens with jobs
// and walking routes, and the upgrade / evolution system. Loaded before the main script; everything here runs from
// events, so it can use the main script's globals (state, say, showDialog, render, ...) at call time.

// ---------------------------------------------------------------- layout
const TOWN_W = 60, TOWN_H = 40;
// Footprints, doors (always on the bottom row) and the road tile in front of each door.
const TOWN_PLOTS = {
  hut:          { x0: 26, y0: 9,  x1: 33, y1: 13, door: [29, 13], front: [29, 14] },
  market:       { x0: 37, y0: 10, x1: 42, y1: 13, door: [39, 13], front: [39, 14] },
  smithy:       { x0: 45, y0: 10, x1: 50, y1: 13, door: [47, 13], front: [47, 14] },
  mine:         { x0: 52, y0: 10, x1: 57, y1: 13, door: [54, 13], front: [54, 14] },
  garden:       { x0: 12, y0: 10, x1: 16, y1: 13, door: [14, 13], front: [14, 14] },
  beacon:       { x0: 28, y0: 3,  x1: 31, y1: 6,  door: [29, 6],  front: [29, 7] },
  huntersLodge: { x0: 5,  y0: 15, x1: 10, y1: 18, door: [7, 18],  front: [7, 19] },
  gemHall:      { x0: 39, y0: 15, x1: 44, y1: 18, door: [41, 18], front: [41, 19] },
  barracks:     { x0: 46, y0: 15, x1: 52, y1: 18, door: [49, 18], front: [49, 19] },
  fishingHut:   { x0: 5,  y0: 22, x1: 10, y1: 25, door: [7, 25],  front: [7, 26] },
  tannery:      { x0: 13, y0: 22, x1: 18, y1: 25, door: [15, 25], front: [15, 26] },
  lumberMill:   { x0: 37, y0: 22, x1: 42, y1: 25, door: [39, 25], front: [39, 26] },
  huntingCamp:  { x0: 45, y0: 22, x1: 50, y1: 25, door: [47, 25], front: [47, 26] },
  well:         { x0: 29, y0: 21, x1: 30, y1: 22, door: [29, 22], front: [29, 23] }
};
// Where gatherers walk to and from.
const TOWN_WORKSITES = { garden: [14, 8], lumberMill: [41, 31], huntingCamp: [49, 31], fishingHut: [7, 34], mine: [54, 9] };
// Soldiers patrol this loop around the plaza.
const TOWN_PATROL = [[24, 14], [35, 14], [35, 26], [24, 26]];
const TOWN_START = [29, 37];
const TOWN_GLYPHS = { grass: '.', road: '▒', plaza: '▓', crops: '≡', tree: '♣', water: '≈', hill: '▲', body: '▣', door: '▤', wall: '#', gate: '▼' };
const TOWN_SOLID = new Set(['#', '≈', '▲', '♣', '▣', '▤']);

function townHash(x, y) { return (Math.imul(x + 7, 73856093) ^ Math.imul(y + 13, 19349663)) >>> 0; }

function buildTownMap() {
  const g = Array.from({ length: TOWN_H }, () => Array(TOWN_W).fill('.'));
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  rect(44, 1, 58, 8, '▲'); rect(4, 2, 22, 9, '≡'); rect(2, 35, 20, 38, '≈'); rect(34, 29, 58, 38, '♣');
  rect(41, 27, 41, 33, '.'); rect(40, 30, 42, 32, '.'); rect(49, 27, 49, 33, '.'); rect(48, 30, 50, 32, '.');
  for (const [x0, y0, x1, y1] of [[3, 14, 56, 14], [3, 19, 56, 19], [3, 26, 56, 26], [29, 14, 30, 38], [24, 7, 25, 14], [24, 7, 31, 7]]) rect(x0, y0, x1, y1, '▒');
  rect(24, 15, 35, 25, '▓');
  // A few trees in the quiet corners (never on routes).
  for (const [x0, y0, x1, y1] of [[1, 1, 2, 38], [19, 15, 23, 18], [19, 20, 23, 25], [34, 2, 42, 8], [11, 29, 28, 33], [31, 27, 33, 38], [1, 27, 4, 33]]) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y][x] === '.' && townHash(x, y) % 100 < 38) g[y][x] = '♣';
  }
  for (const p of Object.values(TOWN_PLOTS)) { rect(p.x0, p.y0, p.x1, p.y1, '▣'); g[p.door[1]][p.door[0]] = '▤'; }
  for (let x = 0; x < TOWN_W; x++) { g[0][x] = '#'; g[TOWN_H - 1][x] = '#'; }
  for (let y = 0; y < TOWN_H; y++) { g[y][0] = '#'; g[y][TOWN_W - 1] = '#'; }
  g[TOWN_H - 1][29] = '▼'; g[TOWN_H - 1][30] = '▼';
  return g;
}
let townMap = null;
function getTownMap() { return townMap || (townMap = buildTownMap()); }
function townWalkable(g) { return g === '.' || g === '▒' || g === '▓' || g === '≡'; }
function plotAtDoor(x, y) { for (const [k, p] of Object.entries(TOWN_PLOTS)) if (p.door[0] === x && p.door[1] === y) return k; return null; }
function plotContaining(x, y) { for (const [k, p] of Object.entries(TOWN_PLOTS)) if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return k; return null; }

// Breadth-first path between two tiles (4-directional), cached.
const townPathCache = new Map();
function townPath(from, to) {
  const key = from + '>' + to;
  if (townPathCache.has(key)) return townPathCache.get(key).slice();
  const m = getTownMap(), prev = new Map(), q = [from], id = (x, y) => y * TOWN_W + x;
  prev.set(id(from[0], from[1]), null);
  let found = false;
  for (let h = 0; h < q.length && !found; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (!m[ny] || !townWalkable(m[ny][nx]) || prev.has(id(nx, ny))) continue;
      prev.set(id(nx, ny), [x, y]);
      if (nx === to[0] && ny === to[1]) { found = true; break; }
      q.push([nx, ny]);
    }
  }
  if (!found && !(from[0] === to[0] && from[1] === to[1])) { townPathCache.set(key, []); return []; }
  const path = []; let cur = [to[0], to[1]];
  while (cur && !(cur[0] === from[0] && cur[1] === from[1])) { path.unshift(cur); cur = prev.get(id(cur[0], cur[1])); }
  townPathCache.set(key, path);
  return path.slice();
}

// ---------------------------------------------------------------- economy: tiers, upgrades, jobs
const HALL_NAMES = ['Longhouse', 'Town Hall', 'City Hall'];
function hallName() { return HALL_NAMES[(state.town.tier || 1) - 1]; }
const BUILDING_NAMES = { hut: 'Hall', market: 'Trading post', garden: 'Farm', well: 'Well', smithy: 'Smithy', huntersLodge: 'Hunters’ lodge', gemHall: 'Gem hall', lumberMill: 'Lumber mill', mine: 'Mine', tannery: 'Tannery', fishingHut: 'Fishing hut', huntingCamp: 'Hunting camp', barracks: 'Barracks', beacon: 'Wayfarer’s Beacon' };
function buildingName(key) { return key === 'hut' ? hallName() : BUILDING_NAMES[key]; }
const UPGRADE_KEYS = ['hut', 'market', 'garden', 'well', 'smithy', 'huntersLodge', 'gemHall', 'lumberMill', 'mine', 'tannery', 'fishingHut', 'huntingCamp', 'barracks'];
const JOB_KEYS = UPGRADE_KEYS.filter(k => k !== 'hut');
const JOB_TITLES = { market: 'Trader', garden: 'Farmhand', well: 'Well keeper', smithy: 'Blacksmith', huntersLodge: 'Lodge keeper', gemHall: 'Broker', lumberMill: 'Lumberjack', mine: 'Miner', tannery: 'Tanner', fishingHut: 'Fisher', huntingCamp: 'Hunter', barracks: 'Soldier', idle: 'Citizen' };
const PRODUCERS = new Set(['lumberMill', 'mine', 'tannery', 'fishingHut', 'huntingCamp', 'garden', 'well', 'gemHall']);
const TIER_NAMES = ['', 'Village', 'Town', 'City'];

function ensureSettlementState() {
  if (!state.assign) state.assign = {};
  if (!state.up) state.up = {};
  if (state.assignReady) return;
  state.assignReady = true;
  // Saves from before citizens had jobs: staff the existing buildings, one citizen each, until people run out.
  for (const k of JOB_KEYS) if (state.built[k] && !state.assign[k] && unassigned() > 0) state.assign[k] = 1;
}
function housingCap() { return state.built.hut ? [8, 16, 28][(state.town.tier || 1) - 1] : 2; }
function capacity(key) {
  if (!state.built[key]) return 0;
  if (key === 'barracks') return Infinity;
  if (key === 'hut' || key === 'beacon') return 0;
  return (PRODUCERS.has(key) && key !== 'gemHall' && key !== 'well' ? 2 : 1) * (state.town.tier || 1);
}
function crew(key) { return state.built[key] ? Math.max(0, (state.assign && state.assign[key]) || 0) : 0; }
function employed() { return JOB_KEYS.reduce((n, k) => n + crew(k), 0); }
function unassigned() { return Math.max(0, state.town.people - employed()); }
function autoAssign(key) { if (unassigned() > 0 && crew(key) < capacity(key)) state.assign[key] = crew(key) + 1; }
function assignWorker(key, delta) {
  ensureSettlementState();
  const cur = crew(key);
  if (delta > 0 && (unassigned() < 1 || cur >= capacity(key))) return;
  if (delta < 0 && cur < 1) return;
  state.assign[key] = cur + delta;
  syncTownPeople(); render(); if (typeof citizensDialog === 'function' && document.getElementById('overlay').style.display === 'grid') citizensDialog();
}
function upgradeCost(key, tier = state.town.tier || 1) {
  const m = [1, 2, 3][tier - 1] || 3, out = {};
  for (const [k, v] of Object.entries(BUILD_COSTS[key])) if (k !== 'sunstone') out[k] = Math.ceil(v * m);
  return out;
}
function hasUpgrade(key, tier = state.town.tier || 1) { return !!(state.up[key] && state.up[key][tier - 1]); }
function upgradesBought(key) { return (state.up[key] || []).filter(Boolean).length; }
function upMult(key) { return 1 + 0.5 * upgradesBought(key); }
function tierProgress() { return UPGRADE_KEYS.filter(k => state.built[k] && hasUpgrade(k)).length; }
function costText(cost) { return Object.entries(cost).map(([k, v]) => v + ' ' + (k === 'wood' ? 'wood' : itemNames[k].toLowerCase())).join(', '); }
function canAfford(cost) { return Object.entries(cost).every(([k, v]) => state.inv[k] >= v); }
function checkEvolve() {
  const tier = state.town.tier || 1;
  if (tierProgress() < UPGRADE_KEYS.length) return;
  if (tier < 3) {
    state.town.tier = tier + 1;
    say('Every upgrade is bought. Brackenford grows into a ' + TIER_NAMES[tier + 1] + '! The ' + HALL_NAMES[tier - 1] + ' becomes a ' + HALL_NAMES[tier] + ', buildings hold more workers, and a new round of costlier upgrades opens.', 'gold');
  } else if (!state.town.maxed) {
    state.town.maxed = true;
    say('Every upgrade is bought. Brackenford is a fully evolved City.', 'gold');
  }
}
function buyUpgrade(key) {
  ensureSettlementState();
  const tier = state.town.tier || 1;
  if (!state.built[key] || hasUpgrade(key, tier)) return;
  const cost = upgradeCost(key, tier);
  if (!canAfford(cost)) { say('The ' + buildingName(key).toLowerCase() + ' upgrade needs ' + costText(cost) + '.', 'alert'); upgradesDialog(); return; }
  for (const [k, v] of Object.entries(cost)) state.inv[k] -= v;
  state.up[key] = state.up[key] || [false, false, false];
  state.up[key][tier - 1] = true;
  say(buildingName(key) + ' upgraded: its workers produce ' + Math.round(upMult(key) * 100) + '% as much.', 'gold');
  checkEvolve();
  syncTownPeople(); render(); upgradesDialog();
}

// ---------------------------------------------------------------- citizens in the settlement
const TOWN_NAMES = ['Mara', 'Rowan', 'Tilda', 'Eren', 'Sola', 'Hale', 'Mira', 'Doss', 'Tomas', 'Elsa', 'Perrin', 'Sella', 'Jory', 'Olan', 'Tess', 'Harlan', 'Dara', 'Borin', 'Veya', 'Rusk', 'Mina', 'Orrin', 'Lysa', 'Corren', 'Bram', 'Nella', 'Keza', 'Dren', 'Fen', 'Salla', 'Hobb', 'Wren', 'Isolde', 'Garrick', 'Pell', 'Anwen', 'Torin', 'Maeve', 'Bryn', 'Cassia', 'Dunstan', 'Ebba', 'Fenwick', 'Greta', 'Holt', 'Ilsa', 'Jarek', 'Kestrel'];
let townPeople = [];
function personName(i) { return TOWN_NAMES[i % TOWN_NAMES.length] + (i >= TOWN_NAMES.length ? ' ' + ['II', 'III', 'IV', 'V'][Math.floor(i / TOWN_NAMES.length) - 1] : ''); }
function homeSpot(job, idx) {
  if (job === 'idle') return [26 + (idx % 8), 16 + (idx % 9)];
  if (job === 'barracks') return TOWN_PATROL[idx % TOWN_PATROL.length];
  return TOWN_PLOTS[job].front;
}
function targetsFor(job, idx) {
  if (job === 'idle') return [[26 + (idx * 3) % 8, 16 + (idx * 5) % 9], [27 + (idx * 7) % 7, 17 + (idx * 2) % 7]];
  if (job === 'barracks') return TOWN_PATROL.map((_, k) => TOWN_PATROL[(k + idx) % TOWN_PATROL.length]);
  if (TOWN_WORKSITES[job]) return [TOWN_PLOTS[job].front, TOWN_WORKSITES[job]];
  return [TOWN_PLOTS[job].front, [28 + (idx % 6), 17 + (idx % 3)]];
}
function freeSpotNear(x, y, taken) {
  for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = x + dx, ny = y + dy;
    if (getTownMap()[ny] && townWalkable(getTownMap()[ny][nx]) && !taken.has(nx + ',' + ny)) return [nx, ny];
  }
  return [x, y];
}
function retarget(p, job) { p.job = job; p.targets = targetsFor(job, p.idx); p.ti = 0; p.path = []; p.wait = 0; }
// Keeps every citizen where they are; only people whose job changed get new routes.
function syncTownPeople() {
  ensureSettlementState();
  const total = Math.max(0, state.town.people), taken = new Set([state.x + ',' + state.y]);
  townPeople = townPeople.slice(0, total);
  for (const p of townPeople) taken.add(p.x + ',' + p.y);
  const left = {};
  for (const k of JOB_KEYS) if (crew(k) > 0) left[k] = crew(k);
  const free = [];
  for (const p of townPeople) { if (p.job !== 'idle' && left[p.job] > 0) left[p.job]--; else free.push(p); }
  while (townPeople.length < total) {
    const i = townPeople.length, p = { id: 'c' + i, name: personName(i), job: 'idle', idx: i, x: 0, y: 0, targets: [], ti: 0, path: [], wait: 0 };
    p.targets = targetsFor('idle', i);
    const [x, y] = freeSpotNear(...homeSpot('idle', i), taken); p.x = x; p.y = y; taken.add(x + ',' + y);
    townPeople.push(p); free.push(p);
  }
  const queue = [];
  for (const [k, n] of Object.entries(left)) for (let i = 0; i < n; i++) queue.push(k);
  const changed = new Set();
  for (const p of free) { const job = queue.shift() || 'idle'; if (p.job !== job) { p.job = job; changed.add(p); } }
  const seen = {};
  for (const p of townPeople) { p.idx = seen[p.job] = (seen[p.job] || 0) + 1; if (changed.has(p) || !p.targets.length) retarget(p, p.job); }
  return townPeople;
}
function personAt(x, y) { return townPeople.find(p => p.x === x && p.y === y) || null; }
function townPeopleMap() { const m = new Map(); for (const p of townPeople) m.set(p.x + ',' + p.y, p); return m; }
function moveTownPeople() {
  const taken = new Set(townPeople.map(p => p.x + ',' + p.y));
  taken.add(state.x + ',' + state.y);
  for (const p of townPeople) {
    if (p.wait > 0) { p.wait--; continue; }
    if (!p.path.length) {
      p.ti = (p.ti + 1) % p.targets.length;
      p.path = townPath([p.x, p.y], p.targets[p.ti]);
      p.wait = 1 + (townHash(p.x + p.ti, p.y + state.day) % 4);
      continue;
    }
    const [nx, ny] = p.path[0], key = nx + ',' + ny;
    if (taken.has(key)) continue;
    taken.delete(p.x + ',' + p.y); taken.add(key);
    noteStep(p.id, nx - p.x);
    p.x = nx; p.y = ny; p.path.shift();
  }
}

// ---------------------------------------------------------------- entering and leaving
function enterTown() {
  ensureSettlementState();
  state.zone = 'town'; state.site = null; state.returnPoint = null; state.view = 'explore';
  map = getTownMap(); state.x = TOWN_START[0]; state.y = TOWN_START[1];
  syncTownPeople();
  say('You walk into Brackenford. Bump a building door (or press E beside it) to go in; talk to anyone by walking into them.', 'gold');
  render();
}
function exitTown() {
  if (state.zone !== 'town') return;
  closeDialog();
  map = overworld; state.zone = 'overworld'; state.x = HOME.x; state.y = HOME.y; state.view = 'explore';
  say('You leave Brackenford for the wilds.');
  render();
}
function townBump(nx, ny) {
  const c = map[ny] && map[ny][nx];
  if (c === '▼') { exitTown(); return true; }
  if (c === '▤') { const k = plotAtDoor(nx, ny); if (k) openBuilding(k); return true; }
  const p = personAt(nx, ny);
  if (p) { talkTo(p); return true; }
  return false;
}
function townInteract() {
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const x = state.x + dx, y = state.y + dy, c = map[y] && map[y][x];
    if (c === '▼') { exitTown(); return true; }
    if (c === '▤') { const k = plotAtDoor(x, y); if (k) { openBuilding(k); return true; } }
  }
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const p = personAt(state.x + dx, state.y + dy); if (p) { talkTo(p); return true; } }
  say('Nothing to interact with here. Walk into a door or a person.');
  render();
  return true;
}

// ---------------------------------------------------------------- dialogs
function bld(key) { return buildingName(key); }
const TALK = {
  hut: ['The hall hums with business. Every upgrade we buy makes Brackenford stronger.', 'Keep the pantry full and the newcomers keep coming.'],
  market: ['Best prices in the Briarwood, friend. Mostly.', 'I buy anything that isn’t nailed down, and some things that are.'],
  garden: ['The soil here is kind. Bring me a hand to help and the fields will do the rest.', 'Berries sweeten up the pantry better than anything.'],
  well: ['Cold water, free for anyone who needs it.', 'A well is the heart of a town. Mind the bucket.'],
  smithy: ['Bring me iron and furs and I’ll make you something worth wearing.', 'A good blade is worth a day’s patience.'],
  huntersLodge: ['The lodge teaches endurance. Furs are always welcome.', 'The wilds reward the patient.'],
  gemHall: ['Gems, silver, gold: everything has a price here.', 'Bring me something that sparkles.'],
  lumberMill: ['The groves keep growing back if you treat them kindly.', 'Timber’s the backbone of any town.'],
  mine: ['Deep down, the seams run richer. Mind the dark.', 'Stone and iron, day in and day out.'],
  tannery: ['Good leather takes time. Bring furs and I’ll buy them fairly.', 'A fox’s molt is worth more than you’d think.'],
  fishingHut: ['The lake is generous this season.', 'A day on the water feeds half the town.'],
  huntingCamp: ['We bring in game when we can. Keep the camp staffed.', 'The woods are quiet, then they’re not.'],
  barracks: ['The soldiers keep the road safe. Pay them in good gear.', 'Assign more citizens and the patrol grows.'],
  idle: ['I’m between jobs. Ask the steward in the hall to give me work.', 'Just enjoying the plaza.', 'Nothing to do but wait for a post.']
};
function talkLine(p) {
  const lines = TALK[p.job] || TALK.idle, pick = lines[(townHash(p.idx + state.day, p.id.length) % lines.length)];
  const extra = [];
  if (state.starving) extra.push('We’re going hungry. Please, bring food.');
  else if (state.town.food < state.town.people * 2) extra.push('The pantry is running low.');
  if (typeof miniBossSites === 'function' && !state.keepRevealed) extra.push('Travelers whisper about guardians in far dungeons, mines and caves, holding ancient relics.');
  if (typeof goalHint === 'function' && townHash(p.idx, state.day) % 3 === 0) extra.push(goalHint());
  return pick + (extra.length ? ' ' + extra[townHash(p.idx + 3, state.day) % extra.length] : '');
}
function talkTo(p) {
  showDialog('<h2>' + esc(p.name) + '</h2><p><em>' + esc(JOB_TITLES[p.job] || 'Citizen') + '</em></p><p>' + esc(talkLine(p)) + '</p><button onclick="closeDialog()">Goodbye</button>');
}
function jobsAt(key) { return townPeople.filter(p => p.job === key); }
function staffBlock(key) {
  const staff = jobsAt(key);
  if (!staff.length) return '<p>Nobody works here yet. Assign a citizen in the ' + hallName().toLowerCase() + '.</p>';
  return '<h3>' + (JOB_TITLES[key] || 'Staff') + (staff.length > 1 ? 's' : '') + '</h3>' + staff.map(p => '<button onclick="talkTo(townPeople.find(q=>q.id===\'' + p.id + '\'))">Talk to ' + esc(p.name) + '</button>').join('');
}
function buildPrompt(key) {
  const cost = BUILD_COSTS[key];
  const gated = { smithy: !state.unlocked.smithy, huntersLodge: !state.unlocked.huntersLodge, gemHall: !state.unlocked.gemHall }[key];
  let tail;
  if (gated) tail = '<p>You need the right materials first: ' + ({ smithy: 'copper or iron', huntersLodge: 'furs', gemHall: 'gems' }[key]) + '.</p>';
  else if (key === 'beacon' && ((state.town.tier || 1) < 3 || !state.inv.sunstone)) tail = '<p>The Beacon needs a City and a Sunstone from the Hollow King. Cost: ' + costLabel(key) + '.</p>';
  else tail = '<button ' + (canAfford(cost) ? '' : 'disabled') + ' onclick="closeDialog();build(\'' + key + '\');if(state.built[\'' + key + '\'])openBuilding(\'' + key + '\')">Build · ' + costLabel(key) + '</button>';
  showDialog('<h2>Empty plot</h2><p>A fenced lot waits for a ' + bld(key).toLowerCase() + '.</p>' + tail + '<button onclick="closeDialog()">Leave</button>');
}
function openBuilding(key) {
  if (!state.built[key]) { buildPrompt(key); return; }
  syncTownPeople();
  const svc = SERVICES[key];
  if (svc) svc(key);
}
function shopPrice(key, item, side) {
  const spec = SHOP_SPECIALTY[key] || [], base = (side === 'buy' ? buyPrices : sellPrices)[item];
  let p = base;
  if (spec.includes(item)) p = side === 'buy' ? Math.max(1, Math.round(base * .85)) : Math.round(base * 1.2);
  return Math.max(1, p);
}
const SHOP_SPECIALTY = { lumberMill: ['wood'], mine: ['stone', 'copper', 'iron'], tannery: ['furs'], garden: ['berries'], huntersLodge: ['furs'], gemHall: ['gems', 'silver', 'gold'] };
const SHOP_GOODS = {
  market: { buy: ['berries', 'wood', 'stone', 'copper', 'iron', 'silver', 'gold', 'furs', 'gems'], sell: ['berries', 'wood', 'stone', 'copper', 'iron', 'silver', 'gold', 'furs', 'gems', 'relic'] },
  lumberMill: { buy: ['wood'], sell: ['wood'] },
  mine: { buy: ['stone', 'copper', 'iron', 'silver', 'gold'], sell: ['stone', 'copper', 'iron', 'silver', 'gold', 'gems'] },
  tannery: { buy: ['furs'], sell: ['furs'] },
  garden: { buy: ['berries'], sell: ['berries'] },
  huntersLodge: { buy: ['furs'], sell: ['furs'] },
  gemHall: { buy: ['gems', 'silver', 'gold'], sell: ['gems', 'silver', 'gold', 'relic'] }
};
function shopDialog(key, extra = '') {
  const goods = SHOP_GOODS[key], open = jobsAt(key).length > 0;
  let body = staffBlock(key);
  if (open) {
    body += (goods.buy.length ? '<h3>Buy</h3>' + goods.buy.map(k => '<button onclick="shopAction(\'' + key + '\',\'buy\',\'' + k + '\')">Buy ' + itemNames[k] + ' · ' + shopPrice(key, k, 'buy') + ' coin</button>').join('') : '') +
      '<h3>Sell</h3>' + goods.sell.map(k => '<button onclick="shopAction(\'' + key + '\',\'sell\',\'' + k + '\')">Sell ' + itemNames[k] + ' · ' + shopPrice(key, k, 'sell') + ' coin</button>').join('') + extra;
  }
  showDialog('<h2>' + esc(bld(key)) + '</h2>' + body + '<button onclick="closeDialog()">Leave</button>');
}
function shopAction(key, side, item) {
  if (side === 'buy') {
    const price = shopPrice(key, item, 'buy');
    if (state.coin < price) { say('You need ' + price + ' coin for that.', 'alert'); }
    else { state.coin -= price; state.inv[item]++; unlockByMaterial(item); say('You buy ' + itemNames[item].toLowerCase() + ' for ' + price + ' coin.', 'gold'); }
  } else {
    if (!state.inv[item]) { say('You have no ' + itemNames[item].toLowerCase() + ' to sell.', 'alert'); }
    else { const price = shopPrice(key, item, 'sell'); state.inv[item]--; state.coin += price; say('You sell ' + itemNames[item].toLowerCase() + ' for ' + price + ' coin.', 'gold'); }
  }
  render(); openBuilding(key);
}
function mealsDialog(key) {
  const open = jobsAt(key).length > 0;
  let body = staffBlock(key);
  if (open) body += '<p>The pantry holds ' + state.town.food + ' meals.</p><button onclick="buyMeals(\'' + key + '\',1)">Buy 1 meal for the pantry · 2 coin</button><button onclick="buyMeals(\'' + key + '\',5)">Buy 5 meals · 9 coin</button>';
  showDialog('<h2>' + esc(bld(key)) + '</h2>' + body + '<button onclick="closeDialog()">Leave</button>');
}
function buyMeals(key, n) {
  const cost = n === 1 ? 2 : 9;
  if (state.coin < cost) { say('You need ' + cost + ' coin.', 'alert'); render(); mealsDialog(key); return; }
  state.coin -= cost; state.town.food += n; say('The pantry gains ' + n + ' meal' + (n > 1 ? 's' : '') + '.', 'gold');
  render(); mealsDialog(key);
}
function wellDialog(key) {
  const open = jobsAt(key).length > 0;
  let body = staffBlock(key);
  if (open) body += '<button onclick="drinkWell()">Drink from the well · heal 2 hearts</button>';
  showDialog('<h2>' + esc(bld(key)) + '</h2>' + body + '<button onclick="closeDialog()">Leave</button>');
}
function drinkWell() {
  if (state.wellDay === state.day) { say('The well keeper says the bucket needs time to refill (once a day).', 'alert'); render(); return; }
  state.wellDay = state.day; state.hp = Math.min(state.maxHp, state.hp + 2); say('Cool water restores your strength.', 'gold'); render(); closeDialog();
}
function smithyDialog(key) {
  const open = jobsAt(key).length > 0;
  if (!open) { showDialog('<h2>' + esc(bld(key)) + '</h2>' + staffBlock(key) + '<button onclick="closeDialog()">Leave</button>'); return; }
  openSmithy();
}
function mineDialog(key) { shopDialog(key, '<h3>The shaft</h3><button onclick="closeDialog();exitToMine()">Descend into Brackenford Mine · ' + homeMine.maxDepth + ' levels</button>'); }
function exitToMine() { map = overworld; state.zone = 'overworld'; state.x = HOME.x; state.y = HOME.y; enterInstance(homeMine, 'mine'); }
function barracksDialog(key) {
  const soldiers = crew('barracks');
  showDialog('<h2>' + esc(bld(key)) + '</h2>' + staffBlock(key) + '<p>' + soldiers + ' of ' + state.town.people + ' citizens serve as soldiers. Assign more from the ' + esc(hallName().toLowerCase()) + '.</p><button onclick="closeDialog()">Leave</button>');
}
function beaconDialog() { showDialog('<h2>' + esc(bld('beacon')) + '</h2><p>The Beacon stands lit over Brackenford.</p><button onclick="closeDialog()">Leave</button>'); }
function hallDialog() {
  const tier = state.town.tier || 1, prog = tierProgress(), goal = UPGRADE_KEYS.length;
  showDialog('<h2>' + esc(hallName()) + '</h2><p><strong>' + TIER_NAMES[tier] + '</strong> · ' + state.town.people + ' / ' + housingCap() + ' citizens · ' + unassigned() + ' without work · pantry ' + state.town.food + ' meals' + (state.starving ? ' (starving!)' : '') + '</p>' +
    '<p>Upgrades this tier: ' + prog + ' / ' + goal + (tier < 3 ? '. Buy them all and Brackenford evolves.' : (state.town.maxed ? '. Fully evolved.' : '. Buy them all to complete the City.')) + '</p>' +
    '<button onclick="upgradesDialog()">Settlement upgrades</button><button onclick="citizensDialog()">Citizens and jobs</button><button onclick="hallRest()">Rest here · free</button><button onclick="closeDialog()">Leave</button>');
}
function hallRest() { state.hp = state.maxHp; say('You rest in the ' + hallName().toLowerCase() + ' and recover all hearts.', 'gold'); render(); closeDialog(); }
function upgradesDialog() {
  ensureSettlementState();
  const tier = state.town.tier || 1;
  const rows = UPGRADE_KEYS.map(k => {
    if (!state.built[k]) return '<div class="up-row"><span>' + esc(bld(k)) + '</span><em>not built yet</em></div>';
    if (hasUpgrade(k, tier)) return '<div class="up-row done"><span>' + esc(bld(k)) + '</span><em>✓ upgraded</em></div>';
    const cost = upgradeCost(k, tier);
    return '<div class="up-row"><span>' + esc(bld(k)) + '</span><button ' + (canAfford(cost) ? '' : 'disabled') + ' onclick="buyUpgrade(\'' + k + '\')">Upgrade · ' + costText(cost) + '</button></div>';
  }).join('');
  const total = JOB_KEYS.reduce((n, k) => n + upgradesBought(k), 0) + upgradesBought('hut');
  showDialog('<h2>Settlement upgrades</h2><p>Tier ' + tier + ' (' + TIER_NAMES[tier] + '): ' + tierProgress() + ' / ' + UPGRADE_KEYS.length + ' bought. ' + (tier < 3 ? 'Every one of them evolves Brackenford to a ' + TIER_NAMES[tier + 1] + ', then a costlier set opens.' : 'This is the last tier.') + '</p><p>Each upgrade makes that building’s workers produce 50% more, permanently (' + total + ' bought so far).</p>' + rows + '<button onclick="hallDialog()">Back</button><button onclick="closeDialog()">Leave</button>');
}
function citizensDialog() {
  ensureSettlementState();
  const rows = JOB_KEYS.filter(k => state.built[k]).map(k => {
    const cap = capacity(k), shown = cap === Infinity ? '' : ' / ' + cap;
    return '<div class="up-row"><span>' + esc(bld(k)) + ' · ' + JOB_TITLES[k] + '</span><span><button onclick="assignWorker(\'' + k + '\',-1)">−</button> <b>' + crew(k) + shown + '</b> <button onclick="assignWorker(\'' + k + '\',1)">+</button></span></div>';
  }).join('') || '<p>No buildings to staff yet. Build something first.</p>';
  showDialog('<h2>Citizens and jobs</h2><p>' + state.town.people + ' citizens · ' + unassigned() + ' without work. Workers walk between their building and their worksite; soldiers patrol the roads. Production is per worker.</p>' + rows + '<button onclick="hallDialog()">Back</button><button onclick="closeDialog()">Leave</button>');
}
const SERVICES = {
  hut: () => hallDialog(),
  market: k => shopDialog(k),
  lumberMill: k => shopDialog(k),
  tannery: k => shopDialog(k),
  garden: k => shopDialog(k),
  huntersLodge: k => shopDialog(k),
  gemHall: k => shopDialog(k),
  mine: k => mineDialog(k),
  fishingHut: k => mealsDialog(k),
  huntingCamp: k => mealsDialog(k),
  well: k => wellDialog(k),
  smithy: k => smithyDialog(k),
  barracks: k => barracksDialog(k),
  beacon: () => beaconDialog()
};

// ---------------------------------------------------------------- the tile painter used by the sprite renderer
function drawTownCell(ctx, c, x, y, px, py, frame) {
  const T = GFX.T;
  if (c === '▣' || c === '▤') {
    const key = plotContaining(x, y), p = TOWN_PLOTS[key];
    GFX.townPlot(ctx, key, !!state.built[key], x - p.x0, y - p.y0, p.x1 - p.x0 + 1, p.y1 - p.y0 + 1, c === '▤', px, py, state.town.tier || 1, p.door[0] - p.x0);
    return;
  }
  const edges = c === '≈' ? 0 : (map[y - 1] && map[y - 1][x] === '≈' ? 1 : 0) | (map[y + 1] && map[y + 1][x] === '≈' ? 2 : 0) | (map[y] && map[y][x - 1] === '≈' ? 4 : 0) | (map[y] && map[y][x + 1] === '≈' ? 8 : 0);
  GFX.townTile(ctx, c, x, y, px, py, frame, edges);
}

const TOWN_MS = 450;
function townMove(dx, dy) {
  if (dx) facing = dx;
  const nx = state.x + dx, ny = state.y + dy, c = map[ny] && map[ny][nx];
  if (c === undefined) return;
  if (townBump(nx, ny) || TOWN_SOLID.has(c)) return;
  state.x = nx; state.y = ny; noteStep('player', dx);
  render();
}

// Daily output of a building: crew x per-worker rate x upgrade bonus, cut by starvation.
function dailyOutput(key, perWorker) {
  const n = crew(key);
  if (!n) return 0;
  const v = Math.max(1, Math.round(n * perWorker * upMult(key)));
  return state.starving ? Math.max(1, Math.round(v * .25)) : v;
}

function renderTown() {
  ensureSettlementState();
  const tier = state.town.tier || 1, built = Object.values(state.built).filter(Boolean).length, goal = UPGRADE_KEYS.length;
  const evo = tier < 3 || !state.town.maxed ? tierProgress() + ' / ' + goal + ' upgrades' : 'Fully evolved';
  document.getElementById('town-stats').innerHTML =
    '<div class="town-metric">Settlement<b>' + TIER_NAMES[tier] + ' · ' + hallName() + '</b></div>' +
    '<div class="town-metric">Evolution<b>' + evo + '</b></div>' +
    '<div class="town-metric">Citizens<b>' + state.town.people + ' / ' + housingCap() + '</b></div>' +
    '<div class="town-metric">Employed<b>' + employed() + ' · ' + unassigned() + ' without work</b></div>' +
    '<div class="town-metric">Pantry<b>' + state.town.food + ' meals' + (state.starving ? ' · starving' : '') + '</b></div>' +
    '<div class="town-metric">Projects<b>' + built + ' / ' + Object.keys(state.built).length + ' built</b></div>';
  const rows = JOB_KEYS.filter(k => crew(k) > 0).map(k => '<div class="town-person"><b>' + esc(JOB_TITLES[k]) + (crew(k) > 1 ? ' ×' + crew(k) : '') + '</b><span>' + esc(buildingName(k)) + '</span></div>');
  if (unassigned() > 0) rows.push('<div class="town-person"><b>Citizen ×' + unassigned() + '</b><span>Waiting for work · assign at the ' + esc(hallName().toLowerCase()) + '</span></div>');
  document.getElementById('townfolk').innerHTML = rows.join('');
  const hints = [goalHint()];
  hints.push(state.built.hut ? 'Walk into a building to go inside, talk to its workers and use its services. The ' + hallName().toLowerCase() + ' assigns jobs and sells upgrades.' : 'Build the longhouse first: it raises the citizen limit and lets you assign jobs and buy upgrades.');
  if (!state.unlocked.smithy) hints.push('Find or buy copper or iron to unlock the blacksmith.');
  if (!state.unlocked.huntersLodge) hints.push('Find or buy furs to unlock the hunters’ lodge.');
  if (!state.unlocked.gemHall) hints.push('Find or buy gems to unlock the gem hall.');
  hints.push('Buy every building upgrade of a tier and Brackenford evolves: the hall grows, buildings hold more workers, and a costlier round of upgrades opens. Each upgrade makes that building’s workers produce 50% more. Residents eat 1 meal a day; newcomers arrive while there is room and food.');
  if (state.built.barracks) hints.push('Soldiers are citizens assigned to the barracks. They patrol the roads and the wilds near home; a fallen soldier is replaced for 2 meals.');
  document.getElementById('town-hint').textContent = hints.join(' ');
}

// ---------------------------------------------------------------- drawing the settlement
function townView() { return [Math.max(0, Math.min(TOWN_W - 25, state.x - 12)), Math.max(0, Math.min(TOWN_H - 15, state.y - 7))]; }
function renderTownGfx(ctx, W, H, frame, now) {
  const T = GFX.T, [left, top] = townView(), folks = townPeopleMap();
  for (let j = 0; j < 15; j++) for (let i = 0; i < 25; i++) {
    const x = left + i, y = top + j, c = map[y] && map[y][x], px = i * T, py = j * T;
    if (c === undefined) { ctx.fillStyle = '#0b100d'; ctx.fillRect(px, py, T, T); continue; }
    drawTownCell(ctx, c, x, y, px, py, frame);
    const p = folks.get(x + ',' + y);
    if (x === state.x && y === state.y) { const pp = poseOf('player', now, 0); GFX.shadow(ctx, px, py); GFX.sprite(ctx, 'player', px, py, 1, facing < 0, pp); }
    else if (p) { const pp = poseOf(p.id, now, x * 3 + y); GFX.shadow(ctx, px, py); GFX.sprite(ctx, p.job === 'barracks' ? 'soldier' : GFX.workerKey(p.id), px, py, 1, pp.fx < 0, pp); }
  }
  ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.strokeStyle = '#14181a'; ctx.fillStyle = '#f3de8f';
  for (const [key, p] of Object.entries(TOWN_PLOTS)) {
    const cx = ((p.x0 + p.x1 + 1) / 2 - left) * T, cy = (p.y0 - top + (key === 'well' ? -0.2 : 1.1)) * T;
    if (cx < -40 || cx > W + 40 || cy < 0 || cy > H) continue;
    const label = state.built[key] ? buildingName(key) : 'Empty plot · ' + buildingName(key);
    ctx.strokeText(label, cx, cy); ctx.fillText(label, cx, cy);
  }
  ctx.fillStyle = '#ffffff';
  for (const q of townPeople) {
    if (Math.abs(q.x - state.x) + Math.abs(q.y - state.y) > 2) continue;
    const cx = (q.x - left + .5) * T, cy = (q.y - top) * T - 1;
    ctx.strokeText(q.name, cx, cy); ctx.fillText(q.name, cx, cy);
  }
  ctx.textAlign = 'start';
  const t = (state.dayClock || 0) / DAY_MS;
  GFX.tint(ctx, W, H, t < .55 ? 0 : t < .8 ? (t - .55) / .25 * .38 : t < .92 ? .38 : Math.max(0, (1 - t) / .08 * .38));
}
function townTextCell(x, y, c, folks) {
  if (x === state.x && y === state.y) return ['@', 'player'];
  const p = folks.get(x + ',' + y);
  if (p) return p.job === 'barracks' ? ['s', 'soldier'] : ['w', 'worker'];
  if (c === '▣') return state.built[plotContaining(x, y)] ? ['▣', 'town'] : ['░', 'fog'];
  if (c === '▤' || c === '▼') return [c, 'town'];
  return [c, c === '♣' ? 'tree' : c === '≈' ? 'water' : c === '▲' ? 'stone' : c === '≡' ? 'berry' : 'path'];
}
