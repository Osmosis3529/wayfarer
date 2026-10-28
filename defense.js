// Walls: a ring of wall around a settlement that raiders and monsters cannot cross until they have battered it down.
// Loaded after growth.js; like the other scripts it uses the main script's globals at call time.

// ---------------------------------------------------------------- the ring
// A village wall protects the 3 x 3 tiles around the middle and a town or city wall the 5 x 5, standing just outside them.
// Bigger settlements have stronger walls, and a city's are the strongest.
const WALL_HP = { village: 40, town: 90, city: 200 };
const WALL_REACH = { village: 2, town: 3, city: 3 };      // how many tiles from the middle the wall stands
const TIER_SCALE = ['village', 'town', 'city'];
function wallRing(cx, cy, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push([cx + dx, cy + dy]);
  return out;
}
// Every wall in the world: Brackenford's, each annexed settlement's, and those the other settlements have built for themselves.
function wallList() {
  const out = [], home = recordOf('home');
  const add = (id, x, y, scale, pct, visible, kind) => out.push({ id, x, y, scale, reach: WALL_REACH[scale], pct, max: WALL_HP[scale], visible, kind });
  if (home && home.built.walls) add('home', HOME.x, HOME.y, TIER_SCALE[(home.town.tier || 1) - 1], home.wallPct == null ? 1 : home.wallPct, true, 'home');
  for (const s of settlements) {
    if (s.owner === 'player') { const rec = recordOf(s.id); if (rec && rec.built.walls) add(s.id, s.x, s.y, TIER_SCALE[(rec.town.tier || 1) - 1], rec.wallPct == null ? 1 : rec.wallPct, !!s.discovered, 'colony'); }
    else if (s.walls) add(s.id, s.x, s.y, scaleOf(s.people), s.wallPct == null ? 1 : s.wallPct, !!s.discovered, 'npc');
  }
  return out;
}
let wallCache = null, homeWallNow = null;
function refreshWalls() {
  wallCache = new Map(); homeWallNow = null;
  for (const w of wallList()) {
    if (w.kind === 'home') homeWallNow = w;
    if (w.pct > 0) for (const [x, y] of wallRing(w.x, w.y, w.reach)) wallCache.set(x + ',' + y, w);
  }
}
// The standing wall on a tile (a breached one stops nothing); wallSeen is the same for walls you may see.
function wallAt(x, y) { if (!wallCache) refreshWalls(); return wallCache.get(x + ',' + y) || null; }
function wallSeen(x, y) { const w = wallAt(x, y); return w && w.visible ? w : null; }
// Wandering monsters and raiders stop at walls; the soldiers of settlements at war are already inside theirs.
function wallStops(foe) { return !foe.faction || foe.faction === 'raid'; }
function homeWall() { if (!wallCache) refreshWalls(); return homeWallNow; }
function wallHolds() { const w = homeWall(); return !!(w && w.pct > 0); }
// The home wall's tile next to this one, if there is one.
function wallTouching(x, y) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = wallAt(x + dx, y + dy); if (w && w.kind === 'home') return w; }
  return null;
}
// Hits take a share of the wall's strength; at zero it is breached and stops nothing until it is repaired.
function wallDamage(w, hp) {
  const target = w.kind === 'npc' ? townById(w.id) : recordOf(w.id);
  if (!target) return;
  const before = w.pct, pct = Math.max(0, before - hp / w.max);
  target.wallPct = +pct.toFixed(3);
  wallCache = null;
  if (before > 0 && pct <= 0) say(w.kind === 'home' ? 'The wall is breached! There is nothing left to keep them out until it is repaired.' : townById(w.id).name + '’s wall is breached.', 'alert');
  else if (before > .5 && pct <= .5 && w.kind === 'home') say('The wall is cracking. Drive the attackers off before it fails.', 'alert');
}
function wallHpText(rec, scale) { const max = WALL_HP[scale], pct = rec.wallPct == null ? 1 : rec.wallPct; return Math.round(pct * max) + ' / ' + max + ' HP'; }
// Every day the citizens patch the wall up a little.
function wallsDay() {
  if (!state.built.walls || state.wallPct == null || state.wallPct >= 1) return;
  if (!state.cur && state.raid) return;
  state.wallPct = Math.min(1, +(state.wallPct + .1).toFixed(3));
  wallCache = null;
}

