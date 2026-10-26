// Stats and gear: charm, health, attack and defense for you, for the people of other settlements and for monsters; the
// helmets, armor, leggings and weapons that nudge them up or down; and what charm does in shops, in quests and in a fight.
// Loaded before settlement.js; like the other scripts it uses the main script's globals (state, say, ...) at call time.

// ---------------------------------------------------------------- the four stats
const STAT_KEYS = ['charm', 'health', 'attack', 'defense'];
const STAT_INFO = {
  charm:   { name: 'Charm',   text: 'Shops give better prices, settlements warm to you faster, and monsters may flee when you intimidate them.' },
  health:  { name: 'Health',  text: 'The damage you can take: every point is 4 maximum HP.' },
  attack:  { name: 'Attack',  text: 'How hard you hit: every point adds 2 damage to a strike.' },
  defense: { name: 'Defense', text: 'How well you shrug off blows: 10 defense halves the damage you take.' }
};
const START_STATS = { charm: 2, health: 3, attack: 3, defense: 2 };
const HP_PER_HEALTH = 4;
const POINTS_PER_LEVEL = 2;
const zeroStats = () => ({ charm: 0, health: 0, attack: 0, defense: 0 });

// ---------------------------------------------------------------- gear
// Every item adds to (or takes from) the four stats. Tier 1 is rough work and tier 5 is the best a smith can make.
// Each slot has two patterns per tier: a plain one and one that trades something away for more of something else.
const GEAR_SLOTS = ['weapon', 'helmet', 'armor', 'leggings'];
const SLOT_NAMES = { weapon: 'Weapon', helmet: 'Helmet', armor: 'Armor', leggings: 'Leggings' };
const GEAR_TABLE = {
  weapon: [
    [['Bronze knife', { attack: 1 }], ['Oak club', { attack: 2, charm: -1 }]],
    [['Hunter’s spear', { attack: 2, defense: 1 }], ['Hand axe', { attack: 3, defense: -1 }]],
    [['Iron longsword', { attack: 3, defense: 1 }], ['War mace', { attack: 4, charm: -1 }]],
    [['Steel saber', { attack: 5, charm: 1 }], ['Battle axe', { attack: 6, defense: -1 }]],
    [['Moonsteel blade', { attack: 7, charm: 2 }], ['Titan warhammer', { attack: 9, defense: -1, charm: -1 }]]
  ],
  helmet: [
    [['Leather cap', { defense: 1 }], ['Straw hat', { charm: 1 }]],
    [['Fur hood', { defense: 1, charm: 1 }], ['Bronze helm', { defense: 2, charm: -1 }]],
    [['Iron helm', { defense: 2, health: 1 }], ['Horned helm', { defense: 2, attack: 1, charm: -1 }]],
    [['Steel greathelm', { defense: 3, health: 1 }], ['Plumed sallet', { defense: 2, health: 1, charm: 2 }]],
    [['Moonsteel helm', { defense: 4, health: 2 }], ['Gem-set circlet', { defense: 2, health: 1, charm: 4 }]]
  ],
  armor: [
    [['Padded vest', { defense: 1, health: 1 }], ['Fur-lined vest', { health: 2 }]],
    [['Leather jerkin', { defense: 2, health: 1 }], ['Studded hide', { defense: 3, charm: -1 }]],
    [['Ring mail', { defense: 3, health: 2 }], ['Iron brigandine', { defense: 4, health: 1, charm: -1 }]],
    [['Scale hauberk', { defense: 5, health: 2 }], ['Steel cuirass', { defense: 6, attack: -1 }]],
    [['Warden’s plate', { defense: 7, health: 3, charm: -1 }], ['Gem-set plate', { defense: 5, health: 3, charm: 2 }]]
  ],
  leggings: [
    [['Cloth wraps', { health: 1 }], ['Hide trousers', { defense: 1 }]],
    [['Leather greaves', { defense: 1, health: 1 }], ['Fur leggings', { health: 2 }]],
    [['Chain chausses', { defense: 2, health: 1 }], ['Iron greaves', { defense: 3, charm: -1 }]],
    [['Steel greaves', { defense: 4, health: 1 }], ['Silvered chausses', { defense: 3, charm: 2 }]],
    [['Moonsteel greaves', { defense: 5, health: 2 }], ['Gem-set tassets', { defense: 3, health: 2, charm: 2 }]]
  ]
};
const GEAR = {}, GEAR_BY_ID = {};   // GEAR[slot][tier - 1] is the list of patterns at that tier
for (const slot of GEAR_SLOTS) {
  GEAR[slot] = GEAR_TABLE[slot].map((patterns, t) => patterns.map(([name, mods], v) => {
    const g = { id: slot + (t + 1) + 'ab'[v], slot, tier: t + 1, name, mods };
    GEAR_BY_ID[g.id] = g;
    return g;
  }));
}
const MAX_GEAR_TIER = 5;
const BAG_SIZE = 12;
function startGear() {
  return {
    weapon: { id: 'start_weapon', slot: 'weapon', tier: 0, name: 'Traveler’s knife', mods: {} },
    helmet: null,
    armor: { id: 'start_armor', slot: 'armor', tier: 0, name: 'Travel clothes', mods: {} },
    leggings: null
  };
}
function copyGear(g) { return g ? { ...g, mods: { ...modsOf(g) } } : null; }
// Older saves (and a few old habits) describe gear as {damage} or {health}; read both.
function modsOf(g) {
  if (!g) return {};
  if (g.mods) return g.mods;
  const m = {};
  if (g.damage) m.attack = g.damage;
  if (g.health) { m.health = g.health; m.defense = Math.floor(g.health / 2); }
  return m;
}
function normalizeGear(g, slot) {
  if (!g) return null;
  if (g.mods && g.slot) return g;
  const known = Object.values(GEAR_BY_ID).find(x => x.slot === slot && x.name === g.name);
  return known ? copyGear(known) : { id: 'old_' + slot, slot, tier: 0, name: g.name || SLOT_NAMES[slot], mods: { ...modsOf(g) } };
}
const MOD_WORDS = { charm: 'Charm', health: 'Health', attack: 'Attack', defense: 'Defense' };
function modsText(mods) {
  const parts = STAT_KEYS.filter(k => mods && mods[k]).map(k => (mods[k] > 0 ? '+' : '−') + Math.abs(mods[k]) + ' ' + MOD_WORDS[k]);
  return parts.length ? parts.join(', ') : 'no bonus';
}
// A rough worth for comparing two pieces: attack and defense matter most, charm least.
function gearScore(g) {
  const m = modsOf(g);
  return (m.attack || 0) * 2.2 + (m.defense || 0) * 2 + (m.health || 0) * 1.8 + (m.charm || 0);
}
function gearLine(g) { return g ? g.name + ' · ' + modsText(modsOf(g)) : 'nothing'; }

