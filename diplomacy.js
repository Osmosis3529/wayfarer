// Who likes whom: rivalries between settlements, their quest boards, trade deals and alliances, and the caravans that
// carry out the deals. Loaded after towns.js; like the other scripts it runs from events and uses the main script's
// globals (state, say, showDialog, ...) at call time.

const QUEST_RESERVE = 5;      // a caravan never sells the last few of anything
const DEAL_DAYS = 2;          // a caravan comes home every two days
const FAVOR_FOR_DEAL = 2;     // quests a settlement wants done before it trusts you with a deal

// ---------------------------------------------------------------- who dislikes whom
// Most settlements cannot stand one of their neighbours. The dislike is mutual and is saved with the settlement.
function ensureRivalries() {
  if (settlements.every(s => Array.isArray(s.dislikes))) return;
  for (const s of settlements) if (!Array.isArray(s.dislikes)) s.dislikes = [];
  const link = (a, b) => { if (a && b && a !== b && !a.dislikes.includes(b.id)) { a.dislikes.push(b.id); b.dislikes.push(a.id); } };
  for (const s of settlements) {
    if (s.dislikes.length || Math.random() > 0.7) continue;
    const near = settlements.filter(t => t !== s).sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y)).slice(0, 4);
    link(s, near[Math.floor(Math.random() * near.length)]);
  }
}
function rivalsOf(s) { return (s.dislikes || []).map(townById).filter(Boolean); }

// ---------------------------------------------------------------- what each settlement thinks of you
function relOf(id) { if (!state.rel) state.rel = {}; return state.rel[id] || (state.rel[id] = { favor: 0, done: 0, quest: null, wellDay: 0 }); }
function isAlly(id) { return !!(state.deals && state.deals[id]); }
function isHostile(id) { return !!(state.hostile && state.hostile[id]); }
function allies() { return settlements.filter(s => isAlly(s.id)); }
function standingText(s) {
  if (s.owner === 'player') return 'yours';
  if (isAlly(s.id)) return 'ally';
  if (state.wars && state.wars[s.id]) return 'at war (you attacked)';
  if (isHostile(s.id)) return 'at war';
  const f = relOf(s.id).favor;
  return f >= FAVOR_FOR_DEAL ? 'friendly' : f > 0 ? 'warming' : 'neutral';
}

// ---------------------------------------------------------------- quests
// Each settlement offers a few jobs at a time; what it offers next depends on how many you have finished for it.
function questOffers(s) {
  const r = relOf(s.id), b = townBracket(s.people), rnd = seededRng(strHash(s.id) + r.done * 7919 + 17);
  const pool = s.scarce && s.scarce.length ? s.scarce : TRADE_GOODS, item = pool[Math.floor(rnd() * pool.length)];
  const n = 4 + Math.floor(rnd() * 4) + b * 2, hn = 3 + Math.floor(rnd() * 3) + b;
  const offers = [
    { type: 'gather', item, n, reward: Math.round(n * (sellPrices[item] || 3) * 1.8) + 6 + b * 3 },
    { type: 'hunt', n: hn, kills: 0, reward: hn * 7 + 6 + b * 3 }
  ];
  if (r.favor >= FAVOR_FOR_DEAL && !isAlly(s.id)) offers.push({ type: 'deal', fee: 20 + 10 * b, reward: 0 });
  return offers;
}
function questLine(q) {
  if (q.type === 'gather') return 'Bring ' + q.n + ' ' + itemNames[q.item].toLowerCase();
  if (q.type === 'hunt') return 'Defeat ' + q.n + ' enemies in the wilds, caves or dungeons';
  return 'Establish a trade deal';
}
function questProgress(q) { return q.type === 'gather' ? Math.min(state.inv[q.item], q.n) + ' / ' + q.n + ' in your pack' : q.type === 'hunt' ? Math.min(q.kills, q.n) + ' / ' + q.n + ' defeated' : ''; }
function questReady(q) { return q.type === 'gather' ? state.inv[q.item] >= q.n : q.type === 'hunt' ? q.kills >= q.n : false; }
function takeQuest(id, i) {
  const s = townById(id);
  if (!s || !inSettlement(s)) return;
  const r = relOf(id), offer = questOffers(s)[i];
  if (r.quest || !offer || offer.type === 'deal') return;
  r.quest = { ...offer, day: state.day };
  say(s.name + ' asks: ' + questLine(r.quest).toLowerCase() + '. Reward: ' + r.quest.reward + ' coin and their trust.', 'gold');
  render(); npcHallDialog(s);
}
function turnInQuest(id) {
  const s = townById(id), r = relOf(id), q = r.quest;
  if (!s || !q || !inSettlement(s) || !questReady(q)) return;
  if (q.type === 'gather') state.inv[q.item] -= q.n;
  state.coin += q.reward; r.favor++; r.done++; r.quest = null;
  s.aggression = Math.max(0, +(s.aggression - 0.05).toFixed(2));
  say(s.name + ' pays you ' + q.reward + ' coin and thinks better of you' + (r.favor === FAVOR_FOR_DEAL && !isAlly(id) ? ': they would now sign a trade deal' : '') + '.', 'gold');
  render(); npcHallDialog(s);
}
function abandonQuest(id) {
  const s = townById(id), r = relOf(id);
  if (!s || !r.quest) return;
  r.quest = null; say('You drop the job for ' + s.name + '.');
  if (inSettlement(s) && dialogIsOpen()) npcHallDialog(s); else if (dialogIsOpen()) journal();
}
// Every enemy you or your soldiers defeat counts towards the hunting jobs you have taken.
function huntKill() {
  for (const [id, r] of Object.entries(state.rel || {})) {
    const q = r.quest;
    if (!q || q.type !== 'hunt' || q.kills >= q.n) continue;
    q.kills++;
    if (q.kills >= q.n) say('That is enough enemies for ' + (townById(id) || { name: 'the settlement' }).name + '. Report back at their hall.', 'gold');
  }
}