// ---------------------------------------------------------------- the gatehouse
function wallRepairCost(missing) { const m = [1, 2, 3][(state.town.tier || 1) - 1]; return { stone: Math.ceil(missing * 10 * m), wood: Math.ceil(missing * 6 * m) }; }
function wallsDialog(key) {
  const scale = TIER_SCALE[(state.town.tier || 1) - 1], pct = state.wallPct == null ? 1 : state.wallPct, max = WALL_HP[scale], missing = +(1 - pct).toFixed(3), cost = wallRepairCost(missing);
  showDialog('<h2>' + esc(buildingName(key)) + '</h2><p>' + esc(settleName()) + '’s ' + scale + ' wall protects the ' + (scale === 'village' ? '3 × 3' : '5 × 5') + ' tiles around its middle and stands just outside them. Raiders and monsters cannot cross it until they have battered it down; you and your people can walk straight through. A village wall holds ' + WALL_HP.village + ', a town’s ' + WALL_HP.town + ' and a city’s ' + WALL_HP.city + '.</p>' +
    '<div class="up-row"><span>Strength</span><b>' + (pct > 0 ? wallHpText(state, scale) : 'breached') + '</b></div>' +
    '<p class="cap">Citizens patch the wall up by 10% every day. Past that, repairs cost materials.</p>' +
    (missing > 0 ? '<button ' + (canAfford(cost) ? '' : 'disabled') + ' onclick="repairWalls()">Repair · ' + esc(costText(cost)) + '</button>' : '') + '<button onclick="closeDialog()">Leave</button>');
}
function repairWalls() {
  const missing = +(1 - (state.wallPct == null ? 1 : state.wallPct)).toFixed(3), cost = wallRepairCost(missing);
  if (!state.built.walls || missing <= 0 || !canAfford(cost)) return;
  for (const [k, v] of Object.entries(cost)) state.inv[k] -= v;
  state.wallPct = 1; wallCache = null;
  say('The wall is as good as new.', 'gold'); render(); wallsDialog('walls');
}

// ---------------------------------------------------------------- walls of the other settlements
// Settlements that have grown a little build walls now and then (sooner after a fright), and mend them as the days go by.
function npcWalls(s) { return !!s.walls && (s.wallPct == null ? 1 : s.wallPct) > 0; }
function npcWallBonus(s) { return npcWalls(s) ? 1 + WALL_HP[scaleOf(s.people)] / 160 : 1; }   // how much harder they are to beat
function npcWallHit(s, share) {
  if (!s.walls) return;
  const before = s.wallPct == null ? 1 : s.wallPct;
  s.wallPct = +Math.max(0, before - share).toFixed(3); wallCache = null;
  if (before > 0 && s.wallPct <= 0) logWorld(s.name + '’s wall has been breached.', 'alert', s.id);
}
function npcWallsDay(s) {
  if (!s.walls && s.people >= 6 && Math.random() < .03 + (s.fright && state.day - s.fright < 10 ? .15 : 0)) {
    s.walls = true; s.wallPct = 1; wallCache = null;
    logWorld(s.name + ' has raised a wall around itself.', '', s.id);
  }
  if (s.walls && s.wallPct != null && s.wallPct < 1) { s.wallPct = Math.min(1, +(s.wallPct + .1).toFixed(3)); wallCache = null; }
}

// ---------------------------------------------------------------- what a surplus invites
// Full stores are a temptation: every kind of goods piled up near the limit, and every store of surplus kept in the
// settlements you annexed, makes raiders and monsters more likely to come (up to two and a half times as likely).
function surplusKinds() {
  const cap = supplyCap(), full = k => (state.inv[k] || 0) >= cap * .9;
  return CAPPED.filter(k => k !== 'torch' && full(k)).length + ((state.town.food || 0) >= cap * .9 ? 1 : 0);
}
function stockTotal() {
  let n = 0;
  for (const s of settlements) if (s.owner === 'player') n += Object.values(s.stock || {}).reduce((a, b) => a + b, 0);
  return n;
}
function raidAttraction() { return Math.min(2.5, 1 + .2 * surplusKinds() + .1 * Math.floor(stockTotal() / 20)); }