// ---------------------------------------------------------------- your stats
function gearTotals() {
  const t = zeroStats();
  for (const slot of GEAR_SLOTS) for (const [k, v] of Object.entries(modsOf(state.equipped && state.equipped[slot]))) if (k in t) t[k] += v;
  return t;
}
// Things that are not gear: guardians' relics, the hunters' lodge, and the blacksmith keeping your blade sharp.
function homeBuilt() { return (state.cur && state.parked ? state.parked.built : state.built) || {}; }
function bonusTotals() {
  const t = zeroStats(), relics = state.relics || {};
  if (relics.fang) t.attack += 1;
  if (relics.aegis) t.health += 2;
  if (relics.mossback) t.defense += 2;
  if (state.lodgeBonus) t.health += 1;
  if (homeBuilt().smithy) t.attack += 1;
  return t;
}
function statTotals() {
  const base = state.stats || START_STATS, gear = gearTotals(), extra = bonusTotals(), t = {};
  for (const k of STAT_KEYS) t[k] = Math.max(k === 'health' ? 1 : 0, (base[k] || 0) + gear[k] + extra[k]);
  return t;
}
function playerMaxHp() { return HP_PER_HEALTH * statTotals().health; }
function playerCharm() { return statTotals().charm; }
function playerDefense() { return statTotals().defense; }
// Call after anything that can change a stat. Extra maximum HP arrives as HP; lost maximum HP never leaves you above the new top.
function recalcStats(full) {
  const before = state.maxHp || 0, max = playerMaxHp();
  state.maxHp = max;
  if (full) state.hp = max;
  else if (max > before) state.hp = Math.min(max, (state.hp || 0) + max - before);
  else state.hp = Math.min(state.hp || 0, max);
}
function spendPoint(key) {
  if (!STAT_KEYS.includes(key) || !(state.statPoints > 0)) return;
  state.stats[key]++;
  state.statPoints--;
  recalcStats();
  say(STAT_INFO[key].name + ' rises to ' + statTotals()[key] + (state.statPoints ? '. ' + state.statPoints + ' point' + (state.statPoints === 1 ? '' : 's') + ' left.' : '.'), 'gold');
  render();
  statsRefresh();
}
// Saves from before stats existed counted hearts. Rebuild a character of the same level and keep the same share of health.
function migrateStats(saved) {
  if (saved.stats && saved.stats.health != null) {
    state.stats = { ...START_STATS, ...saved.stats };
    state.statPoints = saved.statPoints || 0;
    for (const slot of GEAR_SLOTS) state.equipped[slot] = normalizeGear(state.equipped[slot], slot);
    state.bag = (Array.isArray(saved.bag) ? saved.bag : []).filter(g => g && g.slot).map(g => normalizeGear(g, g.slot));
    state.maxHp = playerMaxHp();
    state.hp = Math.max(1, Math.min(state.hp, state.maxHp));
    return;
  }
  const lv = Math.max(1, saved.level || 1) - 1, oldMax = Math.max(1, saved.maxHp || 3), oldHp = Math.max(1, saved.hp == null ? oldMax : saved.hp);
  state.stats = { ...START_STATS };
  state.stats.health += lv;
  state.stats.attack += Math.ceil(lv / 2);
  state.stats.defense += Math.floor(lv / 2);
  state.statPoints = 0;
  state.bag = [];
  const old = saved.equipped || {};
  state.equipped = { weapon: normalizeGear(old.weapon, 'weapon'), helmet: null, armor: normalizeGear(old.armor, 'armor'), leggings: null };
  state.maxHp = 0;
  recalcStats();
  state.hp = Math.max(1, Math.min(state.maxHp, Math.round(state.maxHp * oldHp / oldMax)));
}

