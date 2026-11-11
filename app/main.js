// CIS Map: loads the map and the routing network, and ties the screen together.
//
// Static files only: the floors (data/<F>_evac/), the floors index, and the walking network
// (data/routing/graph_evac.json). Routes are worked out here, on the phone, by
// routing/engine.mjs; nothing is sent anywhere. A link can carry the trip:
//
//   app/?here=L4:KB-405            a QR code by a door: "you are here"
//   app/?from=KB-405&to=BT-508     a whole trip (ids found on one floor need no floor)
//   app/?from=…&to=A,B,C           several stops in order; "Next stop" moves on
//   &stepfree=1  &lang=zh          step-free, Chinese
//
// `start` (as "here") and `dest` are read too, as the first prototype's QR codes used them.

import { Router } from '../routing/engine.mjs';
import { loadFloors, getJSON, useRouting } from './floors.js';
import { MapView } from './map.js';
import { Places, CHIPS, TOILET_GROUPS, nearText } from './search.js';
import { routeSteps, walkway, detourNote, ruleAreasOf } from './directions.js';
import { qr, qrPath } from './qr.js';
import { t, floorName, fmtDist, fmtTime, fmtMins, underMinute, placeTitle, isPlainClassroom, shortName, nameIn,
  LANGUAGES, LANGS, language, langId, loadLang, systemLang } from './i18n.js';

const ROOT = '../';
const $ = id => document.getElementById(id);
// the side panel: a wide screen, or a phone held sideways (app.css has the same query)
// (from 768 px: an iPad held upright is a computer too, the owner's word, with the map live
// beside the panel; it once got the phone's sheet stretched across)
const WIDE = matchMedia('(min-width: 768px), (orientation: landscape) and (max-height: 520px) and (min-width: 560px)');
// a phone held sideways: a panel, but a short one, so step by step it gives the step the room as a
// phone does (the trip card left a 568 x 320 screen no room for the step's arrows)
const SHORT = matchMedia('(orientation: landscape) and (max-height: 520px)');
// a phone held sideways: the wide layout, but still a phone (its own share sheet, the step arrows)
const SIDEWAYS = matchMedia('(orientation: landscape) and (max-height: 520px) and (min-width: 560px) and (max-width: 899px)');

