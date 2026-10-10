// Other settlements you can walk into, the world map with fast travel, and the roads that fast travel leaves behind.
// Loaded after settlement.js and war.js; like them it uses the main script's globals at call time.

// ---------------------------------------------------------------- who is who: a colour for every settlement
const SETTLEMENT_COLORS = ['#e0554d', '#e8902f', '#e8c93a', '#9bd34a', '#2fb5a0', '#4aa3df', '#6a73e8', '#a35fd6', '#e05fa3', '#b9835a', '#9aa5b1', '#4fd6e6', '#ef8f9f', '#d9a441', '#7be0b0', '#a83255'];
const BRACKENFORD_COLOR = '#3fb36b';
function settlementColor(id) {
  if (!id || id === 'home') return BRACKENFORD_COLOR;
  const i = settlements.findIndex(s => s.id === id);
  return i < 0 ? '#9aa5b1' : SETTLEMENT_COLORS[i % SETTLEMENT_COLORS.length];
}
// Overworld workers are named "home:..." or "<settlement id>:worker:n".
function workerColor(workerId) { return settlementColor(String(workerId).split(':')[0]); }
function currentColor() { return settlementColor(state.visiting || 'home'); }
function swatch(id) { return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + settlementColor(id) + ';margin-right:6px;vertical-align:middle"></span>'; }
const SIZE_NAMES = ['Hamlet', 'Village', 'Town', 'Large town', 'City'];

// ---------------------------------------------------------------- the interior of a settlement, built from its seed and its size
const strHash = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const seededRng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// More citizens, a bigger map: width and the number of streets grow with the size bracket (2-4 citizens, 5-7, 8-10, 11-13, 14+).
const NPC_BRACKETS = [{ w: 34, rows: 2 }, { w: 42, rows: 3 }, { w: 50, rows: 3 }, { w: 58, rows: 4 }, { w: 66, rows: 4 }];
function townBracket(people) { return Math.max(0, Math.min(4, Math.floor((people - 2) / 3))); }
const HALL_TITLES = ['Moot house', 'Hall', 'Town hall', 'Guildhall', 'City hall'];
const NPC_KIND_NAMES = { market: 'Market', inn: 'Inn', travel: 'Caravan post', house: 'Home', well: 'Well', huntersLodge: 'Hunters’ lodge', smithy: 'Smithy', jeweler: 'Jeweler', mine: 'Mine' };
// Bigger settlements have more to use: every one has a well, and the lodge, smithy, jeweler and mine come with size.
const NPC_EXTRAS = [['well', 0], ['huntersLodge', 1], ['smithy', 2], ['jeweler', 3], ['mine', 3]];
const NPC_SHOPS = {
  huntersLodge: { buy: ['furs', 'berries'], sell: ['furs', 'berries'] },
  mine: { buy: ['stone', 'copper', 'iron'], sell: ['stone', 'copper', 'iron'] },
  jeweler: { buy: ['gems', 'silver', 'gold'], sell: ['gems', 'silver', 'gold', 'relic'] }
};