// ---------------------------------------------------------------- how fights are scored
// Monsters and settlement soldiers use the same four stats, worked out from their level and what kind of creature they are.
function mobStats(enemy, level) {
  const L = Math.max(1, level || 1), a = enemy.attack || 1, h = enemy.hp || 1;
  return {
    health: Math.max(3, Math.round((3 + (L - 1) * 2.2) * h)),
    attack: Math.max(1, Math.round((1.5 + (L - 1) * .45) * a)),
    defense: Math.round((L - 1) * .4 * (enemy.defense || 1)),
    charm: 1 + Math.floor(L / 2) + (enemy.charm || 0)
  };
}
// One blow: twice the attacker's Attack and a little luck, softened by the target's Defense.
function strike(attack, defense = 0, extra = 0) {
  return Math.max(1, Math.round((2 * attack + extra + Math.floor(Math.random() * 3)) * 10 / (10 + Math.max(0, defense))));
}
function enemyDamage(level, enemy, defense = playerDefense()) { return strike(mobStats(enemy, level).attack, defense); }
function playerStrike(heavy, foeDefense) {
  const t = statTotals();
  return heavy ? strike(t.attack, foeDefense, t.attack + state.level) : strike(t.attack, foeDefense);
}
// Your soldiers carry what you have bought and found: the gear's stats (not your own spent points) plus the hall's tier.
function soldierStats() {
  const g = gearTotals(), tier = (state.town && state.town.tier) || 1;
  return { health: 3 + g.health + tier - 1, attack: 2 + g.attack + (homeBuilt().smithy ? 1 : 0), defense: 1 + g.defense, charm: 1 + Math.max(0, g.charm) };
}
function soldierMaxHp() { return HP_PER_HEALTH * Math.max(1, soldierStats().health); }
function soldierDamage(foeDefense = 0) { return strike(Math.max(1, soldierStats().attack), foeDefense); }
function soldierDefense() { return soldierStats().defense; }
// People are weaker fighters than monsters: a citizen's stats come from the settlement's size and their own luck.
function personStats(s, p) {
  const b = typeof townBracket === 'function' ? townBracket(s.people || 0) : 0, h = strHash((s.id || '') + (p ? p.name || p.id || '' : 'keeper'));
  return { charm: 2 + b + (h % 3), health: 2 + b + ((h >> 3) % 2), attack: 1 + Math.floor(b / 2) + ((h >> 5) % 2), defense: 1 + Math.floor(b / 2) + ((h >> 7) % 2) };
}