const store = {
  get(k) { try { return localStorage.getItem('cismap.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('cismap.' + k, v); } catch { /* private browsing: fine without */ } },
};
// this tab only: survives a reload, not a link passed on
const session = {
  get(k) { try { return sessionStorage.getItem('cismap.' + k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem('cismap.' + k); else sessionStorage.setItem('cismap.' + k, v); } catch { /* fine without */ } },
};
// The browser's history, for what Back closes (below). In a frame, as in the slideshow's three phones,
// every frame shares the tab's one history, so a Back in one phone landed in another and stopped its
// demo: there the app keeps its entries to itself.
const hist = window.parent === window ? history : (() => {
  const stack = [null];
  return {
    get state() { return stack[stack.length - 1]; },
    pushState(s) { stack.push(s); },
    replaceState(s, _, url) { stack[stack.length - 1] = s; if (url) history.replaceState(null, '', url); },
    back() { if (stack.length > 1) { stack.pop(); setTimeout(onBack); } },
  };
})();

const state = {
  lang: 'en',
  from: null, to: null, here: false,  // places; `here` when the start came from a link (a QR code)
  stepFree: false,
  route: null, steps: [], current: -1,
  floor: null,
  pick: null,                         // a place tapped on the map
  sides: null,                        // {main, go}: a start in a big place, waiting for which side
  pickerFor: 'to', chip: null, toilet: null, active: -1, shown: [],
  notice: null,                       // {key, kind, vars}: said again in a new language
  stops: [],                          // the destinations still to visit, the current one first
  stopTotal: 0,                       // how many the trip had
  layer: null,                        // what Back closes first: 'picker', 'share' or 'steps'
  mapPick: null,                      // 'from' or 'to': waiting for a place tapped on the map
};
let campus, router, places, map;
// the owner's gates and tolls (data/zones_evac.json), for saying why a route goes the long way
let ruleAreas = [];
// The map's files are asked for the moment the app starts, not after a language's words (which can
// take a moment): the floors come a level at a time (floors.js), the one a link starts on (else
// Level 1, where a visit starts) first and where it goes next, and boot() draws the first as soon as
// it is in. `site` is the campus as it fills; `campus` is set once every floor and the walking
// network are in, and the search, routes and a link's trip wait for that (the places are on every floor).
let site = null;
const loading = startLoading(new URLSearchParams(location.search));

// The places people look for most: the search's start before anything is typed or remembered.
const POPULAR = ['L1:MAIN-ENTRANCE', 'L1:RECEPTION', 'L1:CANTEEN-L1', 'L2:CANTEEN', 'L3:LKS-304', 'L2:LKS-207',
  'L1:LKS-104', 'L5:BT-505', 'L4:GYMNASIUM', 'L2:THEATRE-BLK'];
// where a visitor starts from: the ways in, and where a car or bus leaves you
const ARRIVALS = ['L1:MAIN-ENTRANCE', 'L1:NORTH-ENTRANCE', 'L1:BUS-BAY', 'L1:PRIMARY-DROP-OFF', 'TT_L1:TT-DROPOFF', 'L1:RECEPTION', 'TT_L1:TT-RECEPTION'];

// ---- icons -----------------------------------------------------------------------------------

const P = {
  room: 'M6 3h12v18h-2V5H8v16H6zm7 8h2v2h-2z',
  special: 'M9 2h6v2h-1v5.2l5.4 9.3A2 2 0 0 1 17.7 21H6.3a2 2 0 0 1-1.7-2.5L10 9.2V4H9zm3 9.3L9.2 16h5.6z',
  library: 'M3 5.5C5.6 5 8.5 5.4 11 7v12.5C8.5 18 5.6 17.6 3 18zm18 0C18.4 5 15.5 5.4 13 7v12.5c2.5-1.5 5.4-1.9 8-1.5z',
  care: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
  outdoor: 'M12 2l6 8h-3l4 6h-6v6h-2v-6H5l4-6H6z',
  // a car from the front, a bus from the front, a door with the way in
  drop: 'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v7a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1zm2.3 0h9.4l-1-3.2a1 1 0 0 0-1-.8H9.3a1 1 0 0 0-1 .8zM7.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  bus: 'M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2H8v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 4 16V5a2 2 0 0 1 2-2zm0 3v5h12V6zm1.5 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  entrance: 'M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6v-2h6V5h-6zM10 7l5 5-5 5-1.4-1.4 2.6-2.6H3v-2h8.2L8.6 8.4z',
  office: 'M9 4h6a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h3V6a2 2 0 0 1 2-2zm0 3h6V6H9z',
  toilet: 'M7 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5.3 9h3.4c.8 0 1.3.6 1.3 1.3V15H8.8v5H5.2v-5H4v-4.7C4 9.6 4.5 9 5.3 9zM17 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM15.6 9h2.8c.7 0 1.2.4 1.4 1l1.7 5.5H19V20h-4v-4.5h-2.5L14.2 10c.2-.6.7-1 1.4-1z',
  food: 'M8 2v7a2 2 0 0 1-1.5 1.94V22h-2V10.94A2 2 0 0 1 3 9V2h1.5v6h1V2h1v6h1V2zm9 0c1.7 0 3 2.2 3 6 0 2.5-.9 4-2 4.6V22h-2V2z',
  service: 'M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z',
  hall: 'M3 20V9l9-5 9 5v11h-6v-6H9v6z',
  pool: 'M2 16c2 0 3-1.5 5-1.5s3 1.5 5 1.5 3-1.5 5-1.5 3 1.5 5 1.5v2c-2 0-3-1.5-5-1.5S14 18 12 18s-3-1.5-5-1.5S4 18 2 18zm0-5c2 0 3-1.5 5-1.5s3 1.5 5 1.5 3-1.5 5-1.5 3 1.5 5 1.5v2c-2 0-3-1.5-5-1.5S14 13 12 13s-3-1.5-5-1.5S4 13 2 13zM8 4h2v6H8zm6 0h2v6h-2z',
  lift: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5 3.5L9 10h6zm0 11l3-3.5H9z',
  stair: 'M4 19h4v-4h4v-4h4V7h4V5h-6v4h-4v4H6v4H4z',
  bridge: 'M2 15h20v2H2zm2-6c4 0 6 3 8 3s4-3 8-3v2c-3 0-5 3-8 3s-5-3-8-3z',
  blank: 'M5 5h14v14H5z',
  depart: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  turn: 'M18 20h-2v-6a2 2 0 0 0-2-2H9.8l2.6 2.6L11 16l-5-5 5-5 1.4 1.4L9.8 10H14a4 4 0 0 1 4 4z',
  bear: 'M7 5h7v2h-3.6l7.3 7.3V20h-2v-4.9L9 8.4V12H7z',
  around: 'M9 20H7v-9a5 5 0 0 1 10 0v4.2l2.6-2.6L21 14l-5 5-5-5 1.4-1.4 2.6 2.6V11a3 3 0 0 0-6 0z',
  arrive: 'M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  across: 'M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z',
  onward: 'M11 20V7.8l-4.6 4.6L5 11l7-7 7 7-1.4 1.4L13 7.8V20z',
  pickmap: 'M15 4l6 2v14l-6-2-6 2-6-2V4l6 2zm-1 2.2L10 7.5v10.3l4-1.3zM8 7.4L5 6.4v10.2l3 1zm8-.9v10.2l3 1V7.4zM12 9a2 2 0 0 1 2 2c0 1.5-2 3.6-2 3.6S10 12.5 10 11a2 2 0 0 1 2-2z',
};
const svg = (d, flip) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"${flip ? ' transform="matrix(-1 0 0 1 24 0)"' : ''}/></svg>`;
const STEP_ICON = {
  // (a start that turns shows its turn: "From Stairs 11, turn left and head for …")
  depart: s => (s.dir ? svg(P.turn, s.dir === 'right') : svg(P.depart)), arrive: () => svg(P.arrive), around: () => svg(P.around),
  turn: s => svg(P.turn, s.dir === 'right'), bear: s => svg(P.bear, s.dir === 'right'),
  'stairs-up': () => svg(P.stair), 'stairs-down': () => svg(P.stair, true),
  'lift-up': () => svg(P.lift), 'lift-down': () => svg(P.lift), bridge: () => svg(P.bridge), landing: () => svg(P.across),
  // over a seam (the road by the pool deck): straight on (it once showed the turn-round arrow)
  onward: () => svg(P.onward),
};

// ---- start ----------------------------------------------------------------------------------

async function boot() {
  if (hist.state && hist.state.layer) hist.replaceState(null, '');
  const params = new URLSearchParams(location.search);
  // the language: a link's, else the one chosen on an earlier visit; neither, and the visit opens
  // on the language page, the phone's own language highlighted
  const chosen = langId(params.get('lang')) || langId(store.get('lang'));
  state.lang = chosen || systemLang();
  // a language with a file of its own (app/lang/): its words before the first screen, a moment from
  // the saved copy; if they are slow, English until they come
  if (chosen && !(await Promise.race([loadLang(chosen), new Promise(r => setTimeout(() => r(false), 1500))]))) {
    loadLang(chosen).then(ok => { if (ok && state.lang === chosen) setLang(chosen); });
  }
  applyLang();
  wire();
  if (!chosen) showGate('choose');
  // a later visit goes straight to the map, with a wait in its language if that takes a moment
  else setTimeout(() => { if (!ready && !gateMode) showGate('wait'); }, 300);
  map = new MapView($('map'), {
    tap: onMapTap,
    // the other wing's floor on this level, gone to by a tap or a pan: it is the floor you are on now
    floor: f => { if (state.floor !== f) { state.floor = f; renderFloors(); } },
    chip: id => { const f = campus.byId[id]; showFloor(f); fitRouteOn(f); },
    // where the floor buttons sit over the map, so no name is left half under them
    bar: () => {
      const st = $('stage').getBoundingClientRect(), b = $('floorbar').getBoundingClientRect();
      return [b.left - st.left, b.top - st.top, b.right - st.left, b.bottom - st.top];
    },
  });
  // The first level in (see `loading`), drawn at once: the floor a link starts on, framed on the place
  // as its trip will be, else Level 1 whole. The map is ready to look at from here; the rest follows.
  // (with its staff-only areas: a small file, asked for at the start, so in by now)
  // A language chosen while the rest comes (a first visit's language page): setLang leaves the map to
  // boot until then, so the map's names and the floor buttons take it up here, as the page's words do.
  const relang = new MutationObserver(() => { map.setLang(state.lang); renderFloors(); });
  try {
    const [first, zones] = await Promise.all([loading.firstLevel, loading.zones]);
    const id = loading.first[0], from = linkEnds(params).from;
    const f = first.find(g => g.id === id) || first[0];
    map.setFloors(site.byId);
    map.setZones(zones);
    map.setLang(state.lang);
    layout();
    showFloor(f, { fit: true });
    const p = from && from.floor === f.id && f.portalById.get(from.id), r = p && (p.room || p.area);
    if (p) map.fitBounds(box(r ? r.ring : [[p.x, p.y]], 14), { maxScale: 12, animate: false });
    renderWaiting(params);
    relang.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  } catch (e) {
    console.error(e);
    failed = true;
    if (gateMode !== 'choose') showGate('wait');
    return;
  }
  ready = true;
  // (still choosing a language: the map waits behind the page until a language is chosen)
  if (gateMode !== 'choose') hideGate();
  try {
    const [c, g] = await Promise.all([loading.floors, loading.graph]);
    campus = c;
    useRouting(campus, g);
    router = new Router(g);
    places = new Places(router, campus);
    // (asked for with the floors, so the three small files are not three more waits after them)
    const [[dir, toilets], zones] = await Promise.all([loading.extras, loading.zones]);
    // other names for places (subjects, teachers), if the school has given any
    places.addAliases(dir);
    // what each toilet block holds (boys', girls', adults'), read off the door signs
    places.addToilets(toilets);
    // the staff-only areas (L4's admin wing), drawn hatched; a place whose door is in one says so
    map.setZones(zones);
    ruleAreas = ruleAreasOf(zones, campus);
    for (const p of places.byKey.values()) if (p.portal && map.staffOnly(p.floor, p.portal.x, p.portal.y)) p.staffOnly = true;
  } catch (e) {
    console.error(e);
    // (the map is up, but without the rest it cannot find a way: the page says it could not load)
    ready = false; failed = true;
    if (gateMode !== 'choose') showGate('wait');
    return;
  }
  // (the language may have changed while the rest came)
  relang.disconnect();
  map.setLang(state.lang);
  places.setLang(state.lang);
  renderWaiting(params, true);
  try { readLink(params); } catch (e) {
    console.error(e);
    showFloor(campus.byId.L1, { fit: true });
    // (the sheet still said the places were on their way)
    try { render(); } catch { /* the map, at least */ }
  }
  // a tap on the trip's start or destination while the places were on their way
  if (waiting) { const go = waiting; waiting = null; go(); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it, online */ });
  }
}

function readLink(params) {
  // here= is what a door label carries ("you are here"); from= is just a start, which is what
  // a reload or a shared link has, since the address bar writes from= (see writeLink)
  const hereQ = (params.get('here') || params.get('start') || '').trim();
  const from = (params.get('from') || '').trim() || hereQ;
  // several destinations, comma-separated, are visited in order (an evening of meetings)
  const tos = (params.get('to') || params.get('dest') || '').split(',').map(x => x.trim()).filter(Boolean);
  // step-free is a person's need, not a trip's: remembered from their last choice, unless the link
  // says (someone who uses lifts scans one door label after another)
  const sf = params.get('stepfree');
  state.stepFree = sf === '1' || sf === '0' ? sf === '1' : store.get('stepfree') === '1';
  $('opt-stepfree').checked = state.stepFree;
  // an id on several floors ("STAIR-9") is the one on the floor the link names, else on the other
  // end's floor, else the lowest
  const fid = params.get('floor');
  const lookUp = (q, other) => places.find(q) || places.findOn(q, [fid, other && places.find(other) && places.find(other).floor.id]);
  state.from = from ? lookUp(from, tos[0]) : null;
  state.stops = tos.map(q => asDest(lookUp(q, from))).filter(Boolean);
  state.stopTotal = state.stops.length;
  state.to = state.stops[0] || null;
  // "you are here" comes from a door label. The address bar then says from=, so a link passed on
  // never claims it; this tab remembers it, so a reload still does.
  state.here = !!state.from && ((!params.get('from') && !!hereQ) || session.get('here') === state.from.key);
  session.set('here', state.here ? state.from.key : null);
  const missing = [from && !state.from && from, ...tos.filter(q => !lookUp(q, from))].filter(Boolean);
  const floor = fid && Object.prototype.hasOwnProperty.call(campus.byId, fid) ? campus.byId[fid] : null;
  if (state.from && state.to) {
    compute();
    // a shared link that does not say step-free, opened on a phone set to step-free: the trip is
    // this phone's way, and says so (it changed a route without a word, a review found)
    if (sf !== '1' && sf !== '0' && state.stepFree && state.route && !hereQ) notice('stepFreeYours', 'info');
  } else {
    map.setRoute(drawn());
    setMarks();
    render();
    if (state.from) focusPlace(state.from);
    else if (state.to) focusPlace(state.to);
    // (the first floor in is on the screen already, perhaps moved about while the rest came: left so)
    else if (!state.floor) showFloor(floor || campus.byId.L1, { fit: true });
  }
  if (missing.length) notice('unknownPlace', null, { q: missing[0] });
}

// A link's ends as the floor and id each names: "L3:KB-305" is L3's KB-305; "KB-305" names no floor.
function linkEnds(params) {
  const end = q => { const i = q.indexOf(':'); return { floor: i > 0 ? q.slice(0, i).trim().toUpperCase() : '', id: q.slice(i + 1).trim() }; };
  const from = (params.get('from') || '').trim() || (params.get('here') || params.get('start') || '').trim();
  const tos = (params.get('to') || params.get('dest') || '').split(',').map(x => x.trim()).filter(Boolean);
  return { from: from ? end(from) : null, to: tos.map(end) };
}

// The map's files, asked for at once (see `loading`). The floors wanted first: where the trip starts
// (else the floor the link names, else Level 1), then where it goes; floors.js brings the rest after.
function startLoading(params) {
  const ends = linkEnds(params);
  const first = [(ends.from && ends.from.floor) || (params.get('floor') || '').trim() || 'L1', ...ends.to.map(e => e.floor)].filter(Boolean);
  let firstIn, firstFailed;
  const firstLevel = new Promise((ok, no) => { firstIn = ok; firstFailed = no; });
  const floors = loadFloors(ROOT, { first, onLevel: (fl, c) => { site = c; firstIn(fl); levelIn(fl); } });
  floors.catch(firstFailed);
  const json = n => getJSON(`${ROOT}data/${n}_evac.json`).catch(() => null);
  // The walking network, the biggest file by far (search and routes need it, the map does not): asked
  // for at once too, so it is in as soon as can be. Left until the first floor was in, that floor came
  // 0.8 s sooner on a slow line (Fast 3G, files uncompressed) but the network 1.1 s later, the round
  // trip it then waited for lost; "low" lets a server that can (HTTP/2) send the floors first anyway.
  const graph = getJSON(ROOT + 'data/routing/graph_evac.json', { priority: 'low' });
  // (boot hears of a failure when it waits for these)
  firstLevel.catch(() => {}); graph.catch(() => {});
  return { first, firstLevel, floors, graph, zones: json('zones'), extras: Promise.all([json('directory'), json('toilets')]) };
}

// A level in after the first: its floor button works, its staff-only areas are drawn, and if its
// button was tapped while it was on its way, the map goes there.
let waitLevel = null;
function levelIn(floors) {
  if (!state.floor) return;   // (the first: boot draws it)
  loading.zones.then(z => map.setZones(z));
  renderFloors();
  if (waitLevel !== floors[0].level) return;
  waitLevel = null;
  showFloor(floors.find(g => g.building === state.floor.building) || floors[0]);
  map.showFloor();
}

// The sheet while the places are on their way (the map is drawn first): the ends a link names say
// so, the others ask as usual; a tap on either waits for the places.
// (as data-t words, so a language chosen meanwhile, on a first visit's language page say, says them
// in its own; boot takes them off before the sheet is drawn for real)
function renderWaiting(params, done) {
  const L = state.lang, ends = linkEnds(params), to = ends.to.length ? 'loading' : 'whereTo';
  // (the sheet as one line, pulled down, too; and "To", which render() writes)
  const words = { 'from-v': ends.from ? 'loading' : 'chooseStart', 'to-v': to, mini: to, 'to-k': 'to' };
  for (const [id, key] of Object.entries(words)) {
    if (done) { delete $(id).dataset.t; continue; }
    if (id.endsWith('-v')) $(id).classList.add('empty');
    $(id).dataset.t = key;
    $(id).textContent = t(L, key);
  }
}

// Something that needs the places (the search), asked for before they are in: done once they are
// (the last thing asked), with a word that they are coming.
let waiting = null;
function whenReady(fn) {
  if (campus) { fn(); return; }
  waiting = fn;
  toast(t(state.lang, 'loading'));
}

// The address bar holds the trip, readable: ?from=L3:KB-305&to=L5:BT-508
function writeLink() {
  // (not while the places are on their way: the link the page opened with is not read yet, so the
  // address bar keeps it, even when the language page is opened and closed over the map meanwhile)
  if (!campus) return;
  const enc = v => encodeURIComponent(v).replace(/%3A/gi, ':').replace(/%2C/gi, ',');
  const q = [];
  if (state.from) q.push(`from=${enc(state.from.key)}`);
  const tos = state.stops.length > 1 ? state.stops : state.to ? [state.to] : [];
  if (tos.length) q.push(`to=${enc(tos.map(p => p.key).join(','))}`);
  if (state.stepFree) q.push('stepfree=1');
  // Chinese always; English when this phone's saved language is Chinese (an English link stays so)
  const saved = store.get('lang');
  if (state.lang !== 'en' || (saved && saved !== 'en')) q.push(`lang=${state.lang}`);
  hist.replaceState(hist.state, '', q.length ? `?${q.join('&')}` : location.pathname);
}

// The trip's link for someone else: never "you are here".
function shareLink() {
  const u = new URL(location.href);
  u.searchParams.delete('here'); u.searchParams.delete('start');
  return u.href.replace(/%3A/gi, ':').replace(/%2C/gi, ',');
}

// The start is no longer the door the QR code was on.
function notHere() { state.here = false; session.set('here', null); }

// On to the next of several destinations: where you are now is where the next walk starts (in a big place with
// sides, the side this walk came in by).
function nextStop() {
  if (state.stops.length < 2) return;
  state.stops.shift();
  state.from = arrivedBy(state.to); notHere();
  state.to = state.stops[0];
  compute();
}

// The side of a big place the route ends at: the one whose door is nearest the route's last point.
function arrivedBy(p) {
  const legs = (state.route && state.route.legs) || [], L = legs[legs.length - 1];
  const sides = (p.sides || []).filter(s => L && L.points.length && s.floor.id === L.floor);
  if (!sides.length) return p;
  const [x, y] = campus.byId[L.floor].routePoint(...L.points[L.points.length - 1]);
  const off = s => Math.hypot(s.portal.x - x, s.portal.y - y);
  return sides.reduce((a, s) => (off(s) < off(a) ? s : a));
}

// ---- routing --------------------------------------------------------------------------------

function compute({ fit = true } = {}) {
  // a start in a big place with sides that names none (a link typed out, an old label, a swap): which side? It
  // started at whichever side was nearer the destination, without a word (the final bug check, 6 Nov)
  if (state.from && state.to && state.from.sides && state.from.sides.length > 1) {
    const p = state.from;
    state.from = null; state.route = null; state.steps = [];
    setFrom(p, () => compute({ fit }));
    return;
  }
  state.route = null; state.steps = []; state.current = -1; state.note = null;
  if (state.layer === 'steps') { state.layer = null; hist.replaceState({ trip: true }, ''); }
  map.setFocus(null); map.setPassed(0); map.setMarks({ near: null });
  notice(null);
  if (state.from && state.to) {
    // (a side of a big place, to the place itself, is there too: it walked out of the door and back in, 7 m)
    if (state.from.key === state.to.key || state.from.sideOf === state.to) notice('same', 'info');
    else {
      const r = router.route(state.from.key, state.to.key, { stepFree: state.stepFree });
      if (r.ok) { state.route = r; state.steps = routeSteps(r, campus, state.lang); state.note = detourNote(router, r, ruleAreas, state.stepFree); }
      else notice(state.stepFree ? 'noStepFree' : 'noRoute');
    }
  }
  map.setRoute(drawn());
  setMarks();
  render();
  $('steps').scrollTop = 0;
  relayout();   // the sheet just changed height: fit the route to what is left of the map
  tripEntry();
  writeLink();
  if (state.route && fit) {
    // where you are first, even when the trip starts by taking the stairs from there
    const f = state.from.floor;
    showFloor(f);
    fitRouteOn(f);
  } else if (fit && !state.route) {
    const p = state.to || state.from;
    if (p) focusPlace(p);
  }
}

// The route as the map draws it: per floor, lines in metres; where it starts and ends; and a
// chip wherever it changes floor.
// (each leg as Floor.mapLine draws it: app/floors.js)
function drawn() {
  const r = state.route;
  const at = p => p && p.portal ? { floor: p.floor.id, x: p.portal.x, y: p.portal.y } : null;
  // a place with no walls and no area of its own drawn (the bus bay, a pod) has nothing to outline:
  // the map writes its name beside the pin instead (an area, a library or a bridge's deck, is
  // outlined and carries its name already)
  const to = state.to, endName = to && to.portal && !to.portal.room && !to.portal.area ? lang => shortName(placeTitle(to, lang)) : null;
  if (!r) return { floors: {}, start: at(state.from), end: at(state.to), changes: [], endName };
  const floors = {};
  for (const L of r.legs) {
    const f = campus.byId[L.floor];
    (floors[L.floor] ||= []).push(f.mapLine(L.points));
  }
  const S = r.steps, legs = r.legs;
  const first = S[0] && S[0].type === 'walk' && legs[0], last = S[S.length - 1] && S[S.length - 1].type === 'walk' && legs[legs.length - 1];
  const pt = (L, i) => { const f = campus.byId[L.floor], p = L.points[i < 0 ? L.points.length - 1 : i]; const [x, y] = f.routePoint(p[0], p[1]); return { floor: L.floor, x, y }; };
  // a bridge between two floors drawn together: its line from one door to the other
  const links = S.filter(s => s.type === 'bridge').map(s => {
    const a = campus.byId[s.fromFloor].portalById.get(s.id), b = campus.byId[s.toFloor].portalById.get(s.id);
    return a && b ? { floor: s.fromFloor, toFloor: s.toFloor, points: [[a.x, a.y], [b.x, b.y]] } : null;
  }).filter(Boolean);
  const changes = S.filter(s => s.type !== 'walk').map(s => {
    const f = campus.byId[s.fromFloor], p = f.portalById.get(s.id);
    return {
      floor: s.fromFloor, x: p ? p.x : 0, y: p ? p.y : 0, toFloor: s.toFloor,
      kind: s.type === 'bridge' || !s.rise ? 'bridge' : s.rise > 0 ? 'up' : 'down',
      label: lang => connName(s, lang) + (floorAcross(f, campus.byId[s.toFloor], lang) ? ` → ${floorAcross(f, campus.byId[s.toFloor], lang)}` : ''),
    };
  });
  // the walks and bridges in the order they are taken: step by step, what lies behind the step and
  // what lies ahead of it are drawn differently
  const order = { legs: {}, links: [] };
  let g = 0;
  for (const st of S) {
    if (st.type === 'walk') (order.legs[st.floor] ||= []).push(g++);
    else if (st.type === 'bridge') order.links.push(g++);
  }
  return { floors, links, order, start: first ? pt(first, 0) : at(state.from), end: last ? pt(last, -1) : at(state.to), changes, endName };
}

// The floors a trip is on, in order: a floor where it only takes or leaves a lift counts too.
function routeFloors(r) {
  const seq = [];
  const add = id => { if (seq[seq.length - 1] !== id) seq.push(id); };
  for (const s of r.steps) { if (s.type === 'walk') add(s.floor); else { add(s.fromFloor); add(s.toFloor); } }
  return seq;
}

// The floor a connector leads to, short: "L4"; nothing for a bridge or walkway, which stays on its level.
function floorAcross(from, to, lang) {
  return from.level === to.level ? '' : floorName(to, lang, true);
}

function connName(s, lang) {
  if (s.type === 'elevator') return t(lang, 'connLift');
  if (s.type === 'bridge') return t(lang, walkway(s) ? 'connWalkway' : 'connBridge');
  return nameIn(s.label, lang) || s.id;
}

function fitRouteOn(f) {
  const R = map.route;
  if (!R) return;
  // the level's: both wings are drawn, so the stretch over the bridge is framed whole
  const ids = new Set([f, ...f.partners].map(g => g.id));
  const pts = [...[...ids].flatMap(id => (R.floors[id] || []).flat())];
  for (const m of [R.start, R.end, ...R.changes]) if (m && ids.has(m.floor)) pts.push([m.x, m.y]);
  if (!pts.length) return;
  map.fitBounds(box(pts, 8), { maxScale: 10, pad: 44 });
}

function box(pts, pad) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

function focusPlace(p) {
  relayout();
  showFloor(p.floor);
  const r = p.portal && (p.portal.room || p.portal.area);
  const pts = r ? r.ring : p.portal ? [[p.portal.x, p.portal.y]] : null;
  if (pts) map.fitBounds(box(pts, 14), { maxScale: 12 });
}

function setMarks() {
  // a room, or a place drawn as a walkable area (a library): tinted and outlined the same
  const m = p => (p && p.portal && (p.portal.room || p.portal.area) ? { floor: p.floor, room: p.portal.room || p.portal.area } : null);
  map.setMarks({ from: m(state.from), to: m(state.to), pick: m(state.pick) });
}

// ---- floors ---------------------------------------------------------------------------------

function showFloor(f, { fit = false } = {}) {
  // the other building's floor on this level is drawn alongside: going to it is no jump
  const jump = !state.floor || (state.floor.building !== f.building && !state.floor.partners.includes(f));
  state.floor = f;
  map.setFloor(f, { fit: fit || jump });
  renderFloors();
}

function renderFloors() {
  const L = state.lang, f = state.floor;
  if (!f) return;
  const onRoute = new Set(state.route ? routeFloors(state.route) : []);
  // One button per level. A level's two wings are drawn together, and the floor you are on follows
  // the view (pan across the bridge and you are on Toh Tuck's), so a wing needs no button of its own.
  // (every level the floors index lists, from the first draw: one still on its way is gone to once in)
  const levels = [...new Set(site.index.floors.map(x => x.level))].sort((a, b) => b - a);
  $('levels').innerHTML = '';
  for (const n of levels) {
    const here = site.floors.filter(x => x.level === n);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(n);
    btn.setAttribute('aria-label', t(L, 'level', { n }));
    if (!here.length) btn.setAttribute('aria-busy', 'true');
    if (n === f.level) { btn.setAttribute('aria-current', 'true'); requestAnimationFrame(() => reveal(btn)); }
    const routed = here.find(x => onRoute.has(x.id));
    if (routed) btn.classList.add('on-route');
    // a level picked by hand is shown whole (or the route on it): a small floor such as L6 kept
    // the last floor's framing and sat tiny in grey. Its floor is the route's, else the wing you
    // are in, else Lakeside's (L5 and L6 have no Toh Tuck floor).
    btn.addEventListener('click', () => {
      dismissLinkNotice();
      closeFloorList();
      waitLevel = here.length ? null : n;
      if (!here.length) return;
      const x = routed || here.find(g => g.building === state.floor.building) || here[0];
      showFloor(x);
      if (routed) fitRouteOn(x); else map.showFloor();
    });
    $('levels').appendChild(btn);
  }
  $('floor-pill-n').textContent = String(f.level);
  $('floor-pill-b').textContent = t(L, 'levelWord');
  $('floor-pill').setAttribute('aria-label', `${floorName(f, L)}: ${t(L, 'floors')}`);
  $('floor-pill').classList.toggle('on-route', [...onRoute].some(id => id !== f.id));
  $('floorname').textContent = floorName(f, L);
  $('map').setAttribute('aria-label', floorName(f, L));
  fitFloorbar();
}

// The floor pill opens the whole list; the sheet steps down to a line to make room, and comes back
// when a floor is chosen.
let sheetBefore = null;
function openFloorList() {
  const fb = $('floorbar');
  if (fb.classList.contains('expanded')) { closeFloorList(); return; }
  sheetBefore = sheetMode();
  const focused = document.activeElement === $('floor-pill');
  fb.classList.add('expanded');
  $('floor-pill').setAttribute('aria-expanded', 'true');
  setSheet('min');
  // (the pill hides while the list is open: the keyboard's place goes to this floor's button)
  if (focused) { const on = $('levels').querySelector('[aria-current], .on'); if (on) on.focus(); }
}

function closeFloorList() {
  const fb = $('floorbar');
  if (!fb.classList.contains('expanded')) return;
  fb.classList.remove('expanded');
  $('floor-pill').setAttribute('aria-expanded', 'false');
  if (sheetBefore) setSheet(sheetBefore);
  sheetBefore = null;
}

// The current floor's button in view when the floor column scrolls (scrolling the column only:
// scrollIntoView could also shift the map underneath).
function reveal(btn) {
  const fb = $('floorbar'), y = btn.offsetTop, h = btn.offsetHeight;
  if (y < fb.scrollTop) fb.scrollTop = y - 4;
  else if (y + h > fb.scrollTop + fb.clientHeight) fb.scrollTop = y + h - fb.clientHeight + 4;
}

// ---- the sheet --------------------------------------------------------------------------------

function render() {
  const L = state.lang;
  const end = (el, p, empty, here) => {
    el.classList.toggle('empty', !p);
    if (!p) { el.textContent = t(L, empty); return; }
    // (a toilet keeps its brackets: they say whose it is; a side of a big place is the place, and the side)
    const side = p.side ? ` · ${sideText(p, L)}` : '';
    if (p.sideOf) p = p.sideOf;
    const title = p.toiletNamed ? placeTitle(p, L) : shortName(placeTitle(p, L)), code = p.code && title !== p.code ? ` ${p.code}` : '';
    // "Toilet", "Passenger Lift" alone could be anywhere: say which floor (and near what); a name
    // of its own ("Canteen Level 1") already says
    const nr = p.type === 'stair' ? '' : nearText(p, L);
    const where = !p.generic ? '' : ` · ${floorName(p.floor, L)}${nr ? ` · ${t(L, 'near', { place: nr })}` : ''}`;
    el.innerHTML = (here ? `<span class="here">${esc(t(L, 'youAreHere'))}</span> · ` : '') + esc(keepCodes(title + code + side + where));
  };
  end($('from-v'), state.from, 'chooseStart', state.here);
  $('end-from').classList.toggle('invite', !state.from && !!state.to);
  end($('to-v'), state.to, 'whereTo', false);
  const total = state.stopTotal, at = total - state.stops.length + 1;
  $('to-k').innerHTML = esc(t(L, 'to')) + (total > 1 ? ` · <span class="of">${esc(t(L, 'stopOf', { i: at, n: total }))}</span>` : '');
  const after = state.stops[1];
  $('btn-next').hidden = !after;
  if (after) $('btn-next').textContent = t(L, 'nextStop', { place: placeTitle(after, L) });

  const r = state.route;
  if (r) {
    // (a level once, over the bridge too: "L2 → L3", never "L2 → L2 → L3")
    const fl = routeFloors(r).map(id => floorName(campus.byId[id], L, true)).filter((x, i, a) => x !== a[i - 1]);
    // (under a minute is under 60 s: at 45 a trip and its way back, the climb slower than the
    // descent, could fall either side and read as two different walks)
    const head = underMinute(r.seconds) ? t(L, 'summaryShort', { dist: fmtDist(r.metres, L) })
      : t(L, 'summary', { dist: fmtDist(r.metres, L), time: fmtTime(r.seconds, L) });
    // each floor whole ("TT 4楼" once broke before 楼 on a small phone)
    // (and "about 3 min" whole: it once broke before "min")
    $('summary').innerHTML = `${head.split(' · ').map(x => `<span class="nobr">${esc(x)}</span>`).join(' · ')}<small>${fl.map(x => `<span class="nobr">${esc(x)}</span>`).join(' → ')}</small>`;
  } else $('summary').innerHTML = '';
  $('summary').hidden = !r;
  $('route-note').hidden = !(r && state.note);
  $('route-note').textContent = r && state.note ? t(L, state.note) : '';

  // the place card, for a room tapped on the map; with a route showing it takes the sheet's place
  // (the brand guide: a route sheet and a place card are never on screen together) and offers the
  // way back to the route
  // ...and, for a start in a big place, which side you are at: one button a side, numbered as its pin
  const sd = state.sides, p = sd ? sd.main : state.pick;
  $('card').hidden = !p;
  const over = !!(p && r);
  // (the question takes the whole sheet, as a card does over a route: owner, 2 Nov 2026)
  $('sheet').classList.toggle('carding', over || !!sd);
  $('sheet').classList.toggle('siding', !!sd);
  $('card-back').hidden = !over || !!sd;
  $('card-actions').hidden = !!sd;
  $('card-sides').hidden = !sd;
  if (p) {
    $('card-title').textContent = placeTitle(p, L);
    $('card-sub').textContent = sd ? t(L, 'whichSide') : subtitle(p, L);
    $('card-ico').className = `card-ico k-${p.kind}`;
    $('card-ico').innerHTML = svg(P[p.kind] || P.room);
  }
  if (sd) {
    const box_ = $('card-sides');
    box_.innerHTML = '';
    sd.main.sides.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn side-btn';
      b.innerHTML = `<span class="side-n" aria-hidden="true">${i + 1}</span>${esc(sideText(s, L))}`;
      b.addEventListener('click', () => pickSide(s));
      box_.appendChild(b);
    });
  }
  $('go').hidden = !r || state.current >= 0;
  $('btn-share').hidden = !r;
  $('trip-head').hidden = !(state.from || state.to);
  // on a phone, step by step gives the sheet to the step (the panel of a wide screen has room)
  $('sheet').classList.toggle('stepping', state.current >= 0 && (!WIDE.matches || SHORT.matches));
  renderMini();
  renderStepbar();
  renderSteps();
  renderFloors();
  renderIdle();
}