// ---------------------------------------------------------------- trade deals and alliances
function dealBlock(s) {
  if (!s || s.owner) return 'It answers to someone else.';
  if (isAlly(s.id)) return 'You already have a deal with them.';
  if (state.wars[s.id] || isHostile(s.id)) return 'You are at war.';
  if (!state.built.caravanPost) return 'Build a caravan post in Brackenford first: its caravaners carry out the deal.';
  if (crew('caravanPost') < 1) return 'Your caravan post has nobody working it. Assign a caravaner in the hall.';
  if (relOf(s.id).favor < FAVOR_FOR_DEAL) return 'They do not trust you yet: finish ' + (FAVOR_FOR_DEAL - relOf(s.id).favor) + ' more of their jobs.';
  return '';
}
function newEnemiesIfAllied(s) { return rivalsOf(s).filter(t => t.owner !== 'player' && !isHostile(t.id)); }
function signDeal(id) {
  const s = townById(id);
  if (!s || !inSettlement(s)) return;
  const block = dealBlock(s), fee = 20 + 10 * townBracket(s.people);
  if (block) { say(block, 'alert'); npcHallDialog(s); return; }
  if (state.coin < fee) { say('The deal costs ' + fee + ' coin to seal.', 'alert'); npcHallDialog(s); return; }
  state.coin -= fee;
  state.deals[id] = { sell: null, buy: null, gear: false, last: state.day, since: state.day, trips: 0, profit: 0 };
  say('You and ' + s.name + ' seal a trade deal: you are allies. Set what the caravans carry at your caravan post.', 'gold');
  for (const t of newEnemiesIfAllied(s)) makeHostile(t, id);
  render(); npcHallDialog(s);
}
function breakAlliance(id, why) {
  const s = townById(id);
  if (!s || !isAlly(id)) return;
  delete state.deals[id];
  relOf(id).favor = 0;
  say(why || 'You end your alliance with ' + s.name + '.', 'alert');
  reconcileHostility();
  render(); if (dialogIsOpen()) caravanDialog('caravanPost');
}
// Anyone who hates one of your allies makes war on you; they stand down when that alliance ends.
function makeHostile(t, via) {
  if (!state.hostile) state.hostile = {};
  if (t.owner === 'player' || state.hostile[t.id]) return;
  state.hostile[t.id] = { since: state.day, via, next: state.day + 2 };
  relOf(t.id).quest = null;
  if (isAlly(t.id)) { delete state.deals[t.id]; say('Your alliance with ' + t.name + ' ends: they will not stand beside someone allied with ' + (townById(via) || { name: 'their rival' }).name + '.', 'alert'); }
  say(t.name + ' declares war on Brackenford! They hate ' + (townById(via) || { name: 'your ally' }).name + ', and so they hate you.', 'alert');
}
function reconcileHostility() {
  for (const [id, h] of Object.entries(state.hostile || {})) {
    if (!h.via || isAlly(h.via)) continue;          // a war you started (no 'via') lasts until it is settled
    delete state.hostile[id];
    say((townById(id) || { name: 'A settlement' }).name + ' calls off its war against Brackenford.', 'gold');
  }
}

