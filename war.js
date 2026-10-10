// Soldiers on the march, wars of conquest, raids and rivalries between settlements.
// Loaded after settlement.js; like it, everything here runs from events and uses the main script's globals at call time.

const WAR_FOES = {
  hold:    { name: 'Barricaded House', zone: 'war', weight: 0, hp: 1.5, attack: .6, bonus: 0, xp: 1, coin: 2, building: true },
  guard:   { name: 'Town Guard',   zone: 'war', weight: 0, hp: 1.1,  attack: 1,   bonus: 0, xp: 1, coin: 2 },
  captain: { name: 'Town Captain', zone: 'war', weight: 0, hp: 1.7,  attack: 1.3, bonus: 1, xp: 4, coin: 8 },
  raider:  { name: 'Raider',       zone: 'war', weight: 0, hp: 1.05, attack: 1.1, bonus: 0, xp: 1, coin: 3 },
  chief:   { name: 'Raid Chief',   zone: 'war', weight: 0, hp: 1.6,  attack: 1.3, bonus: 1, xp: 4, coin: 8 }
};
const RAID_RATE = 0.07, MAX_AGGRESSION = 0.6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Every settlement gets a size and a temper; older worlds are filled in when they load.
function ensureWarWorld() {
  if (!state.wars) state.wars = {};
  for (const k of ['deals', 'hostile', 'aid', 'rel']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  if (!Array.isArray(state.npcWars)) state.npcWars = [];
  if (!Number.isFinite(state.escort)) state.escort = 0;
  for (const s of settlements) {
    if (!Number.isFinite(s.people)) s.people = 3 + Math.floor(Math.random() * 5);
    if (!Number.isFinite(s.cap)) s.cap = s.people;
    if (!Number.isFinite(s.aggression)) s.aggression = +(Math.random() * 0.5).toFixed(2);
    if (!('owner' in s)) s.owner = null;
  }
  ensureRivalries();
  ensureColonies();
}
function annexedCount() { return settlements.filter(s => s.owner === 'player').length; }
function moodOf(s) { return s.aggression < 0.12 ? 'peaceful' : s.aggression < 0.3 ? 'wary' : 'hostile'; }
function townById(id) { return settlements.find(s => s.id === id) || null; }
function ownerText(s) {
  if (s.owner === 'player') return 'annexed by Brackenford';
  const o = s.owner && townById(s.owner);
  return o ? 'ruled by ' + o.name : '';
}

// ---------------------------------------------------------------- soldiers who march with you
function syncEscort() {
  const want = Math.max(0, Math.min(state.escort || 0, state.soldiers.length)), have = state.soldiers.filter(g => g.escort);
  if (have.length > want) for (const g of have.slice(want)) g.escort = false;
  else for (const g of state.soldiers) { if (have.length >= want) break; if (!g.escort) { g.escort = true; have.push(g); } }
}
function escorts() { return state.zone === 'overworld' ? state.soldiers.filter(g => g.escort) : []; }
function setEscort(n, back) {
  ensureSettlementState();
  state.escort = clamp(Math.round(n), 0, soldierCount());
  syncSoldiers();
  say(state.escort ? state.escort + ' soldier' + (state.escort === 1 ? '' : 's') + ' will follow you out of Brackenford.' : 'Your soldiers return to their patrols.', 'gold');
  render();
  if (back === 'barracks') barracksDialog('barracks'); else if (back === 'war') warCouncil();
}
// Marching soldiers go home: they are dropped from the field and the barracks sends fresh ones to the patrol.
function dismissEscort() {
  if (!state.escort) return;
  for (const g of state.soldiers) if (g.escort) { g.escort = false; g.x = NaN; }
  state.escort = 0;
  syncSoldiers();
  say('Your soldiers march back to Brackenford.', 'gold');
  render();
}
function escortControls(back) {
  const have = soldierCount(), n = Math.min(state.escort || 0, have), q = "'" + back + "'";
  return '<h3>Marching order</h3><p>' + n + ' of ' + have + ' soldiers will follow you across the map, fight beside you and join your wars.</p>' +
    '<button onclick="setEscort(' + (n - 1) + ',' + q + ')">−1</button><button onclick="setEscort(' + (n + 1) + ',' + q + ')">+1</button><button onclick="setEscort(' + have + ',' + q + ')">All</button><button onclick="setEscort(0,' + q + ')">None</button>';
}
function escortButton() {
  if (state.zone !== 'overworld' || !(state.escort > 0) || !state.built.barracks) return '';
  return '<button class="wide" onclick="dismissEscort()">Soldiers following: ' + Math.min(state.escort, state.soldiers.length) + ' · send them home</button>';
}
function nearbyFoe(g, r) {
  let best = 99, target = null;
  for (let y = Math.max(1, g.y - r); y <= Math.min(WORLD_H - 2, g.y + r); y++) for (let x = Math.max(1, g.x - r); x <= Math.min(WORLD_W - 2, g.x + r); x++) {
    if (overworld[y][x] !== 'g') continue;
    const d = Math.abs(x - g.x) + Math.abs(y - g.y);
    if (d < best) { best = d; target = [x, y]; }
  }
  return target ? { x: target[0], y: target[1], d: best } : null;
}
function moveEscort() {
  const folks = escorts();
  if (!folks.length) return;
  const occupied = new Set([...state.workers, ...state.soldiers].map(w => w.x + ',' + w.y)); occupied.add(state.x + ',' + state.y);
  const marked = (x, y) => BUILDING_MARKS.some(b => x === HOME.x + b.dx && y === HOME.y + b.dy);
  const free = (x, y) => x > 0 && y > 0 && x < WORLD_W - 1 && y < WORLD_H - 1 && overworld[y][x] === '.' && !occupied.has(x + ',' + y) && !marked(x, y);
  const place = (g, x, y) => {
    noteStep(g.id, x - g.x); occupied.delete(g.x + ',' + g.y); g.x = x; g.y = y; occupied.add(x + ',' + y);
    for (let ey = Math.max(1, y - 3); ey <= Math.min(WORLD_H - 2, y + 3); ey++) for (let ex = Math.max(1, x - 3); ex <= Math.min(WORLD_W - 2, x + 3); ex++) if (Math.hypot(ex - x, ey - y) <= 3) state.explored[ey][ex] = true;
  };
  const toward = (g, tx, ty) => {
    const moves = [[Math.sign(tx - g.x), 0], [0, Math.sign(ty - g.y)]];
    if (Math.abs(ty - g.y) > Math.abs(tx - g.x)) moves.reverse();
    for (const [dx, dy] of moves) if ((dx || dy) && free(g.x + dx, g.y + dy)) { place(g, g.x + dx, g.y + dy); return true; }
    return false;
  };
  for (const g of [...folks]) {
    if (!state.soldiers.includes(g)) continue;
    g.cd = Math.max(0, (g.cd || 0) - 1);
    const dist = Math.abs(g.x - state.x) + Math.abs(g.y - state.y);
    if (dist > 10 || g.stuck > 4) {
      g.stuck = 0;
      for (const [dx, dy] of workerOffsets(6)) { const x = state.x + dx, y = state.y + dy; if (free(x, y)) { place(g, x, y); break; } }
      continue;
    }
    const foe = nearbyFoe(g, 3);
    if (foe) {
      if (foe.d <= 1) { if (g.cd <= 0) { g.cd = 3; soldierFight(g, foe.x, foe.y); } }
      else if (!toward(g, foe.x, foe.y)) g.stuck = (g.stuck || 0) + 1;
      continue;
    }
    if (g.hp < g.maxHp && Math.random() < .08) g.hp++;
    if (dist > 2) { if (toward(g, state.x, state.y)) g.stuck = 0; else g.stuck = (g.stuck || 0) + 1; }
    else if (Math.random() < .12) {
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      if (free(g.x + dx, g.y + dy) && Math.abs(g.x + dx - state.x) + Math.abs(g.y + dy - state.y) <= 3) place(g, g.x + dx, g.y + dy);
    }
  }
}
// Marching soldiers join your fights: they strike after each of your actions, and the foe may turn on them instead of you.
function escortInFight() { return escorts().filter(g => Math.abs(g.x - state.x) + Math.abs(g.y - state.y) <= 6); }
function escortStrike(b) {
  const fs = escortInFight();
  if (!fs.length) return;
  let total = 0;
  for (const g of fs) if (Math.random() < .75) total += soldierDamage();
  if (!total) { b.status += ' Your soldiers miss.'; return; }
  b.hp = Math.max(0, b.hp - total);
  b.status += ' Your soldiers strike for ' + total + '.';
  say('Your soldiers hit the ' + b.enemy.name + ' for ' + total + '.', 'gold');
}
function soldierFalls(g, foeName) {
  state.soldiers = state.soldiers.filter(t => t !== g);
  state.soldierDebt = (state.soldierDebt || 0) + 1;
  say('A Brackenford soldier falls to the ' + foeName + '.', 'alert');
  tryRespawnSoldiers();
}
function escortTakesHit(b) {
  const fs = escortInFight();
  if (!fs.length || Math.random() >= fs.length / (fs.length + 1)) return false;
  b.guarded = false;
  const g = fs[Math.floor(Math.random() * fs.length)], dmg = Math.max(1, enemyDamage(b.level, b.enemy));
  g.hp -= dmg;
  say('The ' + b.enemy.name + ' turns on one of your soldiers for ' + dmg + ' damage.', 'alert');
  if (g.hp <= 0) soldierFalls(g, b.enemy.name);
  b.status += ' It turns on one of your soldiers (' + dmg + ' damage).';
  render(); refreshBattle();
  return true;
}

// ---------------------------------------------------------------- all hands to the barracks
function callToArms() {
  ensureSettlementState();
  if (!state.built.barracks) { say('Build the barracks first.', 'alert'); return; }
  state.assignBackup = { ...state.assign };
  for (const k of JOB_KEYS) state.assign[k] = 0;
  state.assign.barracks = state.town.people;
  syncTownPeople(); syncSoldiers();
  say('Every citizen takes up arms: ' + state.town.people + ' soldiers. Production stops until you stand down.', 'alert');
  render(); if (dialogIsOpen()) warCouncil();
}
function standDown() {
  ensureSettlementState();
  const back = state.assignBackup || {};
  state.assignBackup = null;
  for (const k of JOB_KEYS) state.assign[k] = 0;
  let left = state.town.people;
  for (const k of JOB_KEYS) { const n = Math.min(left, back[k] || 0, capacity(k)); state.assign[k] = n; left -= n; }
  state.escort = Math.min(state.escort || 0, soldierCount());
  syncTownPeople(); syncSoldiers();
  say('The soldiers return to their trades.', 'gold');
  render(); if (dialogIsOpen()) warCouncil();
}
function dialogIsOpen() { return document.getElementById('overlay').style.display === 'grid'; }

// ---------------------------------------------------------------- war and annexation
function placeFoes(center, list, minR, maxR) {
  let placed = 0;
  for (const foe of list) {
    for (let tries = 0; tries < 150; tries++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR), x = Math.round(center.x + Math.cos(a) * r), y = Math.round(center.y + Math.sin(a) * r);
      if (x < 2 || y < 2 || x >= WORLD_W - 2 || y >= WORLD_H - 2 || overworld[y][x] !== '.' || (x === state.x && y === state.y) || Math.hypot(x - HOME.x, y - HOME.y) <= 5) continue;
      overworld[y][x] = 'g'; enemyBucket(overworld).set(x + ',' + y, foe); placed++;
      break;
    }
  }
  return placed;
}
function warBlock(s) {
  if (!s || !s.discovered) return 'You do not know that settlement yet.';
  if (s.owner === 'player') return s.name + ' already flies Brackenford’s banner.';
  if (state.wars[s.id]) return 'You are already fighting ' + s.name + '.';
  if (isAlly(s.id)) return 'You are allied with ' + s.name + '. End the alliance at your caravan post before you attack them.';
  if (!state.built.barracks || soldierCount() < 1) return 'You need a barracks with at least one soldier before you can wage war.';
  return '';
}
// A siege: the settlement's citizens take the field as guards and a captain, and its buildings around the town are
// fortified. Its gates stay shut until every one of them is down; then you can walk in and claim it.
function declareWar(id) {
  ensureWarWorld();
  const s = townById(id), block = warBlock(s);
  if (block) { say(block, 'alert'); return false; }
  const size = Math.max(2, s.people), leash = { x: s.x, y: s.y, r: 7 }, guards = [], holds = [];
  for (let i = 0; i < size - 1; i++) guards.push({ ...WAR_FOES.guard, faction: 'war', townId: id, leash });
  guards.push({ ...WAR_FOES.captain, faction: 'war', townId: id, leash });
  for (let i = 0; i < 2 + townBracket(size); i++) holds.push({ ...WAR_FOES.hold, faction: 'war', townId: id });
  const g = placeFoes(s, guards, 2, 5), h = placeFoes(s, holds, 2, 4);
  if (!g && !h) { say('There is no open ground around ' + s.name + ' for a battle. Try again later.', 'alert'); return false; }
  state.wars[id] = { total: g + h, left: g + h, guards: g, holds: h, size, cleared: false };
  { const nw = warOf(id); if (nw) endNpcWar(nw, nw.d, 'draw'); }        // its own war is over: you have come for it
  state.hostile[id] = { ...(state.hostile[id] || { since: state.day, vias: [] }), war: true, next: state.day + 3 };
  const r = relOf(id); r.quest = null; r.favor = 0;
  if (state.zone === 'town' && state.visiting === id) exitTown();                     // its gates close behind you
  const helped = siegeHelp(s);
  say('You declare war on ' + s.name + '! Its ' + g + ' defenders take up arms and ' + h + ' houses around the town are fortified. Defeat every defender and tear every building down, then walk in to claim it.' + (helped ? ' Allied soldiers have already cut down ' + helped + ' of them.' : ''), 'alert');
  render();
  return true;
}
// Your allies join a war you declare: each cuts down a defender or two (more if it hates the target), never more than
// half of them in all, and never the captain or the buildings.
function siegeHelp(s) {
  const w = state.wars[s.id];
  let cap = Math.floor(w.guards / 2), total = 0;
  for (const a of allies()) {
    if (cap <= 0) break;
    if (isHostile(a.id) || a.people < 3) continue;
    let want = Math.min(cap, 1 + ((a.dislikes || []).includes(s.id) ? 1 : 0));
    for (const [x, y] of warFoes(s.id)) {
      if (want <= 0) break;
      const e = enemyBucket(overworld).get(x + ',' + y);
      if (!e || e.building || e.name === 'Town Captain') continue;
      removeEnemyData(overworld, x, y); overworld[y][x] = '.';
      w.guards--; w.left--; s.people = Math.max(1, s.people - 1); want--; cap--; total++;
    }
  }
  return total;
}
function warFoes(id) {
  const out = [];
  for (const [k, e] of enemyBucket(overworld)) if (e.faction === 'war' && e.townId === id) out.push(k.split(',').map(Number));
  return out;
}
function warLeft(w) { return w.guards + ' defender' + (w.guards === 1 ? '' : 's') + ' and ' + w.holds + ' building' + (w.holds === 1 ? '' : 's'); }
function peaceCost(id) { return 6 + 4 * (state.wars[id] && !state.wars[id].cleared ? state.wars[id].left : 0); }
function sueForPeace(id) {
  const s = townById(id), w = state.wars[id];
  if (!s || !w || w.cleared) return;
  const cost = peaceCost(id);
  if (state.coin < cost) { say('Peace with ' + s.name + ' costs ' + cost + ' coin.', 'alert'); render(); return; }
  state.coin -= cost;
  for (const [x, y] of warFoes(id)) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; }
  delete state.wars[id]; if (state.hostile[id]) { state.hostile[id].war = false; reconcileHostility(); }
  s.aggression = Math.min(MAX_AGGRESSION, +(s.aggression + .15).toFixed(2));
  say(s.name + ' accepts your tribute of ' + cost + ' coin and lays down arms. They will remember it.', 'gold');
  render(); if (dialogIsOpen()) closeDialog();
}
// Walking into a settlement whose defenders and buildings are all down takes it. It keeps two survivors and nothing
// else: what happens next is up to you, because an annexed settlement is run like Brackenford.
function annex(id) {
  const s = townById(id), w = state.wars[id];
  delete state.wars[id]; delete state.hostile[id];
  if (!s) return;
  { const nw = warOf(id); if (nw) endNpcWar(nw, nw.d, 'draw'); }
  const loot = 20 + (w ? w.size : 3) * 3;
  s.owner = 'player'; s.people = 2; s.cap = Math.max(s.cap || 3, 3); s.wreck = 0; s.stock = {};
  state.coin += loot;
  if (typeof makeColony === 'function') makeColony(s);
  say(s.name + ' is yours: ' + loot + ' coin in plunder, and two survivors who will take your orders. It has no buildings left, so raise them as you would in Brackenford.', 'gold');
  render();
}
function noteKill(foe) {
  if (!foe) return;
  if (!foe.faction) huntKill();
  if (foe.faction === 'war' && state.wars && state.wars[foe.townId]) {
    const w = state.wars[foe.townId], t = townById(foe.townId) || { name: 'the town', people: 0 };
    if (foe.building) w.holds = Math.max(0, w.holds - 1); else { w.guards = Math.max(0, w.guards - 1); if (t.people) t.people = Math.max(0, t.people - 1); }
    w.left = w.guards + w.holds;
    if (w.left <= 0) { w.cleared = true; t.people = 0; say(t.name + ' has no citizens and no buildings left standing. Walk into it to claim it for Brackenford.', 'gold'); }
    else say(warLeft(w) + ' remain at ' + t.name + '.');
  } else if (foe.faction === 'npcwar') noteWarFoe(foe);
  else if (foe.raid && state.raid) {
    state.raid.left--; state.raid.killed = (state.raid.killed || 0) + 1;
    if (state.raid.left <= 0) endRaid(); else say(state.raid.left + ' raider' + (state.raid.left === 1 ? '' : 's') + ' still threaten Brackenford.');
  }
}
function warButton(id) {
  const s = townById(id);
  if (!s) return '';
  if (s.owner === 'player') return '<p>' + esc(s.name) + ' is part of Brackenford.</p>';
  if (state.wars[id] || !state.built.barracks) return '';
  if (isAlly(id)) return '<p><em>You are allies. End the alliance at your caravan post before you attack them.</em></p>';
  return '<button onclick="closeDialog();declareWar(\'' + id + '\')">Declare war on ' + esc(s.name) + '</button>';
}
function warDialog(id) {
  const s = townById(id), w = state.wars[id];
  showDialog('<h2>' + esc(s.name) + '</h2><p>The gates are shut: you are at war. ' + warLeft(w) + ' still stand around the town. Defeat every defender and tear down every building, then walk in to claim it.</p>' +
    '<button ' + (state.coin >= peaceCost(id) ? '' : 'disabled') + ' onclick="sueForPeace(\'' + id + '\')">Make peace · ' + peaceCost(id) + ' coin</button><button onclick="closeDialog()">Leave</button>');
}
function warCouncil() {
  if (state.cur) { say('The war council meets in Brackenford.', 'alert'); return; }
  ensureWarWorld(); ensureSettlementState();
  const known = settlements.filter(s => s.discovered);
  const rows = known.map(s => {
    const dist = Math.round(Math.hypot(s.x - HOME.x, s.y - HOME.y)), w = state.wars[s.id];
    const act = s.owner === 'player' ? '<em>annexed</em>' : w ? (w.cleared ? '<em>walk in to claim it</em>' : '<span>' + w.left + ' / ' + w.total + '</span> <button onclick="sueForPeace(\'' + s.id + '\')">Peace · ' + peaceCost(s.id) + '</button>') : isAlly(s.id) ? '<em>ally</em>' : '<button onclick="declareWar(\'' + s.id + '\');warCouncil()">Declare war</button>';
    const note = [dist + ' leagues', s.people + ' citizens', moodOf(s), isHostile(s.id) ? 'at war with you' : '', ownerText(s)].filter(Boolean).join(' · ');
    return '<div class="up-row"><span>' + esc(s.name) + '<br><em>' + esc(note) + '</em></span><span>' + act + '</span></div>';
  }).join('') || '<p>You have not found any settlements yet. Explore the Briarwood.</p>';
  const raid = state.raid ? '<p><strong>' + (state.raid.war ? 'A warband' : 'Raiders') + ' from ' + esc(state.raid.name) + '</strong> threaten Brackenford: ' + state.raid.left + ' of ' + state.raid.total + ' still at large.</p>' : '';
  showDialog('<h2>War council</h2><p>' + soldierCount() + ' soldier' + (soldierCount() === 1 ? '' : 's') + ' of ' + state.town.people + ' citizens. Soldiers are citizens assigned to the barracks.</p>' + raid +
    (state.assignBackup ? '<button onclick="standDown()">Stand down · back to work</button>' : '<button onclick="callToArms()">Call every citizen to arms</button>') +
    escortControls('war') + '<h3>Wars between settlements</h3>' + npcWarRows() + '<h3>Settlements</h3>' + rows + '<button onclick="hallDialog()">Back</button><button onclick="closeDialog()">Leave</button>');
}