// One step at a time, with the map following: for walking with the phone in hand.
function renderStepbar() {
  const bar = $('stepbar'), i = state.current, s = state.steps[i], L = state.lang;
  bar.hidden = !s;
  if (!s) return;
  const count = t(L, 'stepCount', { i: i + 1, n: state.steps.length });
  const sub = [s.dist ? fmtDist(s.dist, L) : '', count].filter(Boolean).join(' · ');
  // the first time: the map does not follow you (no location is used), you move it on
  const tip = i === 0 && !store.get('stepsSeen') ? `<small class="stepbar-tip">${esc(t(L, 'stepsTip'))}</small>` : '';
  const conn = s.connector && !s.seam ? ' conn' : s.kind === 'arrive' ? ' arrive' : '';
  // arriving: the door's number, large (it is what you match against the door), then which side
  // it is on and the room's name; a place with no number by its name
  const to = s.kind === 'arrive' ? state.to : null;
  const goal = to ? to.code || placeTitle(to, L) : '';
  const named = to && to.code && !isPlainClassroom(to) ? shortName(placeTitle(to, L)) : '';
  const side = to ? (s.dir ? t(L, 'arriveOn', { dir: t(L, s.dir) }) : s.ahead ? t(L, 'arriveAheadShort') : '') : '';
  const what = goal ? [side, named !== goal ? named : ''].filter(Boolean).join(' · ') : '';
  const text = goal ? `<span class="stepbar-goal">${whole(esc(goal))}</span>${what ? `<small>${esc(what)}</small>` : ''}` : whole(esc(s.text));
  $('stepbar-main').innerHTML = `<span class="step-ico${conn}">${(STEP_ICON[s.kind] || STEP_ICON.depart)(s)}</span>`
    + `<span class="stepbar-text">${text}${tip}</span>`;
  // how far and which step, between the arrows
  $('stepbar-meta').textContent = goal ? count : sub;
  $('step-prev').disabled = i <= 0;
  // at the door: Done, instead of a dead arrow
  const last = i >= state.steps.length - 1;
  $('step-next').hidden = last;
  $('step-done').hidden = !last;
}

