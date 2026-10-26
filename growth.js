// How the other settlements grow up: each is born a village with a destiny (stay a village, grow into a town or a city).
// Loaded after towns.js; like the other scripts it uses the main script's globals at call time.

// ---------------------------------------------------------------- destinies
// Towns are as many as cities and villages put together, villages outnumber cities, and cities are few.
const DESTINIES = ['village', 'town', 'city'];
const DESTINY_SIZE = { village: [8, 12], town: [18, 24], city: [30, 36] };   // the most citizens each can grow to
function destinyCounts(n) {
  const m = Math.floor(n / 2);                  // towns are half of everything
  let c = Math.max(1, Math.round(m * .36)), v = m - c;
  while (v <= c && c > 1) { c--; v++; }
  return { city: c, town: n - c - v, village: v };
}
function assignDestinies(list = settlements) {
  if (!list.length || list.some(s => s.destiny)) return;
  const bag = [];
  for (const [k, n] of Object.entries(destinyCounts(list.length))) for (let i = 0; i < n; i++) bag.push(k);
  bag.sort(() => Math.random() - .5);
  list.forEach((s, i) => { s.destiny = bag[i]; });
}
// The size a settlement is heading for; picked once, then kept.
function goalOf(s) {
  if (!Number.isFinite(s.goal)) { const [lo, hi] = DESTINY_SIZE[s.destiny || 'village']; s.goal = lo + Math.floor(Math.random() * (hi - lo + 1)); }
  return s.goal;
}
// What to call a settlement of this many people: the same sizes as your own village, town and city (12, 24, 36).
function scaleOf(people) { return people <= 12 ? 'village' : people <= 24 ? 'town' : 'city'; }