// ---------------------------------------------------------------- raids and assaults on Brackenford
// A raid loots. A war assault, sent by a settlement that is at war with you, kills citizens and burns buildings; it
// never takes the settlement.
function raiderTiles() {
  const out = [];
  for (const [k, e] of enemyBucket(overworld)) if (e.raid) out.push(k.split(',').map(Number));
  return out;
}
function startRaid(s, opts = {}) {
  ensureWarWorld();
  if (state.raid) return false;
  const war = !!opts.war, n = war ? clamp(2 + Math.floor(s.people / 4) + Math.floor(state.day / 20), 2, 8) : clamp(2 + Math.floor(s.aggression * 6) + Math.floor(state.day / 12), 2, 8), foes = [];
  for (let i = 0; i < n - 1; i++) foes.push({ ...WAR_FOES.raider, faction: 'raid', raid: true, townId: s.id, bonus: s.aggression > .3 || war ? 1 : 0 });
  foes.push({ ...WAR_FOES.chief, faction: 'raid', raid: true, townId: s.id });
  let placed = 0, dir = '';
  for (let tries = 0; tries < 24 && !placed; tries++) {
    const a = Math.random() * Math.PI * 2, c = { x: HOME.x + Math.cos(a) * 19, y: HOME.y + Math.sin(a) * 19 };
    placed = placeFoes(c, foes, 0, 4);
    if (placed) dir = compass(Math.round(c.x - HOME.x), Math.round(c.y - HOME.y));
  }
  if (!placed) return false;
  state.raid = { from: s.id, name: s.name, left: placed, total: placed, deadline: state.day + 2, looted: 0, killed: 0, war };
  say(war ? 'A warband from ' + s.name + ' (' + placed + ' of them) is marching on Brackenford from the ' + dir + '! Stop them before they reach the town, or they will kill your citizens and burn your buildings.' : 'Raiders from ' + s.name + ' (' + placed + ' of them) are marching on Brackenford from the ' + dir + '! Defend the settlement before they reach it, or they will ransack the pantry.', 'alert');
  alliesHelp();
  return true;
}
// Allied settlements send soldiers who cut down a few of the raiders before they arrive.
function alliesHelp() {
  const r = state.raid;
  if (!r) return;
  const helped = [];
  for (const a of allies()) {
    if (isHostile(a.id) || a.id === r.from || a.people < 3 || r.left <= 1) continue;
    const want = Math.min(r.left - 1, 1 + Math.floor(townBracket(a.people) / 2) + (a.people >= 8 ? 1 : 0));
    let killed = 0;
    for (const [x, y] of raiderTiles()) { if (killed >= want) break; removeEnemyData(overworld, x, y); overworld[y][x] = '.'; killed++; }
    if (killed) { r.left -= killed; r.killed += killed; helped.push(a.name + ' (' + killed + ')'); }
  }
  if (helped.length) say('Allied soldiers ride to your aid: ' + helped.join(', ') + ' cut down raiders before they reach Brackenford.', 'gold');
}
function loseCitizens(n) {
  state.town.people = Math.max(0, state.town.people - n);
  while (employed() > state.town.people) { const k = JOB_KEYS.filter(j => crew(j) > 0).sort((a, b) => crew(b) - crew(a))[0]; state.assign[k]--; }
  syncTownPeople(); syncSoldiers();
}
// Burns a random building. The hall and longhouse go last, and only when nothing else is left.
function destroyBuilding() {
  const built = Object.keys(state.built).filter(k => state.built[k] && k !== 'beacon'), other = built.filter(k => k !== 'hut' && k !== 'longhouse'), pool = other.length ? other : built;
  if (!pool.length) return null;
  const k = pool[Math.floor(Math.random() * pool.length)];
  state.built[k] = false; state.assign[k] = 0; if (state.up[k]) state.up[k] = [false, false, false];
  syncWorkers(); syncSoldiers(); syncTownPeople();
  return k;
}
// Every citizen dead: two survivors start again, and every building is gone. Your pack and coin are untouched.
function wipeHome() {
  for (const k of Object.keys(state.built)) state.built[k] = false;
  state.assign = {}; state.up = {}; state.assignBackup = null; state.town = { people: 2, food: 4, tier: 1 }; state.starving = false;
  state.escort = 0; state.soldiers = []; state.soldierDebt = 0; townPeople = [];
  syncTownPeople(); syncWorkers();
  say('Brackenford is silent: every citizen is dead and every building lies in ruins. Two survivors crawl out and start again.', 'alert');
  render();
}
function raiderLoots(x, y) {
  removeEnemyData(overworld, x, y); overworld[y][x] = '.';
  if (state.raid && state.raid.war) return raiderStrikes();
  const coin = Math.min(state.coin, 3 + Math.floor(state.coin * .1)), food = Math.min(state.town.food, 2 + Math.floor(state.town.people / 4));
  state.coin -= coin; state.town.food -= food;
  say('A raider slips into Brackenford and makes off with ' + coin + ' coin and ' + food + ' meals.', 'alert');
  if (state.raid) { state.raid.looted++; state.raid.left--; if (state.raid.left <= 0) endRaid(); }
}
function raiderStrikes() {
  const parts = [];
  if (state.town.people > 0 && Math.random() < .75) { loseCitizens(1); parts.push('kills a citizen'); }
  if (Math.random() < .4) { const k = destroyBuilding(); if (k) parts.push('burns down the ' + buildingName(k).toLowerCase()); }
  say('A raider breaks into Brackenford and ' + (parts.join(' and ') || 'finds nothing to destroy') + '!', 'alert');
  const r = state.raid;
  if (r) { r.looted++; r.left--; }
  if (state.town.people <= 0) { if (state.raid) { state.raid = null; for (const [x, y] of raiderTiles()) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; } } wipeHome(); return; }
  if (r && r.left <= 0) endRaid();
}
function endRaid() {
  const r = state.raid;
  if (!r) return;
  state.raid = null;
  const s = townById(r.from);
  if (r.war && state.hostile[r.from]) state.hostile[r.from].next = state.day + 4 + Math.floor(Math.random() * 3);
  if (r.looted === 0) {
    const reward = 5 * r.total; state.coin += reward;
    if (s && !r.war) s.aggression = +(s.aggression * .6).toFixed(2);
    say('The ' + (r.war ? 'assault' : 'raid') + ' from ' + r.name + ' is broken! ' + (r.war ? 'The settlement pays you ' + reward + ' coin from the plunder you take from the raiders.' : 'The town pays you ' + reward + ' coin in thanks, and the raiders will think twice before coming back.'), 'gold');
  } else say('The ' + (r.war ? 'assault' : 'raid') + ' from ' + r.name + ' is over: ' + r.looted + ' raider' + (r.looted === 1 ? '' : 's') + ' got through.', 'alert');
  render();
}
// Raiders still out when the deadline comes reach the town; each soldier on duty stops one of them at the gate.
function raidDeadline() {
  if (!state.raid || state.day < state.raid.deadline) return;
  let guards = state.built.barracks ? soldierCount() : 0, stopped = 0;
  for (const [x, y] of raiderTiles()) {
    if (!state.raid) break;
    if (guards > 0) { guards--; stopped++; removeEnemyData(overworld, x, y); overworld[y][x] = '.'; state.raid.left--; state.raid.killed++; }
    else raiderLoots(x, y);
  }
  if (stopped) say('Your soldiers stop ' + stopped + ' raider' + (stopped === 1 ? '' : 's') + ' at the gates.', 'gold');
  if (state.raid && state.raid.left <= 0) endRaid();
  state.raid = null;
}
// Settlements that are at war with you keep sending warbands.
function hostilityTurn() {
  for (const [id, h] of Object.entries(state.hostile || {})) {
    const s = townById(id);
    if (!s || s.owner === 'player') { delete state.hostile[id]; continue; }
    if (state.day < h.next || state.raid || !(state.town.people > 0) || s.people < 2) continue;
    h.next = startRaid(s, { war: true }) ? state.day + 5 + Math.floor(Math.random() * 4) : state.day + 1;
  }
}