function renderSteps() {
  const ol = $('steps'), L = state.lang;
  ol.innerHTML = '';
  // the line is dashed from a stair or a lift to the first step on the floor it reaches; a level is
  // headed once, over the bridge to the TT wing too
  let level = null, climbed = false;
  state.steps.forEach((s, i) => {
    const f = campus.byId[s.floor];
    if (f.level !== level) {
      level = f.level;
      const h = document.createElement('li');
      h.className = 'steps-floor' + (climbed ? ' climb' : '');
      h.textContent = floorName(f, L);
      ol.appendChild(h);
    }
    const li = document.createElement('li');
    const climb = /^(stairs|lift)-/.test(s.kind);
    li.className = 'step' + (s.toFloor && !s.seam ? ' conn' : '') + (s.kind === 'arrive' ? ' arrive' : '') + (i === 0 ? ' start' : '')
      + (climb ? ' climb' : '') + (climbed ? ' climbed' : '') + (i === state.current ? ' current' : '');
    climbed = climb;
    li.tabIndex = 0;
    li.innerHTML = `<span class="step-ico">${(STEP_ICON[s.kind] || STEP_ICON.depart)(s)}</span>`
      + `<span class="step-text">${whole(esc(s.text))}</span>`
      + `<span class="step-dist">${s.dist ? esc(fmtDist(s.dist, L)) : ''}</span>`;
    // (on a wide screen the list stays beside the map, with no step bar: the step shown, clicked again, is
    // the whole route again, as Escape is. A clicked step had no way back but the browser's, review 10 Nov)
    const go = () => (i === state.current && WIDE.matches && !SHORT.matches ? closeLayer('steps') : focusStep(i));
    li.addEventListener('click', go);
    // on a laptop or a kiosk, pointing at a step shows its stretch of the route
    li.addEventListener('mouseenter', () => { if (s.floor === state.floor.id) map.setFocus(stepFocus(s)); });
    li.addEventListener('mouseleave', () => map.setFocus(stepFocus(state.steps[state.current])));
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    ol.appendChild(li);
  });
}

function stepFocus(s) {
  return s && s.focus && s.focus.length > 1 ? { floor: s.floor, points: s.focus } : null;
}

function focusStep(i) {
  if (backing) { settled(() => focusStep(i)); return; }
  const s = state.steps[i];
  if (!s) return;
  if (state.current < 0) openLayer('steps');
  state.current = i;
  [...$('steps').querySelectorAll('.step')].forEach((el, k) => el.classList.toggle('current', k === i));
  $('go').hidden = true;
  $('sheet').classList.toggle('stepping', !WIDE.matches || SHORT.matches);
  renderStepbar();
  setSheet('mid');
  relayout();
  const f = campus.byId[s.floor];
  showFloor(f);
  map.setFocus(stepFocus(s));
  // the floor changes already made leave the map (each connector step is one of the route's changes)
  map.setPassed(state.steps.slice(0, i).filter(x => x.toFloor).length);
  // the landmark the step names is labelled, however small its room is drawn
  const lm = s.mark && campus.byId[s.floor].portalById.get(s.mark);
  map.setMarks({ near: lm && lm.room ? { floor: campus.byId[s.floor], room: lm.room, text: s.markText } : null });
  if (s.focus && s.focus.length) map.fitBounds(box(s.focus, 8), { maxScale: 16 });
}

// Out of step-by-step, back to the whole route.
function endSteps() {
  state.current = -1;
  map.setFocus(null);
  map.setPassed(0);
  map.setMarks({ near: null });
  render();
  if (state.route) { const f = state.floor; fitRouteOn(f); }
}

// A room code never breaks at its hyphens ("LKS-401-1" once split over two lines): word joiners
// either side of each, so the hyphen keeps its own glyph.
function keepCodes(text) { return text.replace(/([A-Z0-9])-(?=[A-Z0-9])/g, '$1\u2060-\u2060'); }

// A place's line under its name, on its card and in a list: "LKS-405 · Level 4 · Staff only". A level in
// words is "Level 4" everywhere (owner, 10 Nov 2026: the lists said "L4" on a row that would have
// wrapped and "Level 2" on the next); a long line takes its second row. "L4" is kept for the arrows:
// "L3 → L2" on the trip's line, "→ L5" on a stair's step, "via L2" beside ↑2.
function subtitle(p, L) {
  const bits = [];
  if (p.code && placeTitle(p, L) !== p.code) bits.push(p.code);
  if (isPlainClassroom(p)) bits.push(nameIn(p.name, L));
  bits.push(floorName(p.floor, L));
  if (p.staffOnly) bits.push(t(L, 'staffOnly'));
  if (!p.code && nearText(p, L)) bits.push(t(L, 'near', { place: nearText(p, L) }));
  return bits.join(' · ');
}

function notice(key, kind, vars) {
  state.notice = key ? { key, kind, vars } : null;
  // "Pick on the map" waits only while its notice says so: once anything else takes the notice away (a
  // search, Back, the trip's ×), a later tap on a room is just a tap. It stayed armed, and replaced the
  // destination without a word (review, 10 Nov)
  if (state.mapPick && !(key === 'pickFromNotice' || key === 'pickToNotice')) state.mapPick = null;
  showNotice();
}

function showNotice() {
  const n = $('notice'), m = state.notice;
  n.hidden = !m;
  $('notice-text').textContent = m ? t(state.lang, m.key, m.vars) : '';
  n.className = 'notice' + (m && m.kind ? ' ' + m.kind : '');
}

// "This link points at …" has said its piece once you do something else
function dismissLinkNotice() { if (state.notice && (state.notice.key === 'unknownPlace' || state.notice.key === 'stepFreeYours')) notice(null); }

function onMapTap(id, floor) {
  closeFloorList();
  if (floor && floor !== state.floor) { state.floor = floor; renderFloors(); }
  if (!id) { if (state.pick) { state.pick = null; setMarks(); render(); } return; }
  const f = state.floor, portal = f.portalById.get(id);
  const key = `${f.id}:${portal && portal.entranceOf ? portal.entranceOf : id}`;
  // (none yet while the places are on their way: the map is drawn first)
  const p = places && places.get(key);
  // a room the plans give no name (L3's blank block) is not a place to pick
  if (!p || p.blank) return;
  // choosing a start or a destination: a place tapped on the map is it (on a wide screen the search
  // stays open beside the map; on a phone, "Pick on the map" closed it to let you tap)
  if (state.layer === 'picker' && WIDE.matches) { choose(p); return; }
  if (state.mapPick) { pickedOnMap(p); return; }
  state.pick = p;
  setMarks();
  render();
  if (sheetMode() !== 'open') setSheet('mid');
}

// ---- the picker -------------------------------------------------------------------------------

// ---- what Back closes ------------------------------------------------------------------------

// The search, the share card and step-by-step each open on a history entry of their own (at the
// same address), so the phone's Back closes them before it leaves the app. One at a time: opening
// one over another takes its entry.
let afterBack = null, opener = null, backing = false;
function openLayer(name) {
  if (state.layer && state.layer !== name) hideLayer(state.layer);
  if (hist.state && hist.state.layer) hist.replaceState({ layer: name }, '');
  else hist.pushState({ layer: name }, '');
  state.layer = name;
}

// Close it from the app's own button: through history, so Back is not left pointing at it.
function closeLayer(name, then) {
  if (backing) return;   // a second tap while the first is on its way back
  if (state.layer !== name) { if (then) then(); return; }
  if (hist.state && hist.state.layer === name) { afterBack = then || null; backing = true; hist.back(); }
  else { state.layer = null; hideLayer(name); if (then) then(); }
}

// Something opened while a Back is still on its way (Done, then Share at once) waits for it: the Back
// would otherwise land on the new thing's history entry and close it.
function settled(fn) {
  if (!backing) { fn(); return; }
  const prev = afterBack;
  afterBack = () => { if (prev) prev(); fn(); };
}

function hideLayer(name) {
  if (name === 'lang') { hideGate(); if (opener && document.contains(opener)) opener.focus({ preventScroll: true }); opener = null; return; }
  if (name === 'picker') { $('picker').hidden = true; $('picker-q').blur(); }
  if (name === 'share') $('share').hidden = true;
  if (name === 'picker' || name === 'share') {
    behind(false);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  }
  if (name === 'steps') endSteps();
}

