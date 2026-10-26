// The pop-up menu: one dialog with tabs for your character, your pack, the map, the journal, the world's news and settings.
// Loaded after diplomacy.js; like the other scripts it uses the main script's globals at call time. The tab being shown is
// kept in the main script's menuTab, which showDialog clears, so any other dialog opening on top ends the menu.

const MENU_TABS = [
  ['stats', 'Stats', () => statsHtml()]
];
function openMenu(tab) {
  if (state.combat || document.getElementById('start-screen').style.display !== 'none') return;
  const t = MENU_TABS.find(x => x[0] === tab) || MENU_TABS[0];
  const strip = MENU_TABS.map(([id, label]) => '<button class="' + (id === t[0] ? 'on' : '') + '" onclick="openMenu(\'' + id + '\')">' + label + '</button>').join('');
  showDialog('<div class="tabs">' + strip + '</div>' + t[2]() + '<button onclick="closeDialog()">Close</button>');
  menuTab = t[0];
}
function menuRefresh(tab) { if (menuTab && (!tab || menuTab === tab)) openMenu(menuTab); }