// ---------------------------------------------------------------- what charm does
// Buying gets cheaper and selling pays more by 3% / 2% for every point of Charm above the starting 2, to a limit.
function charmBuyMod() { return Math.min(1.25, Math.max(.7, 1 - .03 * (playerCharm() - START_STATS.charm))); }
function charmSellMod() { return Math.min(1.25, Math.max(.8, 1 + .02 * (playerCharm() - START_STATS.charm))); }
// A friendly face earns trust faster: past 6 Charm every favour counts double, past 10 triple.
function favorGain() { return 1 + (playerCharm() >= 6 ? 1 : 0) + (playerCharm() >= 10 ? 1 : 0); }
function charmReward(coin) { return Math.round(coin * (1 + .04 * Math.max(0, playerCharm() - START_STATS.charm))); }
// Chance a monster turns tail when you glare at it: your Charm against its own, better when it is already hurt.
function canIntimidate(enemy) { return !(enemy.boss || enemy.mini || enemy.building || enemy.raid || enemy.faction || enemy.leash); }
function intimidateChance(b) {
  const mob = mobStats(b.enemy, b.level), hurt = 1 - b.hp / Math.max(1, b.maxHp);
  return Math.min(.9, Math.max(.05, .2 + .08 * (playerCharm() - mob.charm) + .25 * hurt));
}

// ---------------------------------------------------------------- wearing gear
function gearBetter(g, slot) { return !state.equipped[slot] || gearScore(g) > gearScore(state.equipped[slot]) + .01; }
function stashGear(g) {
  if (!g || !g.tier) return true;   // the clothes you started in are not worth carrying
  state.bag = state.bag || [];
  if (state.bag.length >= BAG_SIZE) return false;
  state.bag.push(copyGear(g));
  return true;
}
// Puts the piece on if it beats what you wear; the old piece goes in the pack. Returns whether it was worn.
function equipGear(slot, gear) {
  if (!gearBetter(gear, slot)) return false;
  stashGear(state.equipped[slot]);
  state.equipped[slot] = copyGear(gear);
  recalcStats();
  return true;
}
function wearFromBag(i) {
  const g = (state.bag || [])[i];
  if (!g || state.combat) return;
  state.bag.splice(i, 1);
  const old = state.equipped[g.slot];
  state.equipped[g.slot] = g;
  if (old && old.tier) state.bag.push(old);
  recalcStats();
  say('You put on the ' + g.name + '.');
  render(); statsRefresh();
}
function takeOff(slot) {
  const g = state.equipped[slot];
  if (!g || state.combat) return;
  if (!stashGear(g)) { say('Your pack is full of gear: sell something first.', 'alert'); return; }
  state.equipped[slot] = slot === 'weapon' ? { id: 'start_weapon', slot, tier: 0, name: 'Bare hands', mods: {} } : null;
  recalcStats();
  say('You take off the ' + g.name + '.');
  render(); statsRefresh();
}
function gearValue(g) { return Math.max(2, Math.round(basePrice(g.tier, g.slot) * .4)); }
function sellFromBag(i) {
  const g = (state.bag || [])[i];
  if (!g || state.combat) return;
  const coin = gearValue(g);
  state.bag.splice(i, 1);
  state.coin += coin;
  say('You sell the ' + g.name + ' for ' + coin + ' coin.', 'gold');
  render(); statsRefresh();
}
// Anything you come by goes on if it is better, otherwise in the pack, otherwise it is sold on the spot.
function acquireGear(g, source, how) {
  const verb = how || 'Found';
  if (gearBetter(g, g.slot)) {
    const old = state.equipped[g.slot];
    stashGear(old);
    state.equipped[g.slot] = copyGear(g);
    recalcStats();
    say(verb + ' ' + g.name + ' in ' + source + '; put it on (' + modsText(g.mods) + ').', 'gold');
  } else if (stashGear(g)) say(verb + ' ' + g.name + ' in ' + source + ' (' + modsText(g.mods) + '). It is no better than what you wear, so it went in your pack.');
  else {
    const coin = gearValue(g);
    state.coin += coin;
    say(verb + ' ' + g.name + ' in ' + source + ', but your pack is full: sold for ' + coin + ' coin.');
  }
}
// Chests and the things you kill. Better gear turns up farther from home and deeper underground.
function findGear(source) {
  const far = Math.min(.12, Math.hypot(state.x - HOME.x, state.y - HOME.y) / 600);
  let r = Math.random() + far + (state.zone === 'dungeon' ? .1 : state.zone === 'mine' ? Math.min(.12, (state.mineDepth || 1) * .03) : state.zone === 'cave' ? .04 : 0);
  const tier = r < .4 ? 1 : r < .68 ? 2 : r < .88 ? 3 : r < .97 ? 4 : 5;
  const slot = GEAR_SLOTS[Math.floor(Math.random() * GEAR_SLOTS.length)], list = GEAR[slot][tier - 1];
  acquireGear(list[Math.floor(Math.random() * list.length)], source);
}