// Under the search or the share card the map and the sheet wait, out of reach of a finger, a tab or
// a screen reader; the red bar stays live, so the language can still be switched.
function behind(off, layer) {
  // (on a wide screen the map stays live beside the search: a place clicked on it is chosen)
  const live = layer === 'picker' && WIDE.matches;
  for (const id of live ? ['sheet'] : ['stage', 'sheet']) {
    $(id).inert = off;
    if (off) $(id).setAttribute('aria-hidden', 'true'); else $(id).removeAttribute('aria-hidden');
  }
  // the home link would end the trip from under the dialog; the share card has the whole bar
  $('brand').inert = off;
  $('btn-lang').inert = off && layer === 'share';
  $('app').classList.toggle('picking', off && !live);
  if (!off) { $('stage').inert = false; $('stage').removeAttribute('aria-hidden'); }
}

// Tab stays in the open dialog (and, for the search, the language button beside it).
function trapFocus(e) {
  const gate = gateMode === 'choose' || gateMode === 'pick';
  if (e.key !== 'Tab' || (!gate && state.layer !== 'picker' && state.layer !== 'share')) return;
  const box = $(gate ? 'gate' : state.layer === 'picker' ? 'picker' : 'share');
  const all = [...box.querySelectorAll('button, input, [tabindex="0"]')].filter(el => !el.hidden && el.offsetParent !== null && !el.disabled);
  if (!gate && state.layer === 'picker' && !$('btn-lang').inert) all.unshift($('btn-lang'));
  if (!all.length) return;
  const i = all.indexOf(document.activeElement);
  const next = e.shiftKey ? (i <= 0 ? all[all.length - 1] : all[i - 1]) : (i < 0 || i === all.length - 1 ? all[0] : all[i + 1]);
  e.preventDefault();
  next.focus();
}

function onBack() {
  const name = state.layer, then = afterBack;
  state.layer = null; afterBack = null; backing = false;
  if (name) hideLayer(name);
  if (then) then();
  else if (!name && state.to && !(hist.state && hist.state.trip)) clearTrip();
  else writeLink();
}

// A route on the map, or a destination waiting for its start, has a history entry of its own too,
// under any of those: Back from it takes the destination away (the start stays: the door you
// scanned, say) before it leaves the app (a destination picked on the map, then Back twice, once
// left the app with it still set).
function tripEntry() {
  if ((state.route || state.to) && !state.layer && !(hist.state && (hist.state.trip || hist.state.layer))) hist.pushState({ trip: true }, '');
}

function clearTrip() {
  state.to = null; state.stops = []; state.stopTotal = 0;
  compute({ fit: false });
  if (state.from) focusPlace(state.from);
}

// The trip's ×: no destination, the plain map. The door this phone scanned stays as "You are
// here" (you are still standing at it: clearing it made a parent find their room again); a
// second × clears that too. The trip's own history entry goes with it, so Back is not left
// pointing at a route that is gone.
function endTrip() {
  if (backing) { settled(endTrip); return; }
  const keepHere = state.here && !!state.to;
  const clear = () => {
    if (!keepHere) { state.from = null; notHere(); }
    state.to = null; state.stops = []; state.stopTotal = 0; state.pick = null;
    compute({ fit: false });
    if (keepHere) focusPlace(state.from); else map.showFloor();
  };
  if (hist.state && hist.state.trip && !state.layer) { afterBack = clear; backing = true; hist.back(); }
  else clear();
}

function openPicker(which) {
  if (backing) { settled(() => openPicker(which)); return; }
  state.pickerFor = which; state.chip = null; state.toilet = null; state.active = -1;
  dismissLinkNotice();
  if (state.mapPick) notice(null);
  opener = document.activeElement;
  openLayer('picker');
  behind(true, 'picker');
  $('picker').hidden = false;
  const q = $('picker-q');
  q.value = '';
  q.placeholder = t(state.lang, which === 'from' ? 'chooseStart' : 'whereTo');
  $('picker-clear').hidden = true;
  q.focus();
  renderChips();
  renderResults();
}

function closePicker(then) { closeLayer('picker', then); }

// "Pick on the map" (phones): the search closes, and the next place tapped is the start or the
// destination it was opened for.
function pickOnMap() {
  const which = state.pickerFor;
  closePicker(() => { state.mapPick = which; notice(which === 'from' ? 'pickFromNotice' : 'pickToNotice', 'info'); });
}
function pickedOnMap(p) {
  const which = state.mapPick;
  state.mapPick = null; notice(null);
  remember(p);
  const after = () => {
    state.pick = null;
    if (state.from && state.to) compute();
    else { setMarks(); map.setRoute(drawn()); render(); tripEntry(); writeLink(); }
  };
  if (which === 'from') setFrom(p, after);
  else { state.to = p; state.stops = [p]; state.stopTotal = 1; after(); }
}

// A start in a big place whose exits are far apart (the Secondary Library, the gym: owner, 1 Nov
// 2026): which side are you at? Its sides are pinned and framed on the map and the card asks; a door
// label at one of them starts there without asking (its link names the side).
function setFrom(p, after) {
  const go = s => { state.from = s; notHere(); after(); };
  if (!(p.sides && p.sides.length > 1)) { go(p); return; }
  state.sides = { main: p, go };
  state.pick = null;
  showFloor(p.floor);
  map.setSides(p.sides.map((s, i) => ({ floor: s.floor, x: s.portal.x, y: s.portal.y, n: i + 1 })));
  render();
  if (sheetMode() !== 'open') setSheet('mid');
  // the whole place framed, its sides in it (framed once the card has the sheet: it covers the map's foot on a phone)
  relayout();
  const r = p.portal && (p.portal.room || p.portal.area);
  map.fitBounds(box([...(r ? r.ring : []), ...p.sides.map(s => [s.portal.x, s.portal.y])], 4), { maxScale: 9 });
}
// A side of a big place is where a trip starts; as a destination it is the place, and the trip ends at its nearer
// side (owner, 2 Nov 2026), not at the one a swap or a link named
function asDest(p) { return (p && p.sideOf) || p; }
function pickSide(s) {
  const q = state.sides;
  state.sides = null; map.setSides([]);
  if (q) q.go(s);
}
function cancelSides() { state.sides = null; map.setSides([]); render(); }
const sideText = (s, L) => { const x = nameIn(s.side, L); return x.charAt(0).toUpperCase() + x.slice(1); };

function choose(p) {
  if (!p) return;
  remember(p);
  const which = state.pickerFor;
  closePicker(() => {
    const after = () => {
      state.pick = null;
      if (state.from && state.to) compute();
      // a place looked up is shown first; the From field then invites a start for directions (a destination
      // waiting for its start has its history entry, as a route does: Back took the app away with it, 6 Nov)
      else { setMarks(); map.setRoute(drawn()); render(); tripEntry(); writeLink(); focusPlace(state.from && which === 'from' ? state.from : p); }
    };
    if (which === 'from') setFrom(p, after);
    else { state.to = p; state.stops = [p]; state.stopTotal = 1; after(); }
  });
}

function renderChips() {
  const box_ = $('chips'), L = state.lang;
  box_.innerHTML = '';
  for (const c of CHIPS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.textContent = t(L, c.key);
    b.setAttribute('aria-pressed', String(state.chip === c));
    b.addEventListener('click', () => {
      state.chip = state.chip === c ? null : c;
      state.toilet = null;
      $('picker-q').value = '';
      $('picker-clear').hidden = true;
      renderChips(); renderResults();
    });
    box_.appendChild(b);
  }
  // toilets: whose (girls' and boys' are for students, women's, men's and all-gender for adults)
  const sub = $('chips-sub'), kinds = state.chip && state.chip.kind === 'toilet' ? places.toiletKinds() : [];
  sub.hidden = !kinds.length;
  sub.innerHTML = '';
  for (const k of kinds) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip chip-sub';
    b.textContent = toiletWord(k, L);
    b.setAttribute('aria-pressed', String(state.toilet === k));
    b.addEventListener('click', () => { state.toilet = state.toilet === k ? null : k; renderChips(); renderResults(); });
    sub.appendChild(b);
  }
}

// How far each place is from the other end of the trip, walking, when there is one: metres to
// show, and seconds to rank by, which count the stairs (a toilet one flight up is not nearer
// than one 10 m further along the same corridor).
function distances(list, every, near) {
  // (from a place the search named instead: "toilet near the library")
  const other = near || (state.pickerFor === 'to' ? state.from : state.to);
  if (!other) return new Map();
  const out = new Map();
  // a kind chip ranks them all by distance (about 30 ms for 70 offices); typed results are
  // ranked by how well they match, so only the first few need a distance
  for (const p of every ? list : list.slice(0, 40)) {
    if (p.key === other.key) continue;
    const r = near || state.pickerFor === 'to' ? router.route(other.key, p.key, { stepFree: state.stepFree })
                                               : router.route(p.key, other.key, { stepFree: state.stepFree });
    if (r.ok) out.set(p.key, r);
  }
  return out;
}