// ---------------------------------------------------------------- wars between settlements
// Settlements fight each other, with citizens dying and buildings burning, but never take one another over. A war ends
// when one side has no citizens left: the winner takes the loser's stores, and the loser starts again with two
// citizens and no buildings. You can help either side.
function warById(id) { return (state.npcWars || []).find(w => w.id === id) || null; }
function warOf(id) { return (state.npcWars || []).find(w => w.a === id || w.d === id) || null; }
function inWar(id) { return !!warOf(id) || !!(state.wars && state.wars[id]); }
function startNpcWar(a, d) {
  if (!state.npcWars) state.npcWars = [];
  state.npcWarSeq = (state.npcWarSeq || 0) + 1;
  const w = { id: state.npcWarSeq, a: a.id, d: d.id, since: state.day, aid: 0, you: null, aSize: a.people, dSize: d.people };
  state.npcWars.push(w);
  const known = a.discovered || d.discovered || isAlly(a.id) || isAlly(d.id);
  if (known) say('War! ' + a.name + ' has marched on ' + d.name + '.', isAlly(d.id) ? 'alert' : '');
  if (isAlly(d.id)) callForAid(d, a);
  return w;
}
function stockOf(s) { return s.stock || (s.stock = {}); }
// A settlement that falls respawns with two citizens and none of its buildings; they come back one by one.
function respawnSettlement(s) {
  s.people = 2; s.stock = {}; s.wreck = 0; s.aggression = +clamp((s.aggression || 0) * .5, 0, MAX_AGGRESSION).toFixed(2);
  s.wreck = Object.keys(buildNpcTown(s).plots).length;
}
function endNpcWar(w, winnerId, how) {
  state.npcWars = state.npcWars.filter(x => x !== w);
  const win = townById(winnerId), lose = townById(winnerId === w.a ? w.d : w.a);
  delete state.aid[w.d];
  for (const [x, y] of warFoesNpc(w)) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; }
  if (!win || !lose) return;
  const loot = { ...stockOf(lose) }, parts = [];
  const known = win.discovered || lose.discovered || isAlly(win.id) || isAlly(lose.id) || w.you;
  if (how === 'draw') { if (known) say('The war between ' + win.name + ' and ' + lose.name + ' fizzles out; both sides are bled and neither is beaten.'); return; }
  for (const [k, n] of Object.entries(loot)) { stockOf(win)[k] = Math.min(60, (stockOf(win)[k] || 0) + n); if (n) parts.push(n + ' ' + itemNames[k].toLowerCase()); }
  respawnSettlement(lose);
  win.people = Math.max(win.people, Math.min((win.cap || 8) + 3, win.people + 1));      // victors take in a few of the vanquished, but never shrink
  if (known) say(win.name + ' has won the war against ' + lose.name + (parts.length ? ' and carries off ' + parts.join(', ') : '') + '. ' + lose.name + ' is left in ruins; two survivors start again.', isAlly(lose.id) ? 'alert' : 'gold');
  if (w.you) {
    const mine = (w.you === 'a') === (winnerId === w.a);
    if (mine) {
      const coin = 15 + 6 * townBracket(Math.max(w.aSize, w.dSize)); state.coin += coin;
      const got = []; for (const [k, n] of Object.entries(loot)) { const share = Math.floor(n / 2); if (share > 0 && CAPPED.includes(k)) { const g = addItem(k, share, true); if (g) got.push(g + ' ' + itemNames[k].toLowerCase()); } }
      relOf(win.id).favor++;
      say('You fought on the winning side: ' + win.name + ' pays you ' + coin + ' coin' + (got.length ? ' and shares the spoils: ' + got.join(', ') : '') + '.', 'gold');
    } else say('You fought on the losing side, so there is no reward.', 'alert');
  }
  render();
}
function npcWarTurn() {
  if (!state.npcWars) state.npcWars = [];
  for (const w of [...state.npcWars]) {
    const a = townById(w.a), d = townById(w.d);
    if (!a || !d || a.owner === 'player' || d.owner === 'player') { state.npcWars = state.npcWars.filter(x => x !== w); continue; }
    const ap = a.people * (0.8 + Math.random() * 0.8) * (1 + (a.aggression || 0)), dp = d.people * (0.8 + Math.random() * 0.8) * 1.15 * (1 + 0.35 * (w.aid || 0));
    const hurt = (s, n, burn) => { s.people = Math.max(0, s.people - n); if (burn) s.wreck = (s.wreck || 0) + 1; };
    if (ap > dp) { hurt(d, 1 + (Math.random() < .5 ? 1 : 0), Math.random() < .6); hurt(a, Math.random() < .35 ? 1 : 0, false); }
    else { hurt(a, 1 + (Math.random() < .5 ? 1 : 0), Math.random() < .35); hurt(d, Math.random() < .35 ? 1 : 0, Math.random() < .3); }
    if (d.people <= 0) endNpcWar(w, a.id, 'win');
    else if (a.people <= 0) endNpcWar(w, d.id, 'win');
    else if (state.day - w.since >= 14) endNpcWar(w, a.id, 'draw');
  }
}
// The world starts a war now and then, most often between settlements that cannot stand each other.
function maybeStartNpcWar() {
  if (!state.npcWars) state.npcWars = [];
  if (state.npcWars.length >= 3 || state.day <= 3 || Math.random() >= 0.22) return;
  const free = settlements.filter(s => s.owner !== 'player' && s.people >= 3 && !warOf(s.id) && !(state.wars && state.wars[s.id]));
  if (free.length < 2) return;
  const weights = free.map(s => 0.2 + (s.aggression || 0)), total = weights.reduce((p, q) => p + q, 0);
  let roll = Math.random() * total, a = free[free.length - 1];
  for (let i = 0; i < free.length; i++) { roll -= weights[i]; if (roll < 0) { a = free[i]; break; } }
  const rivals = rivalsOf(a).filter(t => free.includes(t) && t.owner !== 'player'), near = free.filter(t => t !== a && Math.hypot(t.x - a.x, t.y - a.y) <= 70);
  const pool = rivals.length && Math.random() < 0.65 ? rivals : near;
  if (pool.length) startNpcWar(a, pool[Math.floor(Math.random() * pool.length)]);
}
function warFoesNpc(w) {
  const out = [];
  for (const [k, e] of enemyBucket(overworld)) if (e.faction === 'npcwar' && e.npcWar === w.id) out.push(k.split(',').map(Number));
  return out;
}
// Fight in somebody's war: the other side's warriors appear around the settlement under attack, and every one you
// defeat is one citizen fewer for that side.
function joinWar(id, side) {
  const w = warById(id), a = w && townById(w.a), d = w && townById(w.d);
  if (!w || !a || !d || (side !== 'a' && side !== 'd')) return;
  if ((side === 'a' && isAlly(d.id)) || (side === 'd' && isAlly(a.id))) { say('You cannot take up arms against your ally ' + (side === 'a' ? d : a).name + '.', 'alert'); if (dialogIsOpen()) journal(); return; }
  if (warFoesNpc(w).length) { say('The fighting around ' + d.name + ' is already on. Go there and fight.', 'alert'); if (dialogIsOpen()) journal(); return; }
  const foeSide = side === 'a' ? 'd' : 'a', from = foeSide === 'a' ? a : d, n = clamp(Math.ceil(from.people / 3), 2, 6);
  const kind = foeSide === 'a' ? WAR_FOES.raider : WAR_FOES.guard, leash = { x: d.x, y: d.y, r: 8 }, list = [];
  for (let i = 0; i < n; i++) list.push({ ...kind, faction: 'npcwar', npcWar: id, foeSide, leash });
  if (!placeFoes(d, list, 3, 6)) { say('There is no open ground around ' + d.name + ' for a battle. Try again later.', 'alert'); return; }
  w.you = side; w.helped = true;
  if (side === 'd' && state.aid[d.id]) state.aid[d.id].helped = true;
  say(side === 'd' ? 'You ride to the defence of ' + d.name + ': ' + n + ' of ' + a.name + '’s warriors are besieging it. Go there and drive them off.' : 'You join the attack on ' + d.name + ': ' + n + ' of its defenders hold the field around the town. Go there and break them.', 'gold');
  if (dialogIsOpen()) journal();
  render();
}
function noteWarFoe(foe) {
  const w = warById(foe.npcWar);
  if (!w) return;
  const t = townById(foe.foeSide === 'a' ? w.a : w.d), other = townById(foe.foeSide === 'a' ? w.d : w.a);
  if (!t) return;
  t.people = Math.max(0, t.people - 1);
  if (t.people <= 0) { endNpcWar(w, other.id, 'win'); return; }
  if (!warFoesNpc(w).length) say('The fighting around ' + townById(w.d).name + ' dies down.', 'gold');
  else say(warFoesNpc(w).length + ' more fight on around ' + townById(w.d).name + '.');
}
function npcWarRows() {
  const wars = state.npcWars || [];
  if (!wars.length) return '<p>The settlements are at peace, for now.</p>';
  return wars.map(w => {
    const a = townById(w.a), d = townById(w.d), busy = warFoesNpc(w).length;
    return '<div class="up-row"><span>' + swatch(a.id) + esc(a.name) + ' (' + a.people + ') attacks ' + swatch(d.id) + esc(d.name) + ' (' + d.people + ')<br><em>' + (state.day - w.since) + ' day(s) of fighting' + (isAlly(d.id) ? ' · your ally asks for help' : '') + (w.you ? ' · you are helping the ' + (w.you === 'd' ? 'defenders' : 'attackers') + (busy ? ' (' + busy + ' foes at ' + esc(d.name) + ')' : '') : '') + '</em></span><span><button onclick="joinWar(' + w.id + ',\'d\')">Defend</button> <button onclick="joinWar(' + w.id + ',\'a\')">Attack</button></span></div>';
  }).join('');
}