function buildNpcTown(s) {
  const b = townBracket(s.people), { w, rows } = NPC_BRACKETS[b], h = 7 + 6 * rows;
  const rnd = seededRng(strHash(s.id) + b * 7919), g = Array.from({ length: h }, () => Array(w).fill('.'));
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y] && g[y][x] !== undefined) g[y][x] = c; };
  const cx = Math.floor(w / 2) - 1, roadRows = Array.from({ length: rows }, (_, k) => h - 6 - 6 * k), py = roadRows[(rows - 1) >> 1];
  // trees first, so everything else paints over them
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (rnd() < 0.16) g[y][x] = '♣';
  const pondLeft = strHash(s.id) % 2 === 0;
  rect(3, h - 5, 9, h - 3, pondLeft ? '≈' : '≡');
  if (b >= 1) rect(w - 10, h - 5, w - 4, h - 3, pondLeft ? '≡' : '≈');
  rect(cx, 1, cx + 1, h - 2, '▒');
  for (const ry of roadRows) rect(2, ry, w - 3, ry, '▒');
  rect(cx - 2, py - 3, cx + 3, py + 2, '▓');
  // building slots above each street, left and right of the main road, nearest the square first
  const slots = [];
  for (const ry of roadRows) {
    for (let x0 = 2; x0 + 4 <= cx - 3; x0 += 6) slots.push({ x0, y0: ry - 4, x1: x0 + 4, y1: ry - 1 });
    for (let x0 = cx + 5; x0 + 4 <= w - 3; x0 += 6) slots.push({ x0, y0: ry - 4, x1: x0 + 4, y1: ry - 1 });
  }
  const dist = p => Math.abs(p.x0 + 2 - (cx + 0.5)) + Math.abs((p.y0 + p.y1) / 2 - py);
  slots.sort((p, q) => dist(p) - dist(q) || p.x0 - q.x0);
  const essentials = ['market', 'hall', 'inn', 'travel'], turn = Math.floor(rnd() * 4), kinds = [];
  for (let i = 0; i < 4; i++) kinds.push(essentials[(i + turn) % 4]);
  for (const [k, from] of NPC_EXTRAS) if (b >= from) kinds.push(k);
  const houses = Math.min(slots.length - kinds.length, Math.ceil(s.people * 0.9));
  for (let i = 0; i < houses; i++) kinds.push('house');
  const plots = {};
  kinds.forEach((kind, i) => {
    const p = slots[i], key = 'p' + i, variant = ['house', 'house2', 'house3'][Math.floor(rnd() * 3)];
    rect(p.x0, p.y0 - 0, p.x1, p.y1, '▣'); g[p.y1][p.x0 + 2] = '▤';
    plots[key] = { ...p, door: [p.x0 + 2, p.y1], front: [p.x0 + 2, p.y1 + 1], kind, art: kind === 'hall' ? 'hut' : kind === 'house' ? variant : kind, tier: kind === 'hall' ? Math.min(3, b + 1) : 1, name: kind === 'hall' ? HALL_TITLES[b] : NPC_KIND_NAMES[kind] };
  });
  for (let x = 0; x < w; x++) { g[0][x] = '#'; g[h - 1][x] = '#'; }
  for (let y = 0; y < h; y++) { g[y][0] = '#'; g[y][w - 1] = '#'; }
  g[h - 1][cx] = '▼'; g[h - 1][cx + 1] = '▼';
  return { id: s.id, people: s.people, bracket: b, grid: g, plots, start: [cx, h - 2], w, h, cx, py, patrol: [[cx - 2, py - 2], [cx + 3, py - 2], [cx + 3, py + 2], [cx - 2, py + 2]] };
}
let npcCurrent = null;
function npcMap() {
  if (!npcCurrent || npcCurrent.id !== state.visiting) npcCurrent = buildNpcTown(townById(state.visiting));
  return npcCurrent;
}
function npcPlotArt(key) { const p = npcMap().plots[key]; return { art: p.art, tier: p.tier }; }
function npcLabel(key) { const p = npcMap().plots[key]; return p.name; }

// ---------------------------------------------------------------- its citizens
function syncNpcPeople() {
  const t = npcMap(), s = townById(state.visiting), total = Math.min(26, Math.max(2, s.people));
  if (townPeople.length === total && townPeople[0] && townPeople[0].town === t.id) return townPeople;
  const rnd = seededRng(strHash(s.id) + 99), plots = Object.values(t.plots), homes = plots.filter(p => p.kind === 'house'), market = plots.find(p => p.kind === 'market'), inn = plots.find(p => p.kind === 'inn');
  const guards = Math.floor(total / 4), taken = new Set([state.x + ',' + state.y]), spot = () => [t.cx - 2 + Math.floor(rnd() * 6), t.py - 2 + Math.floor(rnd() * 5)];
  townPeople = [];
  for (let i = 0; i < total; i++) {
    const guard = i < guards, home = guard ? t.patrol[i % 4] : homes.length ? homes[i % homes.length].front : spot();
    const targets = guard ? t.patrol.map((_, k) => t.patrol[(k + i) % 4]) : [home, spot(), (i % 2 ? market : inn).front];
    const [x, y] = freeSpotNear(home[0], home[1], taken); taken.add(x + ',' + y);
    townPeople.push({ id: 'c' + i, town: t.id, name: personName(i + (strHash(s.id) % 40)), job: guard ? 'guard' : 'villager', idx: i, x, y, targets, ti: 0, path: [], wait: Math.floor(rnd() * 4) });
  }
  return townPeople;
}