function renderResults() {
  const L = state.lang, q = $('picker-q').value.trim(), ul = $('results');
  ul.innerHTML = '';
  // a search that is only a kind of place ("toilet", "洗手间") is that kind's chip: nearest first;
  // a kind somewhere ("toilet near the library", "girls toilet L3") the chip there
  const kind = !state.chip && q ? places.kindOf(q) : null;
  const ask = !state.chip && q && !kind ? places.ask(q) : null;
  const chip = state.chip || (kind && CHIPS.find(c => c.kind === kind)) || (ask && ask.kind && CHIPS.find(c => c.kind === ask.kind)) || null;
  const near = ask && ask.anchor;
  const toiletK = chip && chip.kind === 'toilet' ? state.toilet || (ask && ask.toilet) || null : null;
  let list, head = null, sortByDist = false, scores = null;
  const subHeads = new Map();   // a second heading part way down the list, before the place it holds
  if (chip) {
    list = places.ofKind(chip, toiletK); head = toiletK ? toiletWord(toiletK, L) : t(L, chip.key); sortByDist = true;
    // ("Girls' Toilet near the library": the toilet's own name, not the tag "Girls" alone, which read
    // as "the girls near the library", in Chinese above all)
    if (near) head = t(L, 'kindNear', { kind: toiletK ? t(L, 'toilet' + toiletK[0].toUpperCase() + toiletK.slice(1)) : head, place: shortName(placeTitle(near, L)) });
  }
  else if (q) {
    const sc = places.scored(ask ? ask.text : q);
    scores = new Map(sc.map(([v, p]) => [p.key, v]));
    list = sc.map(([, p]) => p);
    head = t(L, 'results');
  } else {
    const other = state.pickerFor === 'to' ? state.from : state.to;
    list = recent().filter(p => p !== other);
    head = list.length ? t(L, 'recent') : null;
    // a start: the ways in and the drop-off points, after the places you used (knowing where you
    // are is the hard part for a visitor)
    if (state.pickerFor === 'from') {
      const ways = ARRIVALS.map(k => places.get(k)).filter(p => p && p !== other && !list.includes(p));
      if (ways.length && head) subHeads.set(ways[0], t(L, 'arrivals'));
      else if (ways.length) head = t(L, 'arrivals');
      list = [...list, ...ways];
    }
    // the places people look for most, to start from: under what you used, never instead of it (one
    // recent place once left the list otherwise empty, a review found)
    const pop = POPULAR.map(k => places.get(k)).filter(p => p && p !== other && !list.includes(p));
    if (!list.length) { list = pop; head = t(L, 'popular'); }
    else if (state.pickerFor === 'to' && pop.length) { subHeads.set(pop[0], t(L, 'popular')); list = [...list, ...pop]; }
  }
  // on a floor the search named: "toilets on L2", "3楼洗手间"
  if (ask && ask.level) {
    list = list.filter(p => p.floor.level === ask.level && (!ask.building || p.floor.building === ask.building));
    head = `${head || t(L, 'results')}${t(L, 'capSep')}${t(L, 'level', { n: ask.level })}`;
  }
  // the door this phone scanned, offered back as a start (after a swap, say)
  const scanned = state.pickerFor === 'from' && !q && !state.chip && places.get(session.get('here') || '');
  if (scanned && scanned !== state.from && scanned !== state.to) list = [scanned, ...list.filter(p => p !== scanned)];
  const dist = distances(list, sortByDist || !!scores, near);
  if (sortByDist && dist.size) {
    const secs = p => (dist.has(p.key) ? dist.get(p.key).seconds : 1e9);
    list = [...list].sort((a, b) => secs(a) - secs(b));
  }
  // the place a kind is near, when it is of that kind itself ("stairs 8", "french office": Stairs 8 and the
  // French Office), first: it was last, with no distance from itself (review, 10 Nov)
  if (chip && near) {
    const i = list.findIndex(p => p.key === near.key);
    if (i > 0) list = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
  }
  // a kind typed as a word ("canteen"): the places that carry the word first, then the rest of the
  // kind. Not for toilets: 卫生间, 洗手间, toilet and loo are one thing (sorting by the word once put
  // the Toh Tuck gym's 卫生间 first, 180 m away, as "nearest")
  if (kind && kind !== 'toilet' && !state.chip && q) {
    const word = new RegExp(`(^|[^a-z])${q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const ql = q.toLowerCase(), own = L !== 'en' && L !== 'zh';
    const says = p => word.test(p.name.en || '') || (!!p.name.zh && p.name.zh.includes(q)) || (own && nameIn(p.name, L).toLowerCase().includes(ql));
    list = [...list.filter(says), ...list.filter(p => !says(p))];
  } else if (scores && dist.size) {
    // as good a match, nearer first: a bonus too small to lift a weaker match over a better one
    const near = p => (dist.has(p.key) ? 30 * (1 - Math.min(600, dist.get(p.key).seconds) / 600) : 0);
    list = [...list].sort((a, b) => scores.get(b.key) + near(b) - scores.get(a.key) - near(a));
  }
  // Toilets, with somewhere to start from: the nearest for girls, boys, women and men first, each
  // as the one toilet in its block that serves them ("Nearest for men" is the Adults' Toilet, not
  // a block whose name starts with Girls), one row for two people it serves alike; on a step-free
  // trip the nearest accessible one first. Then every toilet, nearest first.
  const lead = new Map();
  if (chip && chip.kind === 'toilet' && !toiletK && dist.size) {
    const groups = [...(state.stepFree ? ['accessible'] : []), ...Object.keys(TOILET_GROUPS)];
    const rows = [];
    // each the nearest by the walk, whatever order the list is in
    const byTime = list.filter(q => dist.has(q.key)).sort((a, b) => dist.get(a.key).seconds - dist.get(b.key).seconds);
    for (const g of groups) {
      const p = byTime.find(q => places.serves(q, g));
      if (!p) continue;
      const one = places.toiletFor(p, g), same = rows.find(r => r.p.key === p.key && r.one.toilet === one.toilet);
      if (same) same.who.push(g); else rows.push({ p, one, who: [g] });
    }
    if (rows.length) {
      const shown = new Set(rows.map(r => r.p.key));
      list = [...rows.map(r => r.one), ...list.filter(p => !shown.has(p.key))];
      const word = g => t(L, 'who' + g[0].toUpperCase() + g.slice(1));
      rows.forEach((r, i) => lead.set(i, r.who[0] === 'accessible' ? t(L, 'nearestAccessible')
        : t(L, 'nearestFor', { who: joinAnd(r.who.map(word), L) })));
    }
  }
  // a lift or a staircase once, on the floor nearest the other end (or the lowest)
  if (chip && (chip.kind === 'lift' || chip.kind === 'stair')) {
    const seen = new Set();
    list = list.filter(p => !seen.has(p.id) && seen.add(p.id));
  }
  state.shown = list;
  state.active = q || chip ? 0 : -1;
  // the list is a listbox the search box drives: what the arrow keys have picked is announced
  const note = (cls, text) => { const li = document.createElement('li'); li.className = cls; li.setAttribute('role', 'presentation'); li.textContent = text; ul.appendChild(li); };
  ul.setAttribute('aria-label', head || t(L, 'results'));
  $('picker-q').removeAttribute('aria-activedescendant');
  // on a phone, a row to pick it on the map instead (a wide screen's map is live beside the search)
  if (!q && !state.chip && !WIDE.matches) {
    const li = document.createElement('li'), b = document.createElement('button');
    li.setAttribute('role', 'presentation');
    b.type = 'button'; b.className = 'result result-pickmap';
    b.innerHTML = `<span class="result-ico k-map">${svg(P.pickmap)}</span><span class="result-text"><span class="result-title">${esc(t(L, 'pickOnMap'))}</span>`
      + `<span class="result-sub">${esc(t(L, state.pickerFor === 'from' ? 'pickFromSub' : 'pickToSub'))}</span></span>`;
    b.addEventListener('click', pickOnMap);
    li.appendChild(b); ul.appendChild(li);
  }
  if (head) note('results-head', head);
  if (!list.length && (q || state.chip)) { note('results-empty', t(L, q.length === 1 && /[a-z0-9]/i.test(q) ? 'keepTyping' : 'noResults', { q: q || '' })); return; }
  // A list ranked by time shows the time first (a toilet 45 m away down two flights comes after
  // one 70 m away on your own floor), and under it the distance and which way the floor is.
  const from = near || (state.pickerFor === 'to' ? state.from : null);
  const floorHint = (p, d) => {
    if (!from) return '';
    // on your own level, but the way there is by another (round the gym, say): which one
    if (p.floor.level === from.floor.level) {
      const other = d && routeFloors(d).find(id => campus.byId[id].level !== from.floor.level);
      return other ? ` · ${esc(t(L, 'viaFloor', { f: floorName(campus.byId[other], L, true) }))}` : '';
    }
    const dl = p.floor.level - from.floor.level;
    if (!dl) return '';
    return ` · <span aria-label="${esc(t(L, (dl > 0 ? 'floorUp' : 'floorDown') + (Math.abs(dl) > 1 ? 's' : ''), { n: Math.abs(dl) }))}">${dl > 0 ? '↑' : '↓'}${Math.abs(dl)}</span>`;
  };
  list.forEach((p, i) => {
    if (subHeads.has(p)) note('results-head', subHeads.get(p));
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `result-${i}`;
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(i === state.active));
    b.className = 'result' + (i === state.active ? ' active' : '') + ((lead.has(i) || (!lead.size && sortByDist && i === 0 && dist.size)) ? ' nearest' : '');
    const d = dist.get(p.key);
    // a block of several toilets is "Toilets", with what it holds under it: "Girls, Boys · L4 · near KB-416";
    // a "Nearest for" row, which toilet it is: "Adults' Toilet (all-gender) · L1 · near KB-101"
    const holds = lead.has(i) ? placeTitle(p, L)
      : p.has && !p.toilet && p.has.length > 1 ? p.has.map(k => toiletWord(k, L)).join(t(L, 'listSep')) : '';
    const title = lead.has(i) ? lead.get(i)
      : !lead.size && sortByDist && i === 0 && dist.size && (chip.kind === 'toilet' || chip.kind === 'lift')
      ? (p.toilet ? t(L, 'nearestOf', { what: placeTitle(p, L) }) : t(L, chip.kind === 'toilet' ? 'nearestToilet' : 'nearestLift'))
      : (p === scanned ? `${t(L, 'youAreHere')} · ` : '') + (holds && p.toiletNamed ? shortName(placeTitle(p, L)) : placeTitle(p, L));
    b.innerHTML = `<span class="result-ico k-${p.kind}">${svg(P[p.kind] || P.room)}</span>`
      + `<span class="result-text"><span class="result-title">${esc(title)}</span>`
      + `<span class="result-sub">${esc(keepCodes((holds ? holds + ' · ' : '') + subtitle(p, L)))}</span></span>`
      + `<span class="result-dist">${d ? `${esc(fmtMins(d.seconds, L))}<small>${esc(fmtDist(d.metres, L))}${floorHint(p, d)}</small>` : ''}</span>`;
    b.addEventListener('click', () => choose(p));
    li.appendChild(b);
    ul.appendChild(li);
  });
  if (state.active >= 0) $('picker-q').setAttribute('aria-activedescendant', `result-${state.active}`);
}


// On a wide screen the panel has room to spare before a trip: the kinds of place, and the places
// people look for most, a click from being the destination.
function renderIdle() {
  const L = state.lang, show = WIDE.matches && !state.route && !state.pick && !state.to && !state.sides;
  $('idle').hidden = !show;
  if (!show) return;
  $('idle-find').textContent = t(L, 'findPlace');
  $('idle-pop').textContent = t(L, 'popular');
  const chips = $('idle-chips');
  chips.innerHTML = '';
  for (const c of CHIPS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = t(L, c.key);
    b.addEventListener('click', () => { openPicker('to'); state.chip = c; renderChips(); renderResults(); });
    chips.appendChild(b);
  }
  const ul = $('idle-list');
  ul.innerHTML = '';
  for (const p of POPULAR.map(k => places.get(k)).filter(p => p && p !== state.from)) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.className = 'result';
    b.innerHTML = `<span class="result-ico k-${p.kind}">${svg(P[p.kind] || P.room)}</span>`
      + `<span class="result-text"><span class="result-title">${esc(placeTitle(p, L))}</span>`
      + `<span class="result-sub">${esc(subtitle(p, L))}</span></span>`;
    b.addEventListener('click', () => {
      remember(p);
      state.to = p; state.stops = [p]; state.stopTotal = 1; state.pick = null;
      if (state.from) compute(); else { setMarks(); map.setRoute(drawn()); render(); tripEntry(); writeLink(); focusPlace(p); }
    });
    li.appendChild(b); ul.appendChild(li);
  }
}

function recent() {
  const keys = (store.get('recent') || '').split('|').filter(Boolean);
  return keys.map(k => places.get(k)).filter(Boolean);
}

function remember(p) {
  const keys = [p.key, ...(store.get('recent') || '').split('|').filter(k => k && k !== p.key)].slice(0, 6);
  store.set('recent', keys.join('|'));
}

// ---- sharing ------------------------------------------------------------------------------------

// The trip's own link as a QR code: from a lobby screen or a laptop to the phone in your hand.
function openShare() {
  if (backing) { settled(openShare); return; }
  if (!state.route) return;
  const L = state.lang, url = shareLink();
  const { d, n } = qrPath(qr(url, 'M'), 2);
  $('share-qr').innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${esc(url)}">`
    + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  $('share-trip').textContent = `${shortName(placeTitle(state.from, L))} → ${shortName(placeTitle(state.to, L))}`;
  $('share-copy').textContent = t(L, 'copyLink');
  $('share-native').hidden = !navigator.share;
  const phone = !WIDE.matches;
  $('share-title').textContent = t(L, phone ? 'shareTitlePhone' : 'shareTitle');
  document.querySelector('.share-sub').textContent = t(L, phone ? 'shareSubPhone' : 'shareSub');
  $('share').classList.toggle('phone', phone);
  opener = document.activeElement;
  openLayer('share');
  behind(true, 'share');
  $('share').hidden = false;
  $('share-close').focus();
}

function closeShare() { closeLayer('share'); }

// On a phone the trip goes on as a link: the phone's own share sheet, else the link copied. (The QR
// card is for a laptop or a lobby screen, to carry the trip to a phone.)
async function shareLinkNow() {
  if (!state.route) return;
  const L = state.lang, url = shareLink();
  const title = `${shortName(placeTitle(state.from, L))} → ${shortName(placeTitle(state.to, L))}`;
  if (navigator.share) {
    try { await navigator.share({ title, url }); } catch { /* closed without sharing */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); toast(t(L, 'linkCopied')); } catch { openShare(); }
}

function toast(text) {
  const el = $('toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---- the language page --------------------------------------------------------------------------
//
// A first visit opens on it: the languages the app speaks, each in its own name, the phone's own
// highlighted; one tap and the map opens in that language, which is remembered, so later visits go
// straight to the map. The header's language button opens it again over the map (as a layer Back
// closes), the current language highlighted. Not a drop-down: room for every language to come.
let gateMode = null;   // 'choose' (a first visit), 'pick' (from the header), 'wait' (the map loading), or null
// whether the last thing done was with a key (Tab, Enter) or a pointer (a tap, a click): opened by a key,
// the page puts the keyboard on the current language; opened by a tap, on itself (Safari drew the focus
// ring round the current language after a tap too, a second highlight the owner saw go off the screen)
let byKey = false;
addEventListener('keydown', () => { byKey = true; }, true);
addEventListener('pointerdown', () => { byKey = false; }, true);
// the header button's sign, drawn large as the page's heading
const LANG_SIGN = '<svg class="lang-ico gate-ico" viewBox="0 0 24 24" aria-hidden="true"><rect class="back" x="1.9" y="2.4" width="12.6" height="12.6" rx="2.4"/>'
  + '<text class="back-t" x="8.2" y="11.8">文</text><rect class="front" x="9.4" y="9" width="13.2" height="13.2" rx="2.6"/><text class="front-t" x="16" y="19.3">A</text></svg>';
let ready = false, failed = false;
let gateBack = null;   // opened from the search or a step: back to it once a language is picked

function showGate(mode) {
  const g = $('gate'), choose = mode === 'choose' || mode === 'pick';
  gateMode = mode;
  g.hidden = false; g.classList.remove('gone');
  g.dataset.mode = mode;
  // from the header, just the languages (owner): no heading, no brand, the close button
  $('gate-langs').hidden = !choose;
  $('gate-title').hidden = !choose;
  $('gate-wait').hidden = mode !== 'wait';
  $('gate-close').hidden = mode !== 'pick';
  $('gate-close').setAttribute('aria-label', t(state.lang, 'close'));
  if (choose) {
    g.setAttribute('role', 'dialog'); g.setAttribute('aria-modal', 'true');
    if (mode === 'choose') { g.setAttribute('aria-labelledby', 'gate-title'); g.removeAttribute('aria-label'); }
    else { g.removeAttribute('aria-labelledby'); g.setAttribute('aria-label', t(state.lang, 'language')); }
    renderGate(mode === 'pick' ? state.lang : systemLang());
  } else {
    for (const a of ['role', 'aria-modal', 'aria-labelledby', 'aria-label']) g.removeAttribute(a);
    $('gate-wait-text').textContent = t(state.lang, failed ? 'loadFail' : 'loading');
    $('gate-wait').querySelector('.gate-spin').hidden = failed;
  }
  // the page is the whole screen: the app waits underneath, out of reach
  $('app').inert = true; $('app').setAttribute('aria-hidden', 'true');
}

function hideGate() {
  const g = $('gate');
  gateMode = null;
  g.classList.add('gone');
  $('app').inert = false; $('app').removeAttribute('aria-hidden');
  setTimeout(() => { if (!gateMode) g.hidden = true; }, 350);
}

// The heading is the sign for languages, 文 and A on two panels, the header button's, which reads in
// any of them (owner, 2 Nov: simpler than a heading in one language); a screen reader hears it in the
// phone's language on a first visit, in the current one from the header. The languages in a fixed
// order, so each keeps its place.
function renderGate(on) {
  const pick = gateMode === 'pick';
  const l = language(pick ? state.lang : on);
  $('gate-title').innerHTML = `${LANG_SIGN}<span class="gate-said" lang="${l.html}">${esc(pick ? l.label : l.choose)}</span>`;
  const box = $('gate-langs');
  box.innerHTML = '';
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gate-lang'; b.lang = l.html; b.textContent = l.name; b.dataset.id = l.id;
    if (l.id === on) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => chooseLang(l.id));
    box.appendChild(b);
  }
  // from the header, on the highlighted language; on a first visit, on the page itself (a focus
  // ring round a button no one has touched reads as a second highlight)
  requestAnimationFrame(() => {
    const c = pick && byKey ? box.querySelector('[aria-current="true"]') : $('gate');
    if (c) c.focus({ preventScroll: true });
    // (on a small phone the list scrolls: the highlighted language in sight)
    const on_ = box.querySelector('[aria-current="true"]');
    if (on_) on_.scrollIntoView({ block: 'nearest' });
  });
}

async function chooseLang(L) {
  const mode = gateMode;
  // its words first (fetched once; English stands in if they cannot come)
  const b = [...$('gate-langs').children].find(x => x.dataset.id === L);
  if (b) b.setAttribute('aria-busy', 'true');
  await loadLang(L);
  if (b) b.removeAttribute('aria-busy');
  if (gateMode !== mode) return;
  setLang(L);
  if (mode === 'pick') { closeLanguages(); return; }
  // a first visit: on to the map, or a moment's wait for it, in the language just chosen
  if (ready) hideGate(); else showGate('wait');
}

function openLanguages() {
  if (gateMode) return;
  // (one layer at a time: the search or step-by-step gives way, and comes back after)
  const i = state.current;
  gateBack = state.layer === 'picker' ? (w => () => openPicker(w))(state.pickerFor) : state.layer === 'steps' ? () => focusStep(i) : null;
  opener = state.layer ? null : document.activeElement;
  openLayer('lang');
  showGate('pick');
}

function closeLanguages() {
  const back = gateBack;
  gateBack = null;
  closeLayer('lang', back);
}

// ---- language -------------------------------------------------------------------------------

function applyLang() {
  const L = state.lang;
  document.documentElement.lang = language(L).html;
  // the lockup's MAP, in the languages that write it in two characters of their own (地图, 지도)
  const brand = language(L).brand || '';
  document.documentElement.classList.toggle('brand-local', !!brand);
  for (const el of document.querySelectorAll('span.brand-word')) el.textContent = brand;
  document.title = t(L, 'docTitle');
  $('brand').setAttribute('aria-label', t(L, 'docTitle'));
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(L, el.dataset.t);
  labelList();
  // the button says what it is in every language, so it is found whichever one is showing
  $('btn-lang').setAttribute('aria-label', [...new Set([L, ...LANGS.filter(x => x !== L)].map(x => language(x).label))].join(' · '));
  $('btn-swap').setAttribute('aria-label', t(L, 'swap'));
  $('btn-end').setAttribute('aria-label', t(L, 'endTrip'));
  $('btn-down').setAttribute('aria-label', t(L, 'showMap'));
  $('btn-share').setAttribute('aria-label', t(L, WIDE.matches && !SIDEWAYS.matches ? 'share' : 'shareLink'));
  $('share-close').setAttribute('aria-label', t(L, 'close'));
  $('btn-fit').setAttribute('aria-label', t(L, 'showFloor'));
  $('picker-back').setAttribute('aria-label', t(L, 'back'));
  $('step-prev').setAttribute('aria-label', t(L, 'prevStep'));
  $('step-next').setAttribute('aria-label', t(L, 'nextStep'));
  $('picker-clear').setAttribute('aria-label', t(L, 'clear'));
  $('card-close').setAttribute('aria-label', t(L, 'close'));
  $('floorbar').setAttribute('aria-label', t(L, 'floors'));
  $('sheet').setAttribute('aria-label', t(L, 'steps'));
  $('grip').setAttribute('aria-label', t(L, 'steps'));
  $('step-exit').setAttribute('aria-label', t(L, 'endSteps'));
  $('notice-x').setAttribute('aria-label', t(L, 'close'));
}

function setLang(L) {
  state.lang = L;
  store.set('lang', L);
  applyLang();
  if (!campus) return;
  map.setLang(L);
  places.setLang(L);
  if (state.route) state.steps = routeSteps(state.route, campus, L);
  render();
  showNotice();
  writeLink();
  if (!$('picker').hidden) { renderChips(); renderResults(); $('picker-q').placeholder = t(L, state.pickerFor === 'from' ? 'chooseStart' : 'whereTo'); }
}

// ---- layout ---------------------------------------------------------------------------------

// The phone's sheet: 'min' (a line), 'mid' (the trip), 'open' (the trip and every step). Drag
// its handle up or down a stop, or tap it.
function sheetMode() {
  const sh = $('sheet');
  return sh.classList.contains('open') ? 'open' : sh.classList.contains('min') ? 'min' : 'mid';
}

function setSheet(m, from, before) {
  if (WIDE.matches) m = 'open';
  // the sheet brought back up (dragged, or its buttons) shuts the floor list it made room for
  if (m !== 'min' && $('floorbar').classList.contains('expanded')) {
    $('floorbar').classList.remove('expanded');
    $('floor-pill').setAttribute('aria-expanded', 'false');
    sheetBefore = null;
  }
  const sh = $('sheet'), was = before || sheetMode(), run = ++sheetRun;
  sheetMoving = !WIDE.matches;
  const settle = () => {
    if (run !== sheetRun) return;
    sheetMoving = false;
    sh.style.height = '';
    relayout();
    // the map's room changed: the route (or the step) back into what is left of it
    if (m !== was && state.route && !$('floorbar').classList.contains('expanded')) refit();
  };
  if (WIDE.matches) { sh.classList.add('open'); sh.classList.remove('min'); sh.style.height = ''; return; }
  // from the height it has now (mid-drag, mid-glide) to the new state's, eased
  const h0 = from !== undefined ? from : sh.getBoundingClientRect().height;
  const h1 = sheetHeight(m);
  sh.classList.toggle('open', m === 'open');
  sh.classList.toggle('min', m === 'min');
  labelList(m);
  sh.style.transition = 'none'; sh.style.height = `${h0}px`;
  void sh.offsetHeight;
  sh.style.transition = ''; sh.style.height = `${h1}px`;
  const done = e => { if (e && e.propertyName !== 'height') return; sh.removeEventListener('transitionend', done); settle(); };
  sh.addEventListener('transitionend', done);
  setTimeout(done, 450);   // no transition to end (no motion wanted, or no change of height)
}
let sheetRun = 0, sheetMoving = false;

// "All steps" while the list is closed, "Hide steps" while it is open. Open on a phone, the sheet
// covers the map, and its corner button takes it back down to the trip instead of clearing the
// trip: there, an × read as "close this" and threw the directions away (owner, 1 Nov).
function labelList(m = sheetMode()) {
  const open = m === 'open' && !WIDE.matches;
  $('btn-list').textContent = t(state.lang, open ? 'hideSteps' : 'allSteps');
  $('btn-list').setAttribute('aria-expanded', String(open));
  const swap = open !== !$('btn-down').hidden, hadFocus = document.activeElement === (open ? $('btn-end') : $('btn-down'));
  $('btn-down').hidden = !open;
  $('btn-end').hidden = open;
  if (swap && hadFocus) (open ? $('btn-down') : $('btn-end')).focus();
}

function refit() {
  const s = state.steps[state.current];
  if (s && s.focus && s.focus.length) map.fitBounds(box(s.focus, 8), { maxScale: 16 });
  else if (state.route && state.floor) fitRouteOn(state.floor);
}

// The sheet's height in a state, with what it holds now: measured, not guessed.
function sheetHeight(m) {
  const sh = $('sheet'), cls = sh.className, h = sh.style.height, tr = sh.style.transition;
  sh.style.transition = 'none'; sh.style.height = '';
  sh.classList.toggle('open', m === 'open'); sh.classList.toggle('min', m === 'min');
  const v = sh.getBoundingClientRect().height;
  sh.className = cls; sh.style.height = h;
  void sh.offsetHeight;
  sh.style.transition = tr;
  return v;
}

function toggleSheet() { setSheet(sheetMode() === 'mid' ? 'open' : 'mid'); }

// The sheet as one line, for when the map wants the room: the trip, or the question.
function renderMini() {
  const L = state.lang, r = state.route, m = $('mini');
  const name = p => shortName(placeTitle(p, L));
  m.textContent = r ? `${name(state.from)} → ${name(state.to)} · ${underMinute(r.seconds) ? fmtDist(r.metres, L) : fmtTime(r.seconds, L)}`
    : state.to ? `→ ${name(state.to)}` : t(L, 'whereTo');
}

// It moves like a sheet: it follows the finger, giving a little past the ends, and let go it
// glides to the nearest stop, or on to the next when flicked. A tap on the handle moves it a stop.
// A drag that starts anywhere on the sheet's fixed parts moves it too, as a phone's sheets do: the
// trip's header, From and To, Step-free, the buttons, a place's card (owner, 10 Nov 2026: the handle
// alone was hard to hit). There a tap stays a tap, a drag sideways is left alone, and the step list
// and a place's sides keep their scrolling.
const SHEET_HANDLE = '.grip, .mini';
const SHEET_DRAG = `${SHEET_HANDLE}, .trip-head, .trip, .opts, .go, .notice, .card-head, .card-actions`;
function sheetDrag() {
  const sh = $('sheet');
  let x0 = 0, y0 = null, h0 = 0, id = null, moved = false, trail = [], stops = null, before = null, handle = null, dragEnd = 0;
  const down = e => {
    if (WIDE.matches || e.button > 0 || y0 !== null) return;
    const at = e.target.closest(SHEET_DRAG);
    if (!at || !sh.contains(at)) return;
    handle = at.matches(SHEET_HANDLE) ? at : null;
    x0 = e.clientX; y0 = e.clientY; id = e.pointerId; moved = false; trail = [[performance.now(), e.clientY]];
    h0 = sh.getBoundingClientRect().height;
    // the handle holds the finger at once; elsewhere only once it is a drag, so a tap reaches its button
    if (handle) try { handle.setPointerCapture(id); } catch { /* the touch's own events still come */ }
  };
  const move = e => {
    if (e.pointerId !== id || y0 === null) return;
    trail.push([performance.now(), e.clientY]);
    if (trail.length > 6) trail.shift();
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!moved && !handle && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { y0 = null; id = null; return; }
    if (!moved && Math.abs(dy) > 5) {
      moved = true;
      if (!handle) try { sh.setPointerCapture(id); } catch { /* as above */ }
      stops = { min: sheetHeight('min'), mid: sheetHeight('mid'), open: sheetHeight('open') };
      before = sheetMode();
      // while dragged it holds everything it can show, so the finger uncovers it
      sheetRun++;
      sh.style.transition = 'none';
      sh.classList.add('open'); sh.classList.remove('min');
    }
    if (!moved) return;
    let h = h0 - dy;
    if (h > stops.open) h = stops.open + (h - stops.open) / 4;
    if (h < stops.min) h = stops.min - (stops.min - h) / 4;
    sh.style.height = `${h}px`;
  };
  // the drag ends on whichever comes first: iOS Safari does not always deliver pointerup to the
  // handle, so the touch's own end counts too
  const end = () => {
    if (y0 === null) return;
    y0 = null; id = null;
    if (!moved) { if (handle) { if (sheetMode() === 'min') setSheet('mid'); else toggleSheet(); } return; }
    dragEnd = performance.now();
    const h = sh.getBoundingClientRect().height;
    const [t1, p1] = trail[0], [t2, p2] = trail[trail.length - 1];
    const v = t2 > t1 ? (p1 - p2) / (t2 - t1) : 0;   // px per ms; growing is positive
    const rest = h + v * 200;                        // where a flick would carry it
    const m = ['min', 'mid', 'open'].reduce((a, b) => (Math.abs(stops[b] - rest) < Math.abs(stops[a] - rest) ? b : a));
    setSheet(m, h, before);
  };
  const up = e => { if (e.pointerId === id) end(); };
  sh.addEventListener('pointerdown', down);
  sh.addEventListener('pointermove', move);
  sh.addEventListener('pointerup', up);
  sh.addEventListener('pointercancel', up);
  sh.addEventListener('lostpointercapture', up);
  sh.addEventListener('touchend', end);
  sh.addEventListener('touchcancel', end);
  // (a drag that ends over a button is not a tap on it: the click a mouse sends straight after is dropped)
  sh.addEventListener('click', e => { if (e.detail > 0 && performance.now() - dragEnd < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
  // the keyboard's Enter or Space on the handle (a click with no pointer behind it)
  for (const el of [$('grip'), $('mini')]) {
    el.addEventListener('click', e => { if (e.detail === 0) { if (sheetMode() === 'min') setSheet('mid'); else toggleSheet(); } });
  }
}

// The map keeps what matters out from under the sheet and the floor buttons.
function relayout() {
  const wide = WIDE.matches, sheet = $('sheet'), stage = $('stage');
  const sh = wide ? 0 : sheet.getBoundingClientRect().height;
  const stageH = stage.getBoundingClientRect().height;
  const bottom = wide ? 0 : Math.max(0, Math.min(sh, stageH - 120));
  if (map) map.setInset({ top: 12, right: 82, bottom: bottom + 8, left: 8 });
  $('floorbar').style.setProperty('--floorbar-max', `${Math.max(96, stageH - bottom - 20)}px`);
  fitFloorbar();
}

// Every floor if they fit beside the sheet, else the pill: measured with the whole list showing,
// whenever the room or the list changes (the list is drawn after the first layout).
function fitFloorbar() {
  const fb = $('floorbar');
  // while the sheet glides its height says nothing yet: the column is decided when it settles
  // (deciding mid-glide flashed the whole list between two pills)
  if (fb.classList.contains('expanded') || sheetMoving) return;
  fb.classList.remove('compact');
  // step by step on a phone the floors change by themselves: the pill leaves the route in view
  fb.classList.toggle('compact', fb.scrollHeight > fb.clientHeight + 1 || (state.current >= 0 && !WIDE.matches));
}

function layout() {
  new ResizeObserver(relayout).observe($('sheet'));
  new ResizeObserver(relayout).observe($('stage'));
  WIDE.addEventListener('change', () => { setSheet(WIDE.matches ? 'open' : 'mid'); applyLang(); if (campus) render(); relayout(); });
  // turned sideways and back, step by step: the step framed again once the screen has settled
  // (the map kept the old framing, the start under the floor buttons)
  matchMedia('(orientation: portrait)').addEventListener('change', () => {
    if (state.current >= 0) setTimeout(() => { relayout(); refit(); }, 400);
  });
  if (WIDE.matches) setSheet('open');
  relayout();
}

// ---- wiring ---------------------------------------------------------------------------------

function wire() {
  $('btn-lang').addEventListener('click', openLanguages);
  $('gate-close').addEventListener('click', closeLanguages);
  $('end-from').addEventListener('click', () => whenReady(() => openPicker('from')));
  $('end-to').addEventListener('click', () => whenReady(() => openPicker('to')));
  $('btn-swap').addEventListener('click', () => {
    if (!campus) return;
    // the door this phone scanned stays known: swapped back, it is "You are here" again
    const scanned = session.get('here') || (state.here && state.from ? state.from.key : null);
    const [from, to] = [state.to, state.from];
    // (the trip changes once the new start is known: a side question cancelled leaves it as it was, where it had
    // said KB-305 to KB-305 over the old route's steps, the final bug check, 6 Nov)
    const go = () => {
      state.to = asDest(to);
      state.stops = state.to ? [state.to] : [];
      state.stopTotal = state.stops.length;
      state.here = !!state.from && state.from.key === scanned; session.set('here', scanned); compute();
    };
    if (from) setFrom(from, go); else { state.from = null; go(); }
  });
  $('opt-stepfree').addEventListener('change', e => {
    state.stepFree = e.target.checked;
    store.set('stepfree', state.stepFree ? '1' : '0');
    if (campus) compute({ fit: false });
  });
  $('btn-fit').addEventListener('click', () => map && map.showFloor());
  $('floor-pill').addEventListener('click', openFloorList);
  sheetDrag();
  // opens the list of steps, and closes it again (a review found it only opened)
  $('btn-list').addEventListener('click', () => setSheet(sheetMode() === 'open' ? 'mid' : 'open'));
  $('btn-start').addEventListener('click', () => focusStep(0));
  $('btn-next').addEventListener('click', nextStop);
  $('btn-share').addEventListener('click', () => (WIDE.matches && !SIDEWAYS.matches ? openShare() : shareLinkNow()));
  $('btn-end').addEventListener('click', endTrip);
  $('btn-down').addEventListener('click', () => setSheet('mid'));
  $('share-close').addEventListener('click', closeShare);
  $('share').addEventListener('click', e => { if (e.target === $('share')) closeShare(); });
  $('share-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareLink()); $('share-copy').textContent = t(state.lang, 'copied'); }
    catch { /* no clipboard (an old browser, or not https): the QR code is still there */ }
  });
  $('share-native').addEventListener('click', () => {
    navigator.share({ title: document.title, url: shareLink() }).catch(() => { /* closed without sharing */ });
  });
  $('step-prev').addEventListener('click', () => focusStep(state.current - 1));
  $('step-next').addEventListener('click', () => { store.set('stepsSeen', '1'); focusStep(state.current + 1); });
  $('step-exit').addEventListener('click', () => closeLayer('steps'));
  $('step-done').addEventListener('click', () => closeLayer('steps'));
  $('notice-x').addEventListener('click', () => { state.mapPick = null; notice(null); });
  $('summary').addEventListener('click', toggleSheet);
  if (hist === history) addEventListener('popstate', onBack);
  $('card-close').addEventListener('click', () => { if (state.sides) { cancelSides(); return; } state.pick = null; setMarks(); render(); });
  $('card-back').addEventListener('click', () => { state.pick = null; setMarks(); render(); fitRouteOn(state.floor); });
  $('card-to').addEventListener('click', () => {
    const p = state.pick; state.pick = null; state.to = p; state.stops = [p]; state.stopTotal = 1;
    if (state.from) compute(); else { setMarks(); render(); map.setRoute(drawn()); writeLink(); tripEntry(); openPicker('from'); }
  });
  $('card-from').addEventListener('click', () => {
    const p = state.pick; state.pick = null;
    setFrom(p, () => { if (state.to) compute(); else { setMarks(); render(); map.setRoute(drawn()); writeLink(); openPicker('to'); } });
  });
  $('picker-back').addEventListener('click', () => closePicker());
  $('picker-clear').addEventListener('click', () => { $('picker-q').value = ''; $('picker-clear').hidden = true; renderResults(); $('picker-q').focus(); });
  $('picker-q').addEventListener('input', () => {
    state.chip = null;
    $('picker-clear').hidden = !$('picker-q').value;
    renderChips(); renderResults();
  });
  $('picker-q').addEventListener('keydown', e => {
    const n = state.shown.length;
    if (e.key === 'Escape') { closePicker(); return; }  // (the document's own Escape handler is skipped below)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      const down = e.key === 'ArrowDown';
      state.active = state.active < 0 ? (down ? 0 : n - 1) : (state.active + (down ? 1 : n - 1)) % n;
      [...$('results').querySelectorAll('.result:not(.result-pickmap)')].forEach((el, i) => {
        el.classList.toggle('active', i === state.active);
        el.setAttribute('aria-selected', String(i === state.active));
        if (i === state.active) el.scrollIntoView({ block: 'nearest' });
      });
      $('picker-q').setAttribute('aria-activedescendant', `result-${state.active}`);
    }
    if (e.key === 'Enter') { e.preventDefault(); choose(state.shown[Math.max(0, state.active)]); }
  });
  document.addEventListener('keydown', trapFocus);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.target === $('picker-q')) return;
    if (gateMode === 'pick') closeLanguages();
    else if (gateMode) return;
    else if (!$('share').hidden) closeShare();
    else if (!$('picker').hidden) closePicker();
    else if (state.layer === 'steps') closeLayer('steps');
  });
}

