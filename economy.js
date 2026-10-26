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
  for (const k of fuelBuildings()) { if (state.inv.coal > 0) state.inv.coal--; else fuelCold.add(k); }
  if (fuelCold.size) say('No coal in the stores: the ' + [...fuelCold].map(k => buildingName(k).toLowerCase()).join(' and the ') + ' work at half pace today.', 'alert');
}
function fuelFactor(key) { return fuelCold.has(key) ? .5 : 1; }
function fuelNote() {
  const n = fuelBuildings().length;
  return n ? 'Coal: ' + (state.inv.coal || 0) + ' · burning ' + n + ' a day' : '';
}