// ---------------------------------------------------------------- walking in and out
function inSettlement(town) {
  return (state.zone === 'town' && state.visiting === town.id) || (state.zone === 'overworld' && state.x === town.x && state.y === town.y);
}
function enterSettlement(id, quiet) {
  const s = townById(id);
  if (!s) return;
  ensureWarWorld();
  if (state.wars[id]) { warDialog(id); return; }
  state.visiting = id; state.visited[id] = true; npcCurrent = null; townPeople = []; townPathCache.clear();
  state.zone = 'town'; state.site = null; state.returnPoint = null; state.view = 'explore';
  const t = npcMap(); map = t.grid; state.x = t.start[0]; state.y = t.start[1];
  syncNpcPeople();
  if (!quiet) say('You walk into ' + s.name + ', a ' + SIZE_NAMES[t.bracket].toLowerCase() + ' of ' + s.people + ' citizens. Walk into a door to go in, and into a citizen to talk.', 'gold');
  render();
}
function townTitle() { return state.visiting ? townById(state.visiting).name + ' · ' + SIZE_NAMES[npcMap().bracket] : 'Brackenford · ' + hallName(); }
function exitLabel() { return 'Leave ' + (state.visiting ? townById(state.visiting).name : 'Brackenford'); }

// ---------------------------------------------------------------- its buildings
function npcBuilding(key) {
  const t = npcMap(), p = t.plots[key], s = townById(state.visiting);
  if (!p) return;
  if (p.kind === 'market') trade(s.id);
  else if (p.kind === 'inn') innDialog(s);
  else if (p.kind === 'travel') npcCaravan(s);
  else if (p.kind === 'hall') npcHallDialog(s);
  else if (NPC_SHOPS[p.kind]) npcShop(s, p.kind);
  else if (p.kind === 'smithy') npcSmithy(s);
  else if (p.kind === 'well') npcWell(s);
  else houseDialog(s, p);
}
function npcCaravan(s) {
  showDialog('<h2>' + swatch(s.id) + esc(s.name) + ' caravan post</h2><p>Wagons come and go from here. Ride to any settlement you have visited, or look at the world map.</p><button onclick="openMap()">World map and fast travel</button><button onclick="closeDialog()">Leave</button>');
}
function npcShop(s, kind) {
  ensureWarWorld();
  if (state.wars[s.id]) { warDialog(s.id); return; }
  const g = NPC_SHOPS[kind], row = (side, k) => '<button onclick="npcShopAction(\'' + s.id + '\',\'' + kind + '\',\'' + side + '\',\'' + k + '\')">' + (side === 'buy' ? 'Buy ' : 'Sell ') + itemNames[k] + ' · ' + regionPrice(s, k, side) + ' coin</button>';
  showDialog('<h2>' + swatch(s.id) + esc(s.name) + ' · ' + esc(NPC_KIND_NAMES[kind]) + '</h2><p>' + esc(regionNote(s) || '') + '</p><h3>Buy</h3>' + g.buy.map(k => row('buy', k)).join('') + '<h3>Sell</h3>' + g.sell.map(k => row('sell', k)).join('') + '<button onclick="closeDialog()">Leave</button>');
}
function npcShopAction(id, kind, side, item) {
  const s = townById(id);
  if (!s || !inSettlement(s) || !NPC_SHOPS[kind] || !NPC_SHOPS[kind][side].includes(item)) return;
  if (side === 'buy') {
    const price = regionPrice(s, item, 'buy');
    if (state.coin < price) say('You need ' + price + ' coin for that.', 'alert');
    else if (roomFor(item) < 1) say('You cannot carry more ' + itemNames[item].toLowerCase() + ' (' + supplyCap() + ').', 'alert');
    else { state.coin -= price; addItem(item, 1, true); unlockByMaterial(item); say(s.name + ' sells you ' + itemNames[item].toLowerCase() + ' for ' + price + ' coin.', 'gold'); }
  } else if (!state.inv[item]) say('You have no ' + itemNames[item].toLowerCase() + ' to sell.', 'alert');
  else { const price = regionPrice(s, item, 'sell'); state.inv[item]--; state.coin += price; say(s.name + ' buys ' + itemNames[item].toLowerCase() + ' for ' + price + ' coin.', 'gold'); }
  render(); npcShop(s, kind);
}
// A smith's best work depends on the size of the settlement.
function smithTier(s) { return Math.min(4, townBracket(s.people) + 1); }
function gearPrice(s, tier) { return Math.round([20, 45, 80, 140][tier - 1] * (1 + 0.1 * (s.bias || 0))); }
function gearRows(s, top) {
  const rows = [];
  for (const slot of ['weapon', 'armor']) for (let t = 1; t <= top; t++) {
    const g = GEAR[slot][t - 1], better = slot === 'weapon' ? g.damage > state.equipped.weapon.damage : g.health > state.equipped.armor.health, price = gearPrice(s, t);
    rows.push({ slot, tier: t, gear: g, better, price, label: g.name + ' · ' + (slot === 'weapon' ? '+' + g.damage + ' damage' : '+' + g.health + ' hearts') });
  }
  return rows;
}
function npcSmithy(s) {
  const rows = gearRows(s, smithTier(s)).map(r => '<button ' + (r.better && state.coin >= r.price ? '' : 'disabled') + ' onclick="buyGear(\'' + s.id + '\',\'' + r.slot + '\',' + r.tier + ')">' + esc(r.label) + ' · ' + r.price + ' coin' + (r.better ? '' : ' (no better than yours)') + '</button>').join('');
  showDialog('<h2>' + swatch(s.id) + esc(s.name) + ' smithy</h2><p>The smith sells finished weapons and armor. You wear a ' + esc(state.equipped.weapon.name) + ' (+' + state.equipped.weapon.damage + ') and ' + esc(state.equipped.armor.name) + ' (+' + state.equipped.armor.health + ').</p>' + rows + '<button onclick="closeDialog()">Leave</button>');
}
function buyGear(id, slot, tier) {
  const s = townById(id);
  if (!s || !inSettlement(s) || tier < 1 || tier > smithTier(s) || !GEAR[slot]) return;
  const g = GEAR[slot][tier - 1], price = gearPrice(s, tier);
  if (state.coin < price) { say('The smith wants ' + price + ' coin.', 'alert'); npcSmithy(s); return; }
  if (!equipGear(slot, g)) { say('That is no better than what you wear.', 'alert'); npcSmithy(s); return; }
  state.coin -= price; say('You buy ' + g.name + ' for ' + price + ' coin and put it on.', 'gold');
  render(); npcSmithy(s);
}
function npcWell(s) {
  const r = relOf(s.id), heal = 2;
  showDialog('<h2>' + swatch(s.id) + esc(s.name) + ' well</h2><p>Cool, clean water, free to travelers. It restores ' + heal + ' hearts, once a day in each settlement.</p><button onclick="drinkNpcWell(\'' + s.id + '\')">Drink · heal ' + heal + ' hearts</button><button onclick="closeDialog()">Leave</button>');
}
function drinkNpcWell(id) {
  const s = townById(id);
  if (!s || !inSettlement(s)) return;
  const r = relOf(id);
  if (r.wellDay === state.day) { say('The bucket needs time to refill (once a day).', 'alert'); render(); return; }
  r.wellDay = state.day; state.hp = Math.min(state.maxHp, state.hp + 2); say('Cool water restores your strength.', 'gold'); render(); closeDialog();
}
function innDialog(s) {
  const cost = 5 + (s.bias || 0);
  showDialog('<h2>' + esc(s.name) + ' inn</h2><p>A warm bed and a hot meal. Spend the night and your hearts are restored; the day moves on.</p><button ' + (state.coin >= cost ? '' : 'disabled') + ' onclick="paidRest(\'' + s.id + '\')">Rest for the night · ' + cost + ' coin</button><button onclick="closeDialog()">Leave</button>');
}
const FAMILIES = ['Ashby', 'Brook', 'Calder', 'Dunn', 'Edgar', 'Fenn', 'Garrow', 'Hale', 'Ives', 'Jarrow', 'Keene', 'Lorne', 'Marsh', 'Nolan', 'Orme', 'Pike'];
function houseDialog(s, p) {
  const h = strHash(s.id + p.x0 + ',' + p.y0), family = FAMILIES[h % FAMILIES.length];
  const lines = ['The ' + family + ' family keeps a tidy home. Someone peers out and waves you on.', 'The door opens a crack: “Trading is at the market, and the inn will put you up. We keep to ourselves.”', 'Smoke curls from the chimney. The ' + family + 's are at supper and would rather not be disturbed.'];
  showDialog('<h2>' + esc(family) + ' home</h2><p>' + esc(lines[h % lines.length]) + '</p><button onclick="closeDialog()">Leave</button>');
}
const VISITOR_TALK = {
  villager: ['Welcome, traveler. The market has what we have.', 'Mind the road at night; it has been a restless season.', 'We make do with what the fields give us.', 'The inn keeps a good fire.'],
  guard: ['Keep the peace and you are welcome here.', 'We watch the road. Someone should.', 'Trouble finds this town now and then. We are ready for it.']
};
Object.assign(TALK, VISITOR_TALK);
Object.assign(JOB_TITLES, { villager: 'Villager', guard: 'Guard' });
function visitorGossip(p) {
  const s = townById(state.visiting), others = settlements.filter(o => o !== s && o.discovered), h = townHash(p.idx + state.day, s.id.length), lines = [];
  lines.push(s.aggression >= 0.3 ? 'The young folk here are itching for a fight.' : s.aggression >= 0.12 ? 'People are wary of the neighbors these days.' : 'It has been a quiet season.');
  if (others.length) { const o = others[h % others.length]; lines.push('They say ' + o.name + ' is ' + moodOf(o) + ', and about ' + o.people + ' strong.'); }
  if (state.raid && state.raid.from === s.id) lines.push('Some of our people marched on Brackenford. I hope that goes well for them, whatever you think of it.');
  if (state.wars[s.id]) lines.push('We are at war with Brackenford!');
  if (s.owner === 'player') lines.push('We fly Brackenford’s banner now. It has not been so bad.');
  return lines[h % lines.length];
}
function renderVisitPanel() {
  ensureWarWorld();
  const s = townById(state.visiting), t = npcMap(), owner = ownerText(s), plots = Object.values(t.plots);
  document.getElementById('town-stats').innerHTML =
    '<div class="town-metric">Settlement<b>' + swatch(s.id) + esc(s.name) + '</b></div>' +
    '<div class="town-metric">Size<b>' + SIZE_NAMES[t.bracket] + '</b></div>' +
    '<div class="town-metric">Citizens<b>' + s.people + '</b></div>' +
    '<div class="town-metric">Mood<b>' + moodOf(s) + '</b></div>' +
    '<div class="town-metric">Standing<b>' + standingText(s) + '</b></div>' +
    '<div class="town-metric">Distance<b>' + Math.round(Math.hypot(s.x - HOME.x, s.y - HOME.y)) + ' leagues</b></div>' +
    '<div class="town-metric">Ruler<b>' + esc(owner || 'its own people') + '</b></div>';
  const uses = { market: 'trade goods', inn: 'rest for coin', travel: 'world map and fast travel', hall: 'news and war', well: 'free healing', huntersLodge: 'furs and game', smithy: 'weapons and armor', jeweler: 'gems, silver and gold', mine: 'stone and ore' };
  document.getElementById('townfolk').innerHTML = ['market', 'inn', 'travel', 'hall', 'well', 'huntersLodge', 'smithy', 'jeweler', 'mine'].map(k => { const p = plots.find(q => q.kind === k); return p ? '<div class="town-person"><b>' + esc(p.name) + '</b><span>' + uses[k] + '</span></div>' : ''; }).join('') + '<div class="town-person"><b>' + plots.filter(p => p.kind === 'house').length + ' homes</b><span>' + s.people + ' citizens live here</span></div>';
  document.getElementById('town-hint').textContent = 'Walk into a door to go in, or into a citizen to talk. The market trades regional goods, the inn restores your hearts, the caravan post opens the world map (fast travel is arranged from any settlement you have visited), the hall lets you declare war, and bigger settlements also have a well, a hunters’ lodge, a smithy, a jeweler and a mine. The town grows and shrinks as its people do, and its map with it.';
}