// ---------------------------------------------------------------- caravans: passive trade with allies
function dealOrder() { return Object.keys(state.deals || {}).sort((a, b) => state.deals[a].since - state.deals[b].since || a.localeCompare(b)); }
// Each caravaner runs one deal, the oldest first.
function runningDeals() { return dealOrder().slice(0, state.built.caravanPost ? crew('caravanPost') : 0); }
function caravanLoad() { return Math.max(3, Math.round(4 * upMult('caravanPost') * (state.town.tier || 1))); }
// The best piece of gear a settlement's smith could sell you that is better than yours and that you can pay for.
function bestGear(s, spare) {
  let best = null;
  for (const r of gearRows(s, smithTier(s))) {
    if (!r.better || state.coin - r.price < spare) continue;
    const gain = r.slot === 'weapon' ? r.gear.damage - state.equipped.weapon.damage : r.gear.health - state.equipped.armor.health;
    if (!best || gain > best.gain || (gain === best.gain && r.price < best.price)) best = { ...r, gain };
  }
  return best;
}
function runCaravan(s, d) {
  const load = caravanLoad(), parts = [], name = k => itemNames[k].toLowerCase();
  let net = 0;
  d.last = state.day;
  if (d.sell && TRADE_GOODS.includes(d.sell)) {
    const n = Math.min(load, Math.max(0, state.inv[d.sell] - QUEST_RESERVE));
    if (n > 0) { const price = regionPrice(s, d.sell, 'sell'); state.inv[d.sell] -= n; state.coin += n * price; net += n * price; parts.push('sold ' + n + ' ' + name(d.sell) + ' for ' + n * price + ' coin'); }
  }
  if (d.buy && TRADE_GOODS.includes(d.buy)) {
    const price = regionPrice(s, d.buy, 'buy'), n = Math.min(load, roomFor(d.buy), Math.floor(Math.max(0, state.coin - 10) / price));
    if (n > 0) { state.coin -= n * price; addItem(d.buy, n, true); unlockByMaterial(d.buy); net -= n * price; parts.push('bought ' + n + ' ' + name(d.buy) + ' for ' + n * price + ' coin'); }
  }
  if (d.gear) {
    const g = bestGear(s, 10);
    if (g && equipGear(g.slot, g.gear)) { state.coin -= g.price; net -= g.price; parts.push('brought back ' + g.gear.name + ' (' + g.price + ' coin)'); }
  }
  d.trips++; d.profit += net;
  say('The caravan from ' + s.name + ' returns' + (parts.length ? ': ' + parts.join(', ') + '.' : ' with nothing to trade.'), 'gold');
}
function caravanTurn() {
  for (const id of runningDeals()) {
    const d = state.deals[id], s = townById(id);
    if (!s || isHostile(id) || state.wars[id] || state.day - d.last < DEAL_DAYS) continue;
    runCaravan(s, d);
  }
}
function dealCycle(id, field) {
  const d = state.deals && state.deals[id];
  if (!d || (field !== 'sell' && field !== 'buy')) return;
  const list = [null, ...TRADE_GOODS];
  d[field] = list[(list.indexOf(d[field]) + 1) % list.length];
  caravanDialog('caravanPost');
}
function dealGear(id) { const d = state.deals && state.deals[id]; if (!d) return; d.gear = !d.gear; caravanDialog('caravanPost'); }
function caravanDialog(key) {
  const running = new Set(runningDeals()), ids = dealOrder();
  const rows = ids.map(id => {
    const s = townById(id), d = state.deals[id], on = running.has(id);
    return '<div class="deal"><h3>' + swatch(id) + esc(s.name) + (on ? '' : ' · <em>waiting for a free caravaner</em>') + '</h3>' +
      '<p>' + esc(regionNote(s)) + '</p>' +
      '<p>' + d.trips + ' trip' + (d.trips === 1 ? '' : 's') + ' so far, ' + (d.profit >= 0 ? '+' : '') + d.profit + ' coin overall' + (on ? '; next caravan in ' + Math.max(0, DEAL_DAYS - (state.day - d.last)) + ' day(s)' : '') + '.</p>' +
      '<button onclick="dealCycle(\'' + id + '\',\'sell\')">Sell: ' + (d.sell ? esc(itemNames[d.sell]) : 'nothing') + '</button>' +
      '<button onclick="dealCycle(\'' + id + '\',\'buy\')">Buy: ' + (d.buy ? esc(itemNames[d.buy]) : 'nothing') + '</button>' +
      '<button onclick="dealGear(\'' + id + '\')">Equipment: ' + (d.gear ? 'buy better gear' : 'no') + '</button>' +
      '<button onclick="breakAlliance(\'' + id + '\')">End the deal and the alliance</button></div>';
  }).join('') || '<p>No deals yet. Do jobs for a settlement until it trusts you, then ask at its hall to seal a trade deal: that makes you allies.</p>';
  showDialog('<h2>' + esc(bld(key)) + '</h2>' + staffBlock(key) +
    '<p>Each caravaner here runs one trade deal. Every ' + DEAL_DAYS + ' days its caravan carries up to ' + caravanLoad() + ' goods each way: it sells the goods you choose (never your last ' + QUEST_RESERVE + ') for the partner’s prices, buys the goods you choose with your coin (keeping 10 spare), and can fetch better weapons and armor from the partner’s smith.</p>' + rows + '<button onclick="closeDialog()">Leave</button>');
}