// ---------------------------------------------------------------- monster raids
// Now and then a pack of wild monsters comes out of the wilds for a settlement. Brackenford's fight is on the map like any
// raid; the other settlements' are settled at once, and their walls make the difference.
const MONSTER_RAID_RATE = .035;
function monsterPack(n) {
  const foes = [];
  for (let i = 0; i < n - 1; i++) foes.push({ ...chooseEnemy('overworld'), faction: 'raid', raid: true, monster: true, townId: null });
  foes.push({ ...enemyCatalog[state.day >= 50 ? 'troll' : state.day >= 20 ? 'dire' : 'stalker'], faction: 'raid', raid: true, monster: true, townId: null, bonus: 1 });
  return foes;
}
function startMonsterRaid() {
  if (state.raid) return false;
  const n = clamp(2 + Math.floor(state.day / 15) + Math.floor((raidAttraction() - 1) * 2), 2, 8), foes = monsterPack(n);
  let placed = 0, dir = '';
  for (let tries = 0; tries < 24 && !placed; tries++) {
    const a = Math.random() * Math.PI * 2, c = { x: HOME.x + Math.cos(a) * 19, y: HOME.y + Math.sin(a) * 19 };
    placed = placeFoes(c, foes, 0, 4);
    if (placed) dir = compass(Math.round(c.x - HOME.x), Math.round(c.y - HOME.y));
  }
  if (!placed) return false;
  state.raid = { from: null, name: 'the wilds', monster: true, left: placed, total: placed, deadline: state.day + 2, looted: 0, killed: 0, war: false };
  const msg = 'A pack of monsters (' + placed + ' of them) is coming out of the wilds for Brackenford from the ' + dir + '! ' + (wallHolds() ? 'The wall will hold them for a while; ' : '') + 'drive them off before they get in, or they will maul the citizens and eat the pantry.';
  say(msg, 'alert'); logWorld('Monsters are raiding Brackenford.', 'alert');
  alliesHelp();
  return true;
}
// A monster that gets inside the settlement: it mauls a citizen now and then and eats from the pantry.
function monsterStrikes() {
  const food = Math.min(state.town.food, 2 + Math.floor(state.town.people / 4)), parts = [];
  state.town.food -= food; parts.push('eats ' + food + ' meals');
  if (state.town.people > 0 && Math.random() < .5) { loseCitizens(1); parts.push('mauls a citizen'); }
  say('A monster gets into Brackenford and ' + parts.join(' and ') + '!', 'alert');
  const r = state.raid;
  if (r) { r.looted++; r.left--; }
  if (state.town.people <= 0) { if (state.raid) { state.raid = null; for (const [x, y] of raiderTiles()) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; } } wipeHome(); return; }
  if (r && r.left <= 0) endRaid();
}
function monsterRaidTurn() {
  if (state.day < 5) return;
  const att = raidAttraction();
  if (!state.raid && (state.built.hut || state.built.longhouse) && state.town.people > 0 && Math.random() < MONSTER_RAID_RATE * att) startMonsterRaid();
  // one more roll for everybody else: annexed settlements with a store of surplus draw monsters most
  if (Math.random() < .2) {
    const pool = settlements.map(s => ({ s, w: s.owner === 'player' ? 1 + Object.values(s.stock || {}).reduce((a, b) => a + b, 0) / 20 : s.owner ? .3 : 1 })), total = pool.reduce((a, p) => a + p.w, 0);
    let roll = Math.random() * total, pick = pool[pool.length - 1].s;
    for (const p of pool) { roll -= p.w; if (roll < 0) { pick = p.s; break; } }
    resolveMonsterRaid(pick);
  }
}
function resolveMonsterRaid(s) {
  if (warOf(s.id) || (state.wars && state.wars[s.id]) || s.wreck > 0 && s.people < 3) return;
  const mine = s.owner === 'player', rec = mine ? recordOf(s.id) : null, walled = mine ? !!(rec && rec.built.walls && (rec.wallPct == null ? 1 : rec.wallPct) > 0) : npcWalls(s);
  if (walled) {
    const w = wallList().find(x => x.id === s.id);
    if (mine) wallDamage(w, w.max * .3); else npcWallHit(s, .3);
    const text = 'Monsters hurl themselves at ' + s.name + '’s wall and are beaten back.';
    if (mine) say(text, 'gold');
    logWorld(text, mine ? 'gold' : '', s.id);
    return;
  }
  if (mine) {
    if (!rec || rec.town.people <= 1) return;
    withContext(s.id, () => loseCitizens(1)); s.people = rec.town.people;
    const lost = {}; for (const k of Object.keys(s.stock || {})) { const n = Math.floor(s.stock[k] / 2); if (n) { s.stock[k] -= n; lost[k] = n; } }
    const text = 'Monsters raid ' + s.name + ': a citizen is killed' + (Object.keys(lost).length ? ' and ' + Object.entries(lost).map(([k, n]) => n + ' ' + itemNames[k].toLowerCase()).join(', ') + ' of its stores are eaten or smashed' : '') + '. A wall would have turned them back.';
    say(text, 'alert'); logWorld(text, 'alert', s.id); return;
  }
  if (s.people <= 3) return;
  const dead = 1 + (Math.random() < .35 ? 1 : 0);
  s.people = Math.max(2, s.people - dead); s.fright = state.day;
  logWorld('Monsters raid ' + s.name + ': ' + dead + ' citizen' + (dead === 1 ? ' is' : 's are') + ' killed.', '', s.id);
}
