// Soldiers on the march, wars of conquest, raids and rivalries between settlements.
// Loaded after settlement.js; like it, everything here runs from events and uses the main script's globals at call time.

const WAR_FOES = {
  guard:   { name: 'Town Guard',   zone: 'war', weight: 0, hp: 1.1,  attack: 1,   bonus: 0, xp: 1, coin: 2 },
  captain: { name: 'Town Captain', zone: 'war', weight: 0, hp: 1.7,  attack: 1.3, bonus: 1, xp: 4, coin: 8 },
  raider:  { name: 'Raider',       zone: 'war', weight: 0, hp: 1.05, attack: 1.1, bonus: 0, xp: 1, coin: 3 },
  chief:   { name: 'Raid Chief',   zone: 'war', weight: 0, hp: 1.6,  attack: 1.3, bonus: 1, xp: 4, coin: 8 }
};
const RAID_RATE = 0.07, CONFLICT_RATE = 0.08, MAX_AGGRESSION = 0.6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Every settlement gets a size and a temper; older worlds are filled in when they load.
function ensureWarWorld() {
  if (!state.wars) state.wars = {};
  if (!Number.isFinite(state.escort)) state.escort = 0;
  for (const s of settlements) {
    if (!Number.isFinite(s.people)) s.people = 3 + Math.floor(Math.random() * 5);
    if (!Number.isFinite(s.cap)) s.cap = s.people;
    if (!Number.isFinite(s.aggression)) s.aggression = +(Math.random() * 0.5).toFixed(2);
    if (!('owner' in s)) s.owner = null;
  }
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
function declareWar(id) {
  ensureWarWorld();
  const s = townById(id);
  if (!s || !s.discovered) { say('You do not know that settlement yet.', 'alert'); return false; }
  if (s.owner === 'player') { say(s.name + ' already flies Brackenford’s banner.', 'alert'); return false; }
  if (state.wars[id]) return false;
  if (!state.built.barracks || soldierCount() < 1) { say('You need a barracks with at least one soldier before you can wage war.', 'alert'); return false; }
  const foes = [];
  for (let i = 0; i < Math.max(2, s.people) - 1; i++) foes.push({ ...WAR_FOES.guard, faction: 'war', townId: id, leash: { x: s.x, y: s.y, r: 7 } });
  foes.push({ ...WAR_FOES.captain, faction: 'war', townId: id, leash: { x: s.x, y: s.y, r: 7 } });
  const placed = placeFoes(s, foes, 2, 5);
  if (!placed) { say('There is no open ground around ' + s.name + ' for a battle. Try again later.', 'alert'); return false; }
  state.wars[id] = { total: placed, left: placed };
  say('You declare war on ' + s.name + '! Its ' + placed + ' defenders take up arms around the town. Defeat every one of them to annex it.', 'alert');
  render();
  return true;
}
function warFoes(id) {
  const out = [];
  for (const [k, e] of enemyBucket(overworld)) if (e.faction === 'war' && e.townId === id) out.push(k.split(',').map(Number));
  return out;
}
function peaceCost(id) { return 6 + 4 * (state.wars[id] ? state.wars[id].left : 0); }
function sueForPeace(id) {
  const s = townById(id), w = state.wars[id];
  if (!s || !w) return;
  const cost = peaceCost(id);
  if (state.coin < cost) { say('Peace with ' + s.name + ' costs ' + cost + ' coin.', 'alert'); render(); return; }
  state.coin -= cost;
  for (const [x, y] of warFoes(id)) { removeEnemyData(overworld, x, y); overworld[y][x] = '.'; }
  delete state.wars[id];
  s.aggression = Math.min(MAX_AGGRESSION, +(s.aggression + .15).toFixed(2));
  say(s.name + ' accepts your tribute of ' + cost + ' coin and lays down arms. They will remember it.', 'gold');
  render(); if (dialogIsOpen()) closeDialog();
}
function annex(id) {
  const s = townById(id);
  delete state.wars[id];
  if (!s) return;
  s.owner = 'player';
  const loot = 20 + s.people * 3, join = Math.min(2, Math.max(0, housingCap() - state.town.people));
  state.coin += loot; state.town.people += join;
  s.people = Math.max(2, Math.ceil(s.people / 2)); s.cap = Math.max(s.people, 3);
  say(s.name + ' surrenders! It is annexed into Brackenford: ' + loot + ' coin in plunder, ' + (join ? join + ' survivors join your citizens, ' : '') + 'room for 4 more citizens at home, and a daily tribute.', 'gold');
  render();
}
function noteKill(foe) {
  if (!foe) return;
  if (foe.faction === 'war' && state.wars && state.wars[foe.townId]) {
    const w = state.wars[foe.townId]; w.left--;
    if (w.left <= 0) annex(foe.townId);
    else say(w.left + ' of ' + (townById(foe.townId) || { name: 'the town' }).name + '’s defenders remain.');
  } else if (foe.raid && state.raid) {
    state.raid.left--;
    if (state.raid.left <= 0) endRaid(); else say(state.raid.left + ' raider' + (state.raid.left === 1 ? '' : 's') + ' still threaten Brackenford.');
  }
}
function warButton(id) {
  const s = townById(id);
  if (!s) return '';
  if (s.owner === 'player') return '<p>' + esc(s.name) + ' is part of Brackenford and sends tribute every day.</p>';
  if (state.wars[id] || !state.built.barracks) return '';
  return '<button onclick="closeDialog();declareWar(\'' + id + '\')">Declare war on ' + esc(s.name) + '</button>';
}
function warDialog(id) {
  const s = townById(id), w = state.wars[id];
  showDialog('<h2>' + esc(s.name) + '</h2><p>The gates are shut: you are at war. ' + w.left + ' of ' + w.total + ' defenders still stand around the town. Defeat them all to annex it.</p>' +
    '<button ' + (state.coin >= peaceCost(id) ? '' : 'disabled') + ' onclick="sueForPeace(\'' + id + '\')">Make peace · ' + peaceCost(id) + ' coin</button><button onclick="closeDialog()">Leave</button>');
}
function warCouncil() {
  ensureWarWorld(); ensureSettlementState();
  const known = settlements.filter(s => s.discovered);
  const rows = known.map(s => {
    const dist = Math.round(Math.hypot(s.x - HOME.x, s.y - HOME.y)), w = state.wars[s.id];
    const act = s.owner === 'player' ? '<em>annexed</em>' : w ? '<span>' + w.left + ' / ' + w.total + '</span> <button onclick="sueForPeace(\'' + s.id + '\')">Peace · ' + peaceCost(s.id) + '</button>' : '<button onclick="declareWar(\'' + s.id + '\');warCouncil()">Declare war</button>';
    const note = [dist + ' leagues', s.people + ' citizens', moodOf(s), ownerText(s)].filter(Boolean).join(' · ');
    return '<div class="up-row"><span>' + esc(s.name) + '<br><em>' + esc(note) + '</em></span><span>' + act + '</span></div>';
  }).join('') || '<p>You have not found any settlements yet. Explore the Briarwood.</p>';
  const raid = state.raid ? '<p><strong>Raiders from ' + esc(state.raid.name) + '</strong> threaten Brackenford: ' + state.raid.left + ' of ' + state.raid.total + ' still at large.</p>' : '';
  showDialog('<h2>War council</h2><p>' + soldierCount() + ' soldier' + (soldierCount() === 1 ? '' : 's') + ' of ' + state.town.people + ' citizens. Soldiers are citizens assigned to the barracks.</p>' + raid +
    (state.assignBackup ? '<button onclick="standDown()">Stand down · back to work</button>' : '<button onclick="callToArms()">Call every citizen to arms</button>') +
    escortControls('war') + '<h3>Settlements</h3>' + rows + '<button onclick="hallDialog()">Back</button><button onclick="closeDialog()">Leave</button>');
}

// ---------------------------------------------------------------- raids on Brackenford
function startRaid(s) {
  ensureWarWorld();
  if (state.raid) return false;
  const n = clamp(2 + Math.floor(s.aggression * 6) + Math.floor(state.day / 12), 2, 8), foes = [];
  for (let i = 0; i < n - 1; i++) foes.push({ ...WAR_FOES.raider, faction: 'raid', raid: true, townId: s.id, bonus: s.aggression > .3 ? 1 : 0 });
  foes.push({ ...WAR_FOES.chief, faction: 'raid', raid: true, townId: s.id });
  let placed = 0, dir = '';
  for (let tries = 0; tries < 24 && !placed; tries++) {
    const a = Math.random() * Math.PI * 2, c = { x: HOME.x + Math.cos(a) * 19, y: HOME.y + Math.sin(a) * 19 };
    placed = placeFoes(c, foes, 0, 4);
    if (placed) dir = compass(Math.round(c.x - HOME.x), Math.round(c.y - HOME.y));
  }
  if (!placed) return false;
  state.raid = { from: s.id, name: s.name, left: placed, total: placed, deadline: state.day + 2, looted: 0 };
  say('Raiders from ' + s.name + ' (' + placed + ' of them) are marching on Brackenford from the ' + dir + '! Defend the settlement before they reach it, or they will ransack the pantry.', 'alert');
  return true;
}
function raiderLoots(x, y) {
  removeEnemyData(overworld, x, y); overworld[y][x] = '.';
  const coin = Math.min(state.coin, 3 + Math.floor(state.coin * .1)), food = Math.min(state.town.food, 2 + Math.floor(state.town.people / 4));
  state.coin -= coin; state.town.food -= food;
  say('A raider slips into Brackenford and makes off with ' + coin + ' coin and ' + food + ' meals.', 'alert');
  if (state.raid) { state.raid.looted++; state.raid.left--; if (state.raid.left <= 0) endRaid(); }
}
function endRaid() {
  const r = state.raid;
  if (!r) return;
  state.raid = null;
  const s = townById(r.from);
  if (r.looted === 0) {
    const reward = 5 * r.total; state.coin += reward;
    if (s) s.aggression = +(s.aggression * .6).toFixed(2);
    say('The raid from ' + r.name + ' is broken! The town pays you ' + reward + ' coin in thanks, and the raiders will think twice before coming back.', 'gold');
  } else say('The raid from ' + r.name + ' is over: ' + r.looted + ' raider' + (r.looted === 1 ? '' : 's') + ' got away with loot.', 'alert');
  render();
}
function raidDeadline() {
  if (!state.raid || state.day < state.raid.deadline) return;
  const raiders = [];
  for (const [k, e] of enemyBucket(overworld)) if (e.raid) raiders.push(k.split(',').map(Number));
  for (const [x, y] of raiders) if (state.raid) raiderLoots(x, y);
  state.raid = null;
}

// ---------------------------------------------------------------- the world's own politics, once a day
function npcConflict(a, b) {
  const power = s => s.people * (0.8 + Math.random() * 0.8);
  const pa = power(a) * (1 + (a.aggression || 0)), pb = power(b), known = a.discovered || b.discovered;
  let text;
  if (pa > pb) {
    b.people = Math.max(2, b.people - (1 + Math.floor(Math.random() * 2)));
    a.people = Math.min(a.cap + 3, a.people + 1);
    if (b.people <= 2 && pa > pb * 1.8 && b.owner !== a.id) { b.owner = a.id; text = a.name + ' has taken over ' + b.name + '.'; }
    else text = a.name + ' raided ' + b.name + ' and won.';
  } else {
    a.people = Math.max(2, a.people - 1);
    text = a.name + ' attacked ' + b.name + ' and was driven off.';
  }
  if (known) say('News from the road: ' + text);
  return text;
}
function worldTurn() {
  ensureWarWorld();
  for (const s of settlements) {
    if (s.owner === 'player') continue;
    s.aggression = +clamp(s.aggression + (Math.random() - .5) * .06, 0, MAX_AGGRESSION).toFixed(2);
    if (s.people < s.cap && Math.random() < .12) s.people++;
  }
  const owned = settlements.filter(s => s.owner === 'player');
  if (owned.length) {
    const coin = 3 * owned.length, goods = {};
    for (const s of owned) for (const k of (s.surplus || []).slice(0, 2)) goods[k] = (goods[k] || 0) + 1;
    state.coin += coin;
    for (const [k, n] of Object.entries(goods)) { state.inv[k] += n; if (k === 'berries') state.town.food += n; }
    const list = Object.entries(goods).map(([k, n]) => n + ' ' + itemNames[k].toLowerCase());
    say('Annexed settlements send tribute: ' + coin + ' coin' + (list.length ? ', ' + list.join(', ') : '') + '.', 'gold');
  }
  raidDeadline();
  if (state.day <= 6) return;
  const free = settlements.filter(s => !s.owner);
  for (const s of free) {
    if (Math.random() >= s.aggression * RAID_RATE) continue;
    const others = settlements.filter(t => t !== s && t.owner !== 'player' && t.owner !== s.id && Math.hypot(t.x - s.x, t.y - s.y) <= 60);
    const canRaidPlayer = !state.raid && state.built.hut && Math.hypot(s.x - HOME.x, s.y - HOME.y) <= 100;
    if (canRaidPlayer && (!others.length || Math.random() < .5)) startRaid(s);
    else if (others.length) npcConflict(s, others[Math.floor(Math.random() * others.length)]);
  }
}

function renderSettlements() {
  ensureWarWorld();
  const known = settlements.filter(s => s.discovered), node = document.getElementById('settlement-list'), names = l => (l || []).map(k => itemNames[k]).join(', ');
  if (!known.length) { node.innerHTML = '<p class="settlement-empty">No trade partners charted yet. Explore beyond Brackenford; towns appear on this map when you get close enough to find them. You must travel to a town to trade there.</p>'; return; }
  node.innerHTML = known.map(s => {
    const w = state.wars[s.id], status = s.owner === 'player' ? 'Annexed' : w ? 'At war: ' + w.left + ' / ' + w.total + ' defenders' : [moodOf(s), ownerText(s)].filter(Boolean).join(' · ');
    return '<div class="settlement-row"><div><strong>' + esc(s.name) + '</strong><span>' + Math.round(Math.hypot(s.x - HOME.x, s.y - HOME.y)) + ' leagues from home · ' + s.people + ' citizens · ' + esc(status) + '<br>Plentiful: ' + esc(names(s.surplus)) + ' · Wanted: ' + esc(names(s.scarce)) + '</span></div></div>';
  }).join('');
}