// ---------------------------------------------------------------- prices and recipes
const TIER_PRICE = [24, 50, 90, 150, 240];
const SLOT_PRICE = { weapon: 1, helmet: .6, armor: 1.3, leggings: .8 };
function basePrice(tier, slot) { return Math.round(TIER_PRICE[tier - 1] * SLOT_PRICE[slot]); }
// Every piece also burns coal at the forge.
const TIER_MATS = [{ copper: 2, wood: 1, coal: 1 }, { copper: 3, furs: 1, wood: 1, coal: 1 }, { iron: 3, furs: 1, coal: 2 }, { iron: 4, silver: 2, coal: 2 }, { gold: 2, gems: 2, silver: 2, coal: 3 }];
function recipeFor(g) {
  const out = {};
  for (const [k, v] of Object.entries(TIER_MATS[g.tier - 1])) out[k] = Math.max(1, Math.round(v * ({ weapon: 1, helmet: .6, armor: 1.4, leggings: .9 }[g.slot])));
  return out;
}
// How good a smith Brackenford's blacksmith is: tier 2 work to begin with, and every upgrade teaches a better tier.
function smithyLevel() { return Math.min(MAX_GEAR_TIER, 2 + (typeof upgradesBought === 'function' ? upgradesBought('smithy') : 0)); }
// A shop's stock is its three best tiers of every slot (older, plainer work is not worth a smith's time).
function gearRowsAt(top, slots = GEAR_SLOTS) {
  const rows = [];
  for (const slot of slots) for (let t = Math.max(1, top - 2); t <= top; t++) for (const g of GEAR[slot][t - 1]) rows.push(g);
  return rows;
}
// Rows of buttons grouped under a heading per slot; row(g) makes the line for one piece.
function gearShelves(pieces, row) {
  return GEAR_SLOTS.map(slot => '<h3>' + SLOT_NAMES[slot] + 's</h3>' + pieces.filter(g => g.slot === slot).map(row).join('')).join('');
}
function openSmithy() {
  if (!state.built.smithy) { say('Build the blacksmith first.', 'alert'); return; }
  const top = smithyLevel();
  const rows = gearShelves(gearRowsAt(top), g => {
    const cost = recipeFor(g), can = canAfford(cost);
    return '<div class="up-row"><span>' + esc(g.name) + ' <em>tier ' + g.tier + ' · ' + esc(modsText(g.mods)) + '</em></span><button ' + (can ? '' : 'disabled') + ' onclick="craftGear(\'' + g.id + '\')">Make · ' + esc(costText(cost)) + '</button></div>';
  });
  showDialog('<h2>Blacksmith</h2><p>This smith can work up to <strong>tier ' + top + '</strong>' + (top < MAX_GEAR_TIER ? '; each smithy upgrade teaches a better tier' : '; there is nothing finer to learn') + '. Materials come from your pack. Better pieces go on at once, the rest wait in your pack.</p>' + rows + '<button onclick="closeDialog()">Leave</button>');
}
function craftGear(id) {
  const g = GEAR_BY_ID[id];
  if (!g || !state.built.smithy || g.tier > smithyLevel()) return;
  const cost = recipeFor(g);
  if (!canAfford(cost)) { say('Not enough materials to make ' + g.name + '.', 'alert'); openSmithy(); return; }
  for (const [k, v] of Object.entries(cost)) state.inv[k] -= v;
  acquireGear(g, 'the forge', 'Forged');
  closeDialog(); render();
}