// ---------------------------------------------------------------- the roads fast travel leaves on the overworld
let roadCache = { n: -1, set: new Set() };
function roadSet() {
  if (!Array.isArray(state.roads)) state.roads = [];
  if (roadCache.n !== state.roads.length) roadCache = { n: state.roads.length, set: new Set(state.roads) };
  return roadCache.set;
}
function isRoad(x, y) { return roadSet().has(y * WORLD_W + x); }
// A cheapest path over open ground (water is impassable; trees and rocks cost more, other landmarks are avoided).
function findRoad(a, b) {
  const W = WORLD_W, H = WORLD_H, start = a.y * W + a.x, goal = b.y * W + b.x;
  const cost = (x, y) => { const c = overworld[y][x]; if (c === '≈' || c === '#') return Infinity; if ('SCDMK⌂?'.includes(c)) return (x === a.x && y === a.y) || (x === b.x && y === b.y) ? 1 : 8; return '♣▲%'.includes(c) ? 3 : 1; };
  const heap = [], push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const g = new Map([[start, 0]]), prev = new Map(), h = (x, y) => Math.abs(x - b.x) + Math.abs(y - b.y);
  push(h(a.x, a.y), start);
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goal) { const path = []; for (let n = goal; n !== undefined; n = prev.get(n)) path.push([n % W, Math.floor(n / W)]); return path.reverse(); }
    const cx = cur % W, cy = Math.floor(cur / W), gc = g.get(cur);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const step = cost(nx, ny);
      if (step === Infinity) continue;
      const n = ny * W + nx, ng = gc + step;
      if (ng < (g.has(n) ? g.get(n) : Infinity)) { g.set(n, ng); prev.set(n, cur); push(ng + h(nx, ny), n); }
    }
  }
  return null;
}
function addRoad(a, b) {
  const path = findRoad(a, b);
  if (!path) return 0;
  const set = roadSet();
  let added = 0;
  for (const [x, y] of path) { const k = y * WORLD_W + x; if (!set.has(k)) { set.add(k); state.roads.push(k); added++; } }
  roadCache = { n: state.roads.length, set };
  return added;
}

