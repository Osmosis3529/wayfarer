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
