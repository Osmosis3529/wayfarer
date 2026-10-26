// The pop-up menu: one dialog with tabs for your character, your pack, the map, the journal, the world's news and settings.
// Loaded after diplomacy.js; like the other scripts it uses the main script's globals at call time. The tab being shown is
// kept in the main script's menuTab, which showDialog clears, so any other dialog opening on top ends the menu.

let lastMenuTab = 'stats';
const MENU_TABS = [
  ['stats', 'Stats', () => statsHtml()],
  ['inventory', 'Inventory', () => inventoryHtml()],
  ['map', 'Map', () => mapHtml(), () => { const cv = document.getElementById('worldmap'); if (cv) drawWorldMap(cv); }],
  ['journal', 'Journal', () => journalHtml()],
  ['logs', 'World logs', () => logsHtml()],
  ['settings', 'Settings', () => settingsHtml()]
];
function openMenu(tab) {
  if (state.combat || document.getElementById('start-screen').style.display !== 'none') return;
  const t = MENU_TABS.find(x => x[0] === tab) || MENU_TABS.find(x => x[0] === lastMenuTab) || MENU_TABS[0];
  const strip = MENU_TABS.map(([id, label]) => '<button class="' + (id === t[0] ? 'on' : '') + '" onclick="openMenu(\'' + id + '\')">' + label + '</button>').join('');
  const same = menuTab === t[0];
  showDialog('<div class="tabs">' + strip + '</div>' + t[2]() + '<button onclick="closeDialog()">Close</button>');
  document.getElementById('dialog').classList.add('menu');
  if (!same) document.getElementById('dialog').scrollTop = 0;
  menuTab = lastMenuTab = t[0];
  if (t[3]) t[3]();
}
function menuRefresh(tab) { if (menuTab && (!tab || menuTab === tab)) openMenu(menuTab); }

// ---------------------------------------------------------------- the pack
// The pack, relics and what you can do here are drawn by render() into the side panel; the menu shows the same.
function inventoryHtml() {
  renderRest();
  const q = id => document.getElementById(id).innerHTML, actions = q('actions').replace(/onclick="/g, 'onclick="closeDialog();');
  return '<h3>Pack &amp; provisions</h3><div class="inventory">' + q('inventory') + '</div>' + (q('relics') ? '<div class="relics">' + q('relics') + '</div>' : '') +
    (actions ? '<h3>Here and now</h3><div class="actions">' + actions + '</div>' : '');
}

// ---------------------------------------------------------------- the world's news
function logsHtml() {
  const row = l => '<p class="' + (l.cls === 'gold' || l.cls === 'alert' ? l.cls : '') + '">' + (l.day ? '<b>Day ' + l.day + '</b> ' : '') + esc(l.t) + '</p>';
  const news = (state.worldLog || []).map(row).join(''), notes = (state.log || []).map(l => '<p class="' + (l.cls === 'gold' || l.cls === 'alert' ? l.cls : '') + '">' + esc(l.t) + '</p>').join('');
  return '<h3>News from the world</h3><div class="log tall">' + (news || '<p>Nothing has happened yet that you have heard of. Wars, raids, growing settlements and treaties will be written here.</p>') + '</div>' +
    '<h3>Your field notes</h3><div class="log tall">' + (notes || '<p>Nothing yet.</p>') + '</div>';
}

// ---------------------------------------------------------------- settings
function menuToggle(kind) { if (kind === 'gfx') toggleGfx(); else toggleSkin(); menuRefresh('settings'); }
function settingsHtml() {
  return '<h3>Game</h3><div class="actions"><button onclick="saveWorld()">Save world</button><button onclick="exportSaveFile()">Export save</button></div>' +
    '<p class="cap">The game autosaves at every dawn and when you leave the page. Save world keeps a manual save in this browser; Export save makes a file you can keep.</p>' +
    '<h3>Display</h3><div class="actions"><button onclick="menuToggle(\'gfx\')">Graphics: ' + (useGfx ? 'sprites' : 'text') + '</button><button onclick="menuToggle(\'skin\')">Art: ' + (artSkin === 'kenney' ? 'Kenney' : 'handmade') + '</button></div>' +
    '<h3>Controls</h3><p class="cap">Move with WASD or the arrow keys · E interacts, gathers and enters · T lights a torch · C or Esc opens this menu · I the pack · M the map · J the journal · P pauses · in a fight 1 to 6 choose an action. On a phone use the pad and the round buttons.</p>';
}
