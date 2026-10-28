// Coal and the mines: which ores each mine holds and how deep the rare ones lie, and the fuel working buildings burn.
// Loaded after settlement.js; like the other scripts it uses the main script's globals at call time.

// ---------------------------------------------------------------- what is in each mine
// Every mine holds one or two kinds of ore. Coal, copper and iron are found from the first level; silver, gold and gems
// lie deeper, and a mine with a rare seam always reaches deep enough to find it.
const COMMON_ORES = ['coal', 'copper', 'iron'];
const RARE_ORES = { silver: 2, gold: 3, gems: 3 };       // the level where each rare seam begins
const ORE_GLYPH = { coal: 'k', copper: 'c', iron: 'i', silver: 's', gold: 'a', gems: '◆' };
function assignMineOres(site, rnd = Math.random) {
  const pick = list => list[Math.floor(rnd() * list.length)], first = pick(COMMON_ORES), ores = [first];
  if (rnd() < .6) {
    if (rnd() < .45) { const rare = pick(Object.keys(RARE_ORES)); ores.push(rare); site.maxDepth = Math.max(site.maxDepth || 2, RARE_ORES[rare] + 1); }
    else ores.push(pick(COMMON_ORES.filter(o => o !== first)));
  }
  site.ores = ores;
  return ores;
}
// Mines from older saves get their ores from their name, so they are the same every time you load.
function mineOres(site) {
  if (site && Array.isArray(site.ores) && site.ores.length) return site.ores;
  return site ? assignMineOres(site, seededRng(strHash(site.id || 'mine'))) : ['copper', 'iron'];
}
function veinCount(ore, depth, kinds) {
  if (RARE_ORES[ore]) return depth < RARE_ORES[ore] ? 0 : 2 + (depth - RARE_ORES[ore] + 1) * 2;
  return Math.max(3, Math.round((11 + depth) / (kinds > 1 ? 1.6 : 1)));
}
function oresLabel(site) {
  const names = mineOres(site).map(o => itemNames[o].toLowerCase());
  return names.join(' and ');
}

// ---------------------------------------------------------------- fuel
// Mines, jewelers and hunters' lodges burn one coal a day each while someone works there. Without it they work at half pace.
const FUEL_BUILDINGS = ['mine', 'jeweler', 'huntersLodge'];
let fuelCold = new Set();            // the buildings that found the furnace cold this dawn
function fuelBuildings() { return FUEL_BUILDINGS.filter(k => state.built[k] && crew(k) > 0); }
function burnFuel() {
  fuelCold = new Set();
  for (const k of fuelBuildings()) { if (!takeCoal()) fuelCold.add(k); }
  if (fuelCold.size) say('No coal in the stores: the ' + [...fuelCold].map(k => buildingName(k).toLowerCase()).join(' and the ') + ' work at half pace today.', 'alert');
}
function fuelFactor(key) { return fuelCold.has(key) ? .5 : 1; }
function fuelNote() {
  const n = fuelBuildings().length;
  return n ? 'Coal: ' + (state.inv.coal || 0) + ' · burning ' + n + ' a day' : '';
}

// ---------------------------------------------------------------- surplus
// What a settlement makes beyond what the stores hold is not thrown away while you have annexed settlements: it is shared
// out among them. Meals go into their pantries and goods into their stores, which you collect from their halls and which
// their furnaces burn first. Whatever they cannot hold is wasted, and a full store of surplus invites raiders (defense.js).
const STORE_MAX = 100;
function shareSurplus(over) {
  const homes = settlements.filter(s => s.owner === 'player' && isColony(s.id));
  if (!homes.length) return over;
  const left = {}, sent = [];
  for (const [k, n] of Object.entries(over)) {
    if (!(n > 0)) continue;
    let rest = n;
    homes.forEach((s, i) => {
      const share = Math.floor(n / homes.length) + (i < n % homes.length ? 1 : 0), rec = state.colonies[s.id];
      let took;
      if (k === 'meals') { took = Math.min(share, Math.max(0, supplyCap() - rec.town.food)); rec.town.food += took; if (state.cur === s.id) state.town.food = rec.town.food; }
      else { const st = s.stock || (s.stock = {}); took = Math.min(share, Math.max(0, STORE_MAX - (st[k] || 0))); st[k] = (st[k] || 0) + took; }
      rest -= took;
      if (took) sent.push(took + ' ' + (k === 'meals' ? 'meals' : itemNames[k].toLowerCase()) + ' to ' + s.name);
    });
    if (rest > 0) left[k] = rest;
  }
  if (sent.length) say('Surplus shared with the settlements you annexed: ' + sent.join(', ') + '.', 'gold');
  return left;
}
function storeLine(s) { return Object.entries(s.stock || {}).filter(([, n]) => n > 0).map(([k, n]) => n + ' ' + itemNames[k].toLowerCase()).join(', '); }
// In an annexed settlement's hall: what has been put by for you.
function storesBlock() {
  if (!state.cur) return '';
  const s = townById(state.cur), line = s && storeLine(s);
  return line ? '<p>Stores put by here: ' + esc(line) + '.</p><button onclick="collectStock()">Collect the stores</button>' : '';
}
function collectStock() {
  const s = state.cur && townById(state.cur);
  if (!s) return;
  const took = [];
  for (const k of Object.keys(s.stock || {})) {
    const n = Math.min(s.stock[k], k === 'meals' ? 0 : roomFor(k));
    if (n > 0) { addItem(k, n, true); s.stock[k] -= n; took.push(n + ' ' + itemNames[k].toLowerCase()); }
  }
  say(took.length ? 'You collect ' + took.join(', ') + ' from ' + s.name + '’s stores.' : 'Your pack is full: there is no room to collect anything.', took.length ? 'gold' : 'alert');
  render(); hallDialog();
}
// A furnace in an annexed settlement burns what that settlement has put by before it touches your pack.
function takeCoal() {
  const s = state.cur && townById(state.cur);
  if (s && s.stock && s.stock.coal > 0) { s.stock.coal--; return true; }
  if (state.inv.coal > 0) { state.inv.coal--; return true; }
  return false;
}