// ---------------------------------------------------------------- allies in trouble
// When an ally is attacked you have three days to help, by sending supplies or by fighting for them. Help nobody and
// the alliance ends.
function callForAid(ally, attacker) {
  if (!isAlly(ally.id) || state.aid[ally.id]) return;
  state.aid[ally.id] = { against: attacker.id, deadline: state.day + 3, helped: false };
  say(ally.name + ' calls on you: ' + attacker.name + ' has declared war on them. Send help within 3 days, with supplies or by fighting, or the alliance ends.', 'alert');
}
function aidCost(ally) { return 15 + 5 * townBracket(ally.people); }
function sendAid(id) {
  const a = townById(id), c = state.aid[id];
  if (!a || !c || !isAlly(id)) return;
  const cost = aidCost(a);
  if (state.coin < cost) { say('Supplies for ' + a.name + ' cost ' + cost + ' coin.', 'alert'); if (dialogIsOpen()) journal(); return; }
  state.coin -= cost; c.helped = true;
  const w = warById(c.war) || (state.npcWars || []).find(x => x.d === id);
  if (w) w.aid = (w.aid || 0) + 1;
  say('You send ' + cost + ' coin of supplies and arms to ' + a.name + '. Their defenders hold out better, and they will remember who answered.', 'gold');
  render(); if (dialogIsOpen()) journal();
}
function aidTurn() {
  for (const [id, c] of Object.entries(state.aid || {})) {
    const a = townById(id);
    if (!a || !isAlly(id)) { delete state.aid[id]; continue; }
    if (!(state.npcWars || []).some(w => w.d === id)) { delete state.aid[id]; continue; }          // the war is over
    if (!c.helped && state.day >= c.deadline) {
      delete state.aid[id];
      breakAlliance(id, a.name + ' ends the alliance: you sent no help when ' + ((townById(c.against) || { name: 'their enemy' }).name) + ' attacked them.');
    }
  }
}
function aidRows() {
  const rows = Object.entries(state.aid || {}).map(([id, c]) => {
    const a = townById(id), att = townById(c.against);
    return a ? '<div class="up-row"><span>' + swatch(id) + esc(a.name) + ' is attacked by ' + esc(att ? att.name : 'an enemy') + '<br><em>' + (c.helped ? 'you have helped' : 'send help within ' + Math.max(0, c.deadline - state.day) + ' day(s) or lose the alliance') + '</em></span><span>' + (c.helped ? '' : '<button onclick="sendAid(\'' + id + '\')">Send supplies · ' + aidCost(a) + ' coin</button>') + '</span></div>' : '';
  }).join('');
  return rows;
}