// ---------------------------------------------------------------- the stats page
function statRowHtml(k) {
  const total = statTotals()[k], base = state.stats[k], g = gearTotals()[k], o = bonusTotals()[k], bits = [];
  if (g) bits.push((g > 0 ? '+' : '−') + Math.abs(g) + ' gear');
  if (o) bits.push((o > 0 ? '+' : '−') + Math.abs(o) + ' other');
  const extra = k === 'health' ? ' (' + HP_PER_HEALTH * total + ' HP)' : '';
  return '<div class="up-row"><span>' + STAT_INFO[k].name + ' <b>' + total + '</b>' + extra + '<br><em>' + base + ' trained' + (bits.length ? ', ' + bits.join(', ') : '') + '. ' + esc(STAT_INFO[k].text) + '</em></span>' +
    (state.statPoints > 0 ? '<button onclick="spendPoint(\'' + k + '\')">+1</button>' : '') + '</div>';
}
function statsHtml() {
  const pts = state.statPoints || 0;
  const slots = GEAR_SLOTS.map(s => {
    const g = state.equipped[s];
    return '<div class="up-row"><span>' + SLOT_NAMES[s] + ' <em>' + esc(gearLine(g)) + '</em></span>' + (g && g.tier ? '<button ' + (state.combat ? 'disabled ' : '') + 'onclick="takeOff(\'' + s + '\')">Take off</button>' : '') + '</div>';
  }).join('');
  const bag = (state.bag || []).map((g, i) => '<div class="up-row"><span>' + esc(g.name) + ' <em>' + esc(SLOT_NAMES[g.slot] + ' · ' + modsText(modsOf(g))) + '</em></span><span><button ' + (state.combat ? 'disabled ' : '') + 'onclick="wearFromBag(' + i + ')">Wear</button> <button ' + (state.combat ? 'disabled ' : '') + 'onclick="sellFromBag(' + i + ')">Sell · ' + gearValue(g) + '</button></span></div>').join('') || '<p class="cap">Nothing spare. Gear you find or buy that is no better than what you wear waits here.</p>';
  return '<h3>You · level ' + state.level + '</h3><p>HP <b>' + state.hp + ' / ' + state.maxHp + '</b> · XP ' + state.xp + ' / ' + state.nextXp + '</p>' +
    (pts ? '<p class="alert"><strong>' + pts + ' stat point' + (pts === 1 ? '' : 's') + ' to spend.</strong> Put both in one stat or one in each of two.</p>' : '') +
    STAT_KEYS.map(statRowHtml).join('') + '<h3>Wearing</h3>' + slots + '<h3>Spare gear (' + (state.bag || []).length + ' / ' + BAG_SIZE + ')</h3>' + bag;
}
// Refreshes the stats page if it is the one on screen.
function statsRefresh() { if (typeof menuRefresh === 'function') menuRefresh('stats'); }