// ---------------------------------------------------------------- the hall of another settlement
function npcHallDialog(s) {
  ensureWarWorld();
  const w = state.wars[s.id], t = npcMap(), owner = ownerText(s), r = relOf(s.id), rivals = rivalsOf(s);
  let body = '<h2>' + swatch(s.id) + esc(s.name) + '</h2><p><strong>' + SIZE_NAMES[t.bracket] + '</strong> · ' + s.people + ' citizens · ' + moodOf(s) + (owner ? ' · ' + esc(owner) : '') + '</p><p>' + esc(regionNote(s) || '') + '</p>' +
    '<p>They think of you as: <strong>' + standingText(s) + '</strong>' + (r.done ? ' (' + r.done + ' job' + (r.done === 1 ? '' : 's') + ' done)' : '') + '. ' + (rivals.length ? 'They cannot stand ' + rivals.map(x => esc(x.name)).join(' or ') + '.' : 'They have no rivals.') + '</p>';
  if (!w && !isHostile(s.id) && s.owner !== 'player') {
    if (r.quest) {
      const q = r.quest;
      body += '<h3>Your job</h3><p>' + esc(questLine(q)) + ' · ' + esc(questProgress(q)) + ' · reward ' + q.reward + ' coin</p><button ' + (questReady(q) ? '' : 'disabled') + ' onclick="turnInQuest(\'' + s.id + '\')">Turn in</button><button onclick="abandonQuest(\'' + s.id + '\')">Give it up</button>';
    } else {
      body += '<h3>Jobs on offer</h3>' + questOffers(s).map((o, i) => {
        if (o.type === 'deal') {
          const block = dealBlock(s), foes = newEnemiesIfAllied(s);
          return '<p>A trade deal makes you allies' + (foes.length ? ' and makes enemies of ' + foes.map(x => esc(x.name)).join(', ') : '') + '.</p><button ' + (block || state.coin < o.fee ? 'disabled' : '') + ' onclick="signDeal(\'' + s.id + '\')">Strike a trade deal · ' + o.fee + ' coin</button>' + (block ? '<p><em>' + esc(block) + '</em></p>' : '');
        }
        return '<button onclick="takeQuest(\'' + s.id + '\',' + i + ')">' + esc(questLine(o)) + ' · ' + o.reward + ' coin</button>';
      }).join('');
    }
  }
  body += (w ? '' : warButton(s.id) || '<p>You need a barracks in Brackenford before you can wage war.</p>') + '<button onclick="closeDialog()">Leave</button>';
  showDialog(body);
}

// ---------------------------------------------------------------- the journal
function journal() {
  ensureWarWorld();
  const jobs = Object.entries(state.rel || {}).filter(([, r]) => r.quest).map(([id, r]) => {
    const s = townById(id), q = r.quest;
    return '<div class="up-row"><span>' + swatch(id) + esc(s.name) + '<br><em>' + esc(questLine(q)) + ' · ' + esc(questProgress(q)) + ' · ' + q.reward + ' coin</em></span><span><button onclick="abandonQuest(\'' + id + '\')">Give up</button></span></div>';
  }).join('') || '<p>No jobs taken. Ask at the hall of any settlement you visit.</p>';
  const ally = allies().map(s => '<div class="up-row"><span>' + swatch(s.id) + esc(s.name) + '<br><em>' + (state.deals[s.id].trips) + ' caravan trips</em></span></div>').join('') || '<p>No allies yet.</p>';
  const foes = Object.keys(state.hostile || {}).map(id => { const s = townById(id); return s ? '<div class="up-row"><span>' + swatch(id) + esc(s.name) + '<br><em>at war with you since day ' + state.hostile[id].since + '</em></span></div>' : ''; }).join('') || '<p>Nobody is at war with you.</p>';
  const calls = aidRows();
  showDialog('<h2>Journal</h2><h3>Jobs</h3>' + jobs + '<h3>Allies</h3>' + ally + (calls ? '<h3>Allies asking for help</h3>' + calls : '') + '<h3>Enemies</h3>' + foes + '<h3>Wars between settlements</h3>' + npcWarRows() + '<button onclick="closeDialog()">Close</button>');
}
