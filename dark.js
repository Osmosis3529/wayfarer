// Caves and dungeons: big winding mazes lit only by a circle of light around you, and torches to widen it.
// Loaded before the main script; it uses the main script's globals (state, map, ...) at call time.

const MAZE_SIZE = { cave: [51, 35], dungeon: [63, 43] };   // odd sizes, and (height - 1) / 2 is odd, so the middle row is a corridor row
const LIGHT_BASE = 4, TORCH_BONUS = 4, TORCH_STEPS = 120, LANTERN_BONUS = 2;
const OPAQUE = new Set(['#', '▲', '♣']);

function isDark(zone = state.zone) { return zone === 'cave' || zone === 'dungeon'; }

// ---------------------------------------------------------------- the maze
// A depth-first maze on a grid of cells two tiles apart (long winding corridors), then loops are knocked through
// so there is more than one way around, plus rooms (dungeons) or caverns and eroded walls (caves).
function mazeGrid(type) {
  const [w, h] = MAZE_SIZE[type], mid = (h - 1) / 2, g = Array.from({ length: h }, () => Array(w).fill('#'));
  const rnd = n => Math.floor(Math.random() * n), open = (x, y) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y][x] = '.'; };
  const seen = new Set(), stack = [[1, mid, 1, 0]], key = (x, y) => y * w + x;
  open(1, mid); seen.add(key(1, mid));
  while (stack.length) {
    const [x, y, ldx, ldy] = stack[stack.length - 1];
    const next = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, dx / 2, dy / 2]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && !seen.has(key(nx, ny)));
    if (!next.length) { stack.pop(); continue; }
    // Usually keep going the way you were heading, so the corridors run long and wind.
    const straight = next.find(([, , hx, hy]) => hx === ldx && hy === ldy), [nx, ny, hx, hy] = straight && Math.random() < 0.6 ? straight : next[rnd(next.length)];
    open(x + hx, y + hy); open(nx, ny); seen.add(key(nx, ny)); stack.push([nx, ny, hx, hy]);
  }
  const isOpen = (x, y) => g[y] && g[y][x] === '.';
  // Loops: knock through some of the walls that sit between two corridors, and give dead ends a second way out.
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if ((x + y) % 2 === 0 || g[y][x] !== '#') continue;
    const horizontal = y % 2 === 1, a = horizontal ? [x - 1, y] : [x, y - 1], b = horizontal ? [x + 1, y] : [x, y + 1];
    if (isOpen(...a) && isOpen(...b) && Math.random() < 0.08) open(x, y);
  }
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isOpen(x + dx, y + dy));
    if (exits.length !== 1 || Math.random() >= 0.4) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] === '#' && isOpen(x + 2 * dx, y + 2 * dy));
    if (walls.length) { const [dx, dy] = walls[rnd(walls.length)]; open(x + dx, y + dy); }
  }
  if (type === 'dungeon') {
    for (let i = 0; i < 12; i++) {
      const rw = 3 + 2 * rnd(3), rh = 3 + 2 * rnd(2), x0 = 1 + 2 * (2 + rnd((w - rw - 6) / 2)), y0 = 1 + 2 * rnd((h - rh - 2) / 2);
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) open(x, y);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const r = 2 + rnd(2), cx = 1 + 2 * (2 + rnd((w - 8) / 2)), cy = 1 + 2 * (1 + rnd((h - 4) / 2));
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r + .3) open(x, y);
    }
    const eroded = [];
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (g[y][x] === '#' && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isOpen(x + dx, y + dy)).length >= 2 && Math.random() < 0.04) eroded.push([x, y]);
    for (const [x, y] of eroded) open(x, y);
  }
  // A straight stretch inside the entrance, and a chamber before the far exit where the guardians wait.
  for (let x = 1; x <= 5; x++) open(x, mid);
  for (let y = mid - 2; y <= mid + 2; y++) for (let x = w - 10; x <= w - 2; x++) open(x, y);
  g[mid][1] = '<'; g[mid][w - 2] = '>';
  return g;
}

// ---------------------------------------------------------------- light
// What the player can see right now: a circle whose radius grows with a burning torch and the Delver's Lantern.
// Walls and boulders stop light, so you see the wall itself but not what is behind it.
function lightRadius() { return LIGHT_BASE + (state.torch > 0 ? TORCH_BONUS : 0) + (state.relics && state.relics.lantern ? LANTERN_BONUS : 0); }
function lineClear(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if ((x !== x1 || y !== y1) && OPAQUE.has(map[y] && map[y][x])) return false;
  }
  return true;
}
let litCache = { key: '', set: new Set() };
function memOf(site) {
  if (!site) return null;
  if (!site.mem || site.mem.length !== map.length) site.mem = map.map(r => r.map(() => 0));
  return site.mem;
}
function getLit() {
  const R = lightRadius(), key = [state.x, state.y, R, state.zone, state.site && state.site.id, map.length].join(',');
  if (litCache.key === key) return litCache.set;
  const set = new Set(), mem = memOf(state.site);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = state.x + dx, y = state.y + dy;
    if (dx * dx + dy * dy > R * R + R || !map[y] || map[y][x] === undefined) continue;
    if (lineClear(state.x, state.y, x, y)) { set.add(x + ',' + y); if (mem) mem[y][x] = 1; }
  }
  litCache = { key, set };
  return set;
}
function seenTile(x, y) { const m = state.site && state.site.mem; return !!(m && m[y] && m[y][x]); }
// How much darkness to lay over a tile: none in the middle of the light, fading toward its edge; remembered tiles stay dim.
function darkness(x, y, lit) {
  if (!lit) return 0.8;
  const d = Math.hypot(x - state.x, y - state.y), R = lightRadius();
  return d > R - 2 ? Math.min(0.7, (d - (R - 2)) / 2.4 * 0.7) : 0;
}

// ---------------------------------------------------------------- torches
function burnTorch() {
  if (!(state.torch > 0)) return;
  state.torch--;
  if (state.torch === 0) say('Your torch gutters out. The dark closes in.', 'alert');
  else if (state.torch === 20) say('Your torch is burning low.', 'alert');
}
function lightTorch() {
  if (state.combat) return;
  if (!isDark()) { say('There is no need for a torch out in the open.'); return; }
  if (!(state.inv.torch > 0)) { say('You have no torches. The trading post and the lumber mill sell them, and caches in the dark sometimes hold one.', 'alert'); return; }
  state.inv.torch--;
  state.torch = (state.torch || 0) + TORCH_STEPS;
  say('You light a torch. It will burn for ' + state.torch + ' steps and throws light much farther.', 'gold');
  render();
}
// Caches in caves and dungeons sometimes hold a torch or two.
function cacheTorches() {
  if (!isDark() || Math.random() >= 0.45) return;
  const n = 1 + Math.floor(Math.random() * 2);
  const got = addItem('torch', n, true);
  if (got) say('There ' + (got === 1 ? 'is a torch' : 'are ' + got + ' torches') + ' in the cache.', 'gold');
}