// ---------------------------------------------------------------- the world's own politics, once a day
function worldTurn() {
  ensureWarWorld();
  for (const s of settlements) {
    if (s.owner === 'player') continue;
    s.aggression = +clamp(s.aggression + (Math.random() - .5) * .06, 0, MAX_AGGRESSION).toFixed(2);
    if (s.people < s.cap && Math.random() < .12) s.people++;
    // what a settlement holds is what a winner takes: a few of its plentiful goods pile up each day
    const st = stockOf(s); for (const k of (s.surplus || [])) st[k] = Math.min(40, (st[k] || 0) + Math.max(1, Math.round(s.people / 4)));
    if (s.wreck > 0 && !warOf(s.id) && Math.random() < .7) s.wreck = Math.max(0, s.wreck - 1 - Math.floor(s.people / 6));
  }
  raidDeadline(); hostilityTurn(); aidTurn(); npcWarTurn();
  if (state.day <= 6) return;
  maybeStartNpcWar();
  for (const s of settlements.filter(t => !t.owner && !isAlly(t.id))) {
    if (Math.random() >= s.aggression * RAID_RATE) continue;
    const canRaidPlayer = !state.raid && (state.built.hut || state.built.longhouse) && Math.hypot(s.x - HOME.x, s.y - HOME.y) <= 100;
    if (canRaidPlayer) startRaid(s);
  }
}