// ---------------------------------------------------------------- the world map and fast travel
function hereSettlement() {
  if (state.zone === 'town') return state.visiting ? townById(state.visiting) : { id: 'home', name: 'Brackenford', x: HOME.x, y: HOME.y };
  if (state.zone !== 'overworld') return null;
  if (state.x === HOME.x && state.y === HOME.y) return { id: 'home', name: 'Brackenford', x: HOME.x, y: HOME.y };
  return settlements.find(s => s.discovered && s.x === state.x && s.y === state.y) || null;
}
function settlementList() { return [{ id: 'home', name: 'Brackenford', x: HOME.x, y: HOME.y }, ...settlements.filter(s => s.discovered)]; }
function isVisited(s) { return s.id === 'home' || !!(state.visited && state.visited[s.id]); }
function travelCost(a, b) { return Math.max(3, Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 3)); }
function travelBlock(here, dest) {
  if (!here) return 'Fast travel is arranged from inside a settlement.';
  if (dest.id === here.id) return 'You are here.';
  if (!isVisited(dest)) return 'You have not visited it yet.';
  if (state.wars && state.wars[dest.id]) return 'At war: its gates are shut.';
  if (state.coin < travelCost(here, dest)) return 'Not enough coin.';
  return '';
}
function travelTo(id) {
  const here = hereSettlement(), dest = settlementList().find(s => s.id === id);
  if (!dest) return;
  const block = travelBlock(here, dest);
  if (block) { say(block, 'alert'); if (dialogIsOpen()) openMap(); return; }
  const cost = travelCost(here, dest);
  state.coin -= cost;
  const road = addRoad(here, dest);
  closeDialog();
  if (state.zone === 'town') { map = overworld; state.zone = 'overworld'; state.visiting = null; townPeople = []; }
  if (dest.id === 'home') enterTown(true); else enterSettlement(dest.id, true);
  say('You ride from ' + here.name + ' to ' + dest.name + ' for ' + cost + ' coin' + (road ? ', and the road between them is now marked on your map.' : '.'), 'gold');
  render();
}
function drawWorldMap(cv) {
  const S = 3, ctx = cv.getContext('2d');
  ctx.fillStyle = '#141c17'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    let c = overworld[y][x];
    const road = isRoad(x, y) && c !== '≈';        // a road you have ridden shows even where you have never walked
    if (!state.explored[y][x] && !road) continue;
    if (c === 'S' || c === '⌂') c = '.';
    ctx.fillStyle = road ? '#c9a96e' : GFX.overview(c);
    ctx.fillRect(x * S, y * S, S, S);
  }
  const marker = (s, own) => {
    const visited = isVisited(s), col = own || settlementColor(s.id);
    ctx.fillStyle = '#101713'; ctx.fillRect(s.x * S - 4, s.y * S - 4, 11, 11);
    ctx.fillStyle = col; if (visited) ctx.fillRect(s.x * S - 3, s.y * S - 3, 9, 9); else { ctx.fillRect(s.x * S - 3, s.y * S - 3, 9, 2); ctx.fillRect(s.x * S - 3, s.y * S + 4, 9, 2); ctx.fillRect(s.x * S - 3, s.y * S - 3, 2, 9); ctx.fillRect(s.x * S + 4, s.y * S - 3, 2, 9); }
  };
  for (const s of settlements) if (s.discovered) marker(s);
  marker({ id: 'home', x: HOME.x, y: HOME.y });
  const here = state.zone === 'town' ? hereSettlement() : { x: state.x, y: state.y };
  if (here) { ctx.fillStyle = '#ffffff'; ctx.fillRect(here.x * S - 1, here.y * S - 1, 5, 5); ctx.fillStyle = '#14181a'; ctx.fillRect(here.x * S, here.y * S, 3, 3); }
}
function openMap() {
  if (state.combat || !['overworld', 'town'].includes(state.zone)) return;
  ensureWarWorld();
  const here = hereSettlement();
  const rows = settlementList().map(s => {
    const full = s.id === 'home' ? { people: state.town.people, aggression: 0 } : s, visited = isVisited(s);
    const bits = [s.id === 'home' ? 'your home' : Math.round(Math.hypot(s.x - HOME.x, s.y - HOME.y)) + ' leagues from Brackenford'], war = state.wars[s.id];
    bits.push(full.people + ' citizens');
    if (s.id !== 'home') bits.push(moodOf(full), visited ? 'visited' : 'not visited yet', war ? 'at war: ' + war.left + ' defenders' : ownerText(s));
    const block = travelBlock(here, s), cost = here && s.id !== here.id ? travelCost(here, s) : 0;
    const action = here && s.id === here.id ? '<em>you are here</em>' : '<button ' + (block ? 'disabled' : '') + ' onclick="travelTo(\'' + s.id + '\')">Ride' + (here ? ' · ' + cost + ' coin' : '') + '</button>';
    return '<div class="up-row"><span>' + swatch(s.id) + esc(s.name) + '<br><em>' + esc(bits.filter(Boolean).join(' · ')) + (block && here && s.id !== here.id ? ' · ' + esc(block) : '') + '</em></span><span>' + action + '</span></div>';
  }).join('');
  showDialog('<h2>World map</h2><canvas id="worldmap" width="' + WORLD_W * 3 + '" height="' + WORLD_H * 3 + '" style="width:100%;image-rendering:pixelated;border:1px solid #2e4034"></canvas>' +
    '<p>Filled squares are settlements you have visited, outlines ones you have only seen; tan lines are roads you have ridden. The white dot is you.</p>' +
    '<p>' + (here ? 'You are in ' + esc(here.name) + '. Ride to any settlement you have visited; farther costs more.' : 'Fast travel is arranged from inside a settlement: walk into one to ride to another.') + '</p>' + rows +
    '<button onclick="closeDialog()">Close</button>');
  drawWorldMap(document.getElementById('worldmap'));
}