// for the console, and for checking the app in a browser: window.cisMap.state, .map(), .router()
window.cisMap = { state, map: () => map, router: () => router, places: () => places, campus: () => campus };

// Who a toilet is for, as a word: "Girls", "成人" (i18n's capGirls, capAdults, ...).
function toiletWord(k, L) { return t(L, 'cap' + k[0].toUpperCase() + k.slice(1)); }
// "girls", "women and men", "girls, boys and women"
function joinAnd(list, L) {
  return list.length < 2 ? list.join('') : list.slice(0, -1).join(t(L, 'listSep')) + t(L, 'and') + list[list.length - 1];
}

// A room code never breaks across two lines ("（TT-" / "207）"), brackets and all.
function whole(html) {
  // (in every language, a word and its number: "Niveau 4", "Escalier 7", "நிலை 4", "4階", "3층")
  return html.replace(/[（(]?\b[A-Z]{1,5}-?\d{2,4}(?:-\d+)?\b[）)]?|\b(?:Level|Stairs|TT) \d+\b|楼梯 ?\d+|\d+ ?楼|[㐀-鿿]{1,4}·[㐀-鿿]{1,6}|[\p{L}\p{M}]{2,} \d{1,2}(?![\d\p{L}])|[㐀-鿿぀-ヿ가-힣]{1,4}\d{1,2}(?!\d)|\d{1,2} ?[階층樓]/gu,
    m => `<span class="nobr">${m}</span>`);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
