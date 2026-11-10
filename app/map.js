// The map: one level at a time, drawn from the map's own shapes, with the route on top. A level
// is a floor and, where the two wings meet on it, the other wing's floor (floors.js `partners`):
// L2 and Toh Tuck 2 together, the bridge between them, so the walk across is one walk. The floor
// you are on is the one named in the corner; tap the other wing, or pan over to it, and it is.
//
// There is no picture behind it. Corridors are white, and a room's colour says what it is for:
// the places people look for carry a colour (food orange, care pink, toilets teal, halls blue,
// the library lavender, labs and studios gold) while the plain classrooms, the bulk of every
// floor, stay a quiet stone so the others stand out; back rooms and lifts are grey, stairs slate.
// The real things the mapping recorded (voids, planters, courts, decks) are drawn as what they
// are. Everything is in metres (app/floors.js); the camera turns metres into screen pixels.

import { shortName, t, nameIn, fontFor } from './i18n.js';
import { inside } from './floors.js';

// the lettering: the brand's font, then the script's own (i18n.js fontFor); English's until a language is set
const FONT = fontFor('en');

// Two palettes, the phone's light or dark setting choosing (MapView watches it). The dark one is
// the same code, not an inversion: corridors a step above the ground, rooms in muted versions of
// their colours, stairs light so they still stand out, labels with a dark halo. Walls are 3:1 on the
// corridors in both (WCAG AA for a graphic you need: they washed out in the sun at 1.6:1, 3 Nov 2026),
// and the stairs two steps from the walls: dark with white treads in light, light with a dark icon in dark.
const LIGHT = {
  ground: '#E6E9EC', wall: '#8895A4', floor: '#FFFFFF', line: '#B3BAC3',
  room: '#F3EFE6', special: '#FAEBC4', library: '#E7DEF4', hall: '#D8E5F7', pool: '#C4E4F5',
  // (care a cool pink: the warm rose it was, #FADADE, was the destination's own tint all but exactly, delta E 3.6,
  // and the nurse's room by a route read as where it went, 6 Nov; now 8 from it, and 7.5 from the library's lavender)
  food: '#FCDFC7', care: '#F8D9EA', office: '#E4E8EF', toilet: '#D0ECEA', service: '#E1E4E8',
  outdoor: '#E1EED7', lift: '#D3DAE3', blank: '#E4E7EA', drop: '#E1EED7', bus: '#E1EED7', entrance: '#F3EFE6',
  stair: '#5A636D', stairIcon: '#FFFFFF', tread: 'rgba(255,255,255,0.24)',
  text: '#3D3935', soft: '#6B6662', faint: '#736D68', onDark: '#FFFFFF',
  red: '#DA291C', redTint: '#FBDDD9', blue: '#0057B8', blueTint: '#DCE6F3',
  pick: 'rgba(38,43,49,0.10)',
  halo: 'rgba(255,255,255,0.92)', casing: 'rgba(255,255,255,0.95)', dash: 'rgba(255,255,255,0.55)',
  toiletIcon: '#2F8584', steps: 'rgba(255,255,255,0.35)', courtLine: 'rgba(255,255,255,0.9)', hatch: 'rgba(120,130,142,0.45)',
  marker: '#FFFFFF', startHalo: 'rgba(0,87,184,0.18)', markerRing: '#FFFFFF',
  staffTint: 'rgba(196,72,58,0.07)', staffLine: 'rgba(196,72,58,0.26)', staffText: '#A2372C',
};
const DARK = {
  ground: '#14171B', wall: '#697482', floor: '#262A30', line: '#4C535C',
  room: '#35332E', special: '#4A4129', library: '#3E3652', hall: '#2C3C53', pool: '#204659',
  food: '#4E3826', care: '#4E2F3C', office: '#333A43', toilet: '#244745', service: '#2E3339',
  outdoor: '#2E3E2A', lift: '#3B434D', blank: '#2C3137', drop: '#2E3E2A', bus: '#2E3E2A', entrance: '#35332E',
  stair: '#A3ADB8', stairIcon: '#14171B', tread: 'rgba(0,0,0,0.25)',
  text: '#ECEEF1', soft: '#B5BCC5', faint: '#9AA3AD', onDark: '#F2F4F6',
  red: '#F0574A', redTint: '#5A2723', blue: '#6E9BF2', blueTint: '#23344F',
  pick: 'rgba(255,255,255,0.10)',
  halo: 'rgba(20,23,27,0.92)', casing: 'rgba(20,23,27,0.95)', dash: 'rgba(255,255,255,0.6)',
  toiletIcon: '#86D0CC', steps: 'rgba(0,0,0,0.3)', courtLine: 'rgba(255,255,255,0.35)', hatch: 'rgba(160,170,182,0.32)',
  marker: '#2B3036', startHalo: 'rgba(110,155,242,0.25)', markerRing: '#14171B',
  staffTint: 'rgba(240,110,98,0.08)', staffLine: 'rgba(240,110,98,0.28)', staffText: '#F08A80',
};
export const C = { ...LIGHT };

const FEATURE_LIGHT = {
  void: { fill: '#F3F4F6', hatch: true, line: '#AAB2BB' },
  'light-well': { fill: '#F3F4F6', hatch: true, line: '#AAB2BB' },
  // open air (L5's courtyard between the KB and BT wings, a roof): outdoors, so the ground's grey, as
  // outside the building on every other floor (owner, 2 Nov: hatching is for a void inside it)
  'open-air': { fill: '#E6E9EC' },
  shaft: { fill: '#CBD1D7' }, service: { fill: '#D5DADF' }, store: { fill: '#DCE8EA' },
  'back-of-house': { fill: '#DCE0E5' }, counter: { fill: '#D0D6DC' }, fixture: { fill: '#D0D6DC' },
  'stair-flight': { fill: '#5A636D', treads: true, line: '#4B535C' },
  planter: { fill: '#BFDCAE', line: '#9BC487' }, garden: { fill: '#D6EACB' }, courtyard: { fill: '#EEF2EA' },
  parapet: { fill: '#9AA2AB' }, divider: { line: '#9AA2AB' },
  gate: { line: '#8D959E', dash: true }, ramp: { fill: '#EEF1F4', line: '#B8C0C8' },
  playground: { fill: '#F4F0E8' }, 'play-equipment': { fill: '#F1E9DA', line: '#D9C7A5' },
  court: { fill: '#D6E4F0', court: true },
  seating: { fill: '#EEF0F2' }, 'seating-bank': { fill: '#E1E5E9', treads: true, tiers: true },
  platform: { fill: '#E5E8EB', line: '#B8C0C8' }, deck: { fill: '#EFE4D4' },
  'bridge-deck': { fill: '#F6F7F9', line: '#B8C0C8' }, 'floor-marking': { line: '#E0C454', dash: true },
  walkway: { fill: '#F6F7F9', line: '#B8C0C8' }, road: { fill: '#D2D6DB', line: '#BDC3CA' },
  // a row of parking bays (the visitor car park under the field): the road's grey, a shade deeper
  parking: { fill: '#C7CCD2', line: '#B3B9C1' },
  crossing: { stripes: '#FFFFFF' },
  other: { fill: '#E3E6EA' },
};
const FEATURE_DARK = {
  void: { fill: '#1C2024', hatch: true, line: '#4A5058' },
  'light-well': { fill: '#1C2024', hatch: true, line: '#4A5058' },
  'open-air': { fill: '#14171B' },
  shaft: { fill: '#30363D' }, service: { fill: '#2E343A' }, store: { fill: '#2D4044' },
  'back-of-house': { fill: '#30353C' }, counter: { fill: '#353B42' }, fixture: { fill: '#353B42' },
  'stair-flight': { fill: '#A3ADB8', treads: true, line: '#8C96A1' },
  planter: { fill: '#2F4A2A', line: '#4E7044' }, garden: { fill: '#2A3D27' }, courtyard: { fill: '#252B24' },
  parapet: { fill: '#4A5058' }, divider: { line: '#5A616A' },
  gate: { line: '#6A727B', dash: true }, ramp: { fill: '#2A2F35', line: '#4A5058' },
  playground: { fill: '#2E2B25' }, 'play-equipment': { fill: '#37322A', line: '#5A4E3B' },
  court: { fill: '#24384A', court: true },
  seating: { fill: '#2A2F35' }, 'seating-bank': { fill: '#30363D', treads: true, tiers: true },
  platform: { fill: '#30363D', line: '#4A5058' }, deck: { fill: '#3A3326' },
  'bridge-deck': { fill: '#2A2F35', line: '#4A5058' }, 'floor-marking': { line: '#B39A3A', dash: true },
  walkway: { fill: '#2A2F35', line: '#4A5058' }, road: { fill: '#1E2227', line: '#30363D' },
  parking: { fill: '#181B1F', line: '#2B3036' },
  crossing: { stripes: 'rgba(255,255,255,0.32)' },
  other: { fill: '#2E3339' },
};
// A phone set to more contrast (iOS Increase Contrast, and the like): walls and outlines that still
// read in Singapore sun (the usual ones are 3:1 on the corridors; these 3.6:1 and more)
const MORE_LIGHT = { wall: '#7D8792', line: '#6E7782', ground: '#D3D8DE' };
const MORE_DARK = { wall: '#8A939D', line: '#9AA3AD', ground: '#0B0D10' };
let FEATURE = FEATURE_LIGHT, ROOM_FILL = {};

function applyTheme(dark) {
  Object.assign(C, dark ? DARK : LIGHT, MORE_MQ && MORE_MQ.matches ? (dark ? MORE_DARK : MORE_LIGHT) : {});
  FEATURE = dark ? FEATURE_DARK : FEATURE_LIGHT;
  ROOM_FILL = Object.fromEntries(['room', 'special', 'library', 'hall', 'pool', 'food', 'care', 'office', 'toilet',
    'service', 'outdoor', 'drop', 'bus', 'entrance', 'lift', 'blank', 'stair'].map(k => [k, C[k]]));
}
const DARK_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const MORE_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-contrast: more)') : null;
applyTheme(!!(DARK_MQ && DARK_MQ.matches));

// Small icons drawn on the map (24-unit boxes).
const ICON = {
  stair: new Path2D('M4 19h4v-4h4v-4h4V7h4V5h-6v4h-4v4H6v4H4z'),
  lift: new Path2D('M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5 3.5L9 10h6zm0 11l3-3.5H9z'),
  man: new Path2D('M7 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5.3 9h3.4c.8 0 1.3.6 1.3 1.3V15H8.8v5H5.2v-5H4v-4.7C4 9.6 4.5 9 5.3 9z'),
  woman: new Path2D('M17 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM15.6 9h2.8c.7 0 1.2.4 1.4 1l1.7 5.5H19V20h-4v-4.5h-2.5L14.2 10c.2-.6.7-1 1.4-1z'),
  toilet: new Path2D('M7 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM5.3 9h3.4c.8 0 1.3.6 1.3 1.3V15H8.8v5H5.2v-5H4v-4.7C4 9.6 4.5 9 5.3 9zM17 4.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM15.6 9h2.8c.7 0 1.2.4 1.4 1l1.7 5.5H19V20h-4v-4.5h-2.5L14.2 10c.2-.6.7-1 1.4-1z'),
  bridge: new Path2D('M2 15h20v2H2zm2-6c4 0 6 3 8 3s4-3 8-3v2c-3 0-5 3-8 3s-5-3-8-3z'),
  up: new Path2D('M12 5l6 7h-4v7h-4v-7H6z'),
  down: new Path2D('M12 19l-6-7h4V5h4v7h4z'),
};

// Words the campus's Chinese names are built from: a line break inside one reads as a typo.
const ZH_WORDS = ['实验室', '办公室', '工作室', '图书馆', '体育馆', '辅导室', '校长室', '副校长', '会议室', '音乐室',
  '练习室', '储藏室', '准备室', '健身中心', '观景廊', '咖啡厅', '食堂', '洗手间', '停车场', '游泳池', '泳池', '教室',
  '幼儿室', '美术室', '学习区', '剧院', '剧场', '连廊', '楼梯', '电梯', '接待处', '科学', '初级', '中学', '小学', '幼儿园',
  '机房', '网络', '舞蹈', '录音', '工作', '辅导', '行政', '财务', '设施', '保安', '体育', '艺术', '学部', '中心'];

// A toilet block's caption is by who each of its toilets is for (data/toilets_evac.json; the words
// are i18n's capGirls, capBoys, ...).
const MALE = new Set(['boys', 'men', 'adults', 'male', 'accessible']), FEMALE = new Set(['girls', 'women', 'adults', 'female', 'accessible']);

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const WALL_IN = 0.18;   // metres: the wall drawn inside a room's edge (two rooms side by side: 0.36 m)
const OUTER_WALL = 0.5; // metres: the stroke round the building's outline (a quarter of it outside, under the rest)

export class MapView {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.on = handlers;
    this.lang = 'en';
    this.font = FONT;
    this.floor = null;
    this.cam = { s: 3, x: 0, y: 0 };      // screen = metres * s + (x, y), in CSS pixels
    this.inset = { top: 0, right: 0, bottom: 0, left: 0 };
    this.route = null;                    // see setRoute
    this.marks = { from: null, to: null, pick: null };
    this.sides = [];   // a big place's sides while the app asks which one a trip starts at: {floor, x, y, n}
    this.fadeAt = 0;
    this.phase = 0;
    this.chips = [];
    this.textCache = new Map();
    this.hatch = this.makeHatch();
    this.staffHatch = this.makeHatch(true);
    this.zones = {};
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.gestures();
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => { this.textCache.clear(); this.redraw(); });
    const retheme = () => { applyTheme(!!(DARK_MQ && DARK_MQ.matches)); this.hatch = this.makeHatch(); this.staffHatch = this.makeHatch(true); this.redraw(); };
    if (DARK_MQ) DARK_MQ.addEventListener('change', retheme);
    if (MORE_MQ) MORE_MQ.addEventListener('change', retheme);
    document.addEventListener('visibilitychange', () => this.redraw());
  }

  // ---- state ------------------------------------------------------------------------------

  setLang(lang) { this.lang = lang; this.font = fontFor(lang); this.textCache.clear(); this.redraw(); }

  setFloor(floor, { fit = false, keepView = true } = {}) {
    const prev = this.floor;
    // the other wing's floor on this level is already on the screen: going to it keeps the view
    const along = prev && floor && (prev.building === floor.building || prev.partners.includes(floor));
    if (prev !== floor && !(prev && prev.partners.includes(floor))) this.fadeAt = performance.now();
    this.floor = floor;
    // a new level is framed whole, both wings (its own wing alone once left the other under the
    // floor buttons, the plan off to one side)
    if (fit || !along || !keepView) this.fitBounds(this.levelBox(floor), { animate: false, pad: 18 });
    this.redraw();
  }

  // What a level's overview frames: the floor's rooms and the other wing's on its level.
  levelBox(f = this.floor) {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const g of this.shown(f)) {
      const c = g.core || g.bounds;
      b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0); b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1);
    }
    return b;
  }

  // The floors drawn: the current one and the other wing's on its level, the current one last (on top).
  shown(f = this.floor) { return f ? [...f.partners, f] : []; }

  // The other wing's floor on this level becomes the current one; the view stays where it is.
  goFloor(g) {
    if (!g || g === this.floor) return;
    this.floor = g;
    this.redraw();
    if (this.on.floor) this.on.floor(g);
  }

  // After a pan: the floor under the middle of the view is the current one, when it is the other wing's.
  settleFloor() {
    const f = this.floor;
    if (!f || !f.partners.length) return;
    const v = this.visible(), [x, y] = this.toWorld((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2);
    if (f.onPlan(x, y)) return;
    this.goFloor(f.partners.find(g => g.onPlan(x, y)));
  }

  // Staff-only areas (data/zones_evac.json `staffOnly`), per floor: hatched and named on the map.
  setZones(doc) {
    this.zones = {};
    for (const a of (doc && doc.areas) || []) {
      const f = a.staffOnly && this.floors && this.floors[a.floor];
      if (!f) continue;
      // (moved as the floor's walls are, edges and all: by its corners alone, a box crossing one of the CAD's
      // corrections drew its edge as a slant across the floor, L4's admin wing by Finance; owner, 4 Nov 2026)
      const rings = [...(a.boxes || []).map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), ...(a.polygons || [])]
        .map(rg => f.mapRing(rg));
      // every ring one way round, so where two overlap the fill is their union
      const path = new Path2D();
      for (const rg of rings) {
        const area = rg.reduce((t, q, i) => { const n = rg[(i + 1) % rg.length]; return t + q[0] * n[1] - n[0] * q[1]; }, 0);
        const r = area < 0 ? [...rg].reverse() : rg;
        path.moveTo(r[0][0], r[0][1]); for (const [x, y] of r.slice(1)) path.lineTo(x, y); path.closePath();
      }
      // named in the middle of its biggest part
      const big = rings.map(rg => boxOf(rg)).sort((m, n) => (n.x1 - n.x0) * (n.y1 - n.y0) - (m.x1 - m.x0) * (m.y1 - m.y0))[0];
      (this.zones[a.floor] ||= []).push({ id: a.id, path, rings, lx: (big.x0 + big.x1) / 2, ly: (big.y0 + big.y1) / 2,
        lw: big.x1 - big.x0, lh: big.y1 - big.y0 });
    }
    this.redraw();
  }

  // Whether a point is in a staff-only area of the floor.
  staffOnly(f, x, y) {
    return (this.zones[f.id] || []).some(z => z.rings.some(rg => inside(rg, x, y)));
  }

  // route: {floors: {id: [[x, y], ...][]}, start: {floor, x, y}, end: {floor, x, y},
  //         changes: [{floor, x, y, toFloor, kind}]}, all in metres.
  setRoute(route) {
    this.route = route;
    // the line as drawn: straightened where the floor allows and rounded at every corner (the
    // engine's own line wanders between its waypoints); worked out once per route
    this.paths = {};
    for (const [id, legs] of Object.entries((route && route.floors) || {})) {
      const f = this.floors && this.floors[id];
      this.paths[id] = legs.map(L => smoothLine(L, f));
    }
    this.focusLine = this.focus ? this.alongRoute(this.focus) : null;
    this.redraw();
  }

  // The floors by id, for the smoothing's look at the walls (main.js hands them over).
  setFloors(byId) { this.floors = byId; }

  // Rooms to tint: {from, to, pick} each {floor, room} or null.
  setMarks(marks) { Object.assign(this.marks, marks); this.redraw(); }
  setSides(list) { this.sides = list || []; this.redraw(); }

  // Step by step: how many of the route's floor changes are behind you (their chips go).
  setPassed(n) { if (this.passed !== n) { this.passed = n; this.redraw(); } }

  // The stretch of route the current step is about, drawn darker: {floor, points} or null.
  setFocus(focus) {
    this.focus = focus;
    const a = focus ? this.alongRoute(focus) : null;
    this.focusLine = a && a.line;
    this.focusAt = a ? { floor: focus.floor, k: a.k, s0: a.s0, s1: a.s1 } : null;
    this.redraw();
  }

  // A step's stretch as part of the line drawn: from where its start falls on the smoothed route to
  // where its end does, so it follows the same curves and stops where the turn is.
  alongRoute(focus) {
    const legs = this.paths && this.paths[focus.floor];
    const F = focus.points;
    if (!legs || !legs.length || !F || F.length < 2) return null;
    let best = null;
    legs.forEach((line, k) => {
      const cum = cumulative(line);
      const a = nearestOn(line, cum, F[0]), b = nearestOn(line, cum, F[F.length - 1]);
      const cost = a.d + b.d;
      if (!best || cost < best.cost) best = { line, k, cum, a, b, cost };
    });
    const s0 = Math.min(best.a.s, best.b.s), s1 = Math.max(best.a.s, best.b.s);
    return s1 - s0 > 0.05 ? { line: sliceLine(best.line, best.cum, s0, s1), k: best.k, s0, s1 } : null;
  }

  setInset(inset) { this.inset = inset; }

  // ---- camera -----------------------------------------------------------------------------

  visible() {
    const i = this.inset;
    return { x0: i.left, y0: i.top, x1: this.w - i.right, y1: this.h - i.bottom };
  }

  fitBounds(b, { animate = true, pad = 28, maxScale } = {}) {
    const v = this.visible();
    const vw = Math.max(40, v.x1 - v.x0 - 2 * pad), vh = Math.max(40, v.y1 - v.y0 - 2 * pad);
    const bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
    let s = Math.min(vw / bw, vh / bh);
    s = Math.min(s, maxScale || this.maxScale());
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const target = { s, x: (v.x0 + v.x1) / 2 - cx * s, y: (v.y0 + v.y1) / 2 - cy * s };
    if (animate && !REDUCED) this.tween(target); else { this.cam = target; this.redraw(); }
  }

  // The level, whole: the floor and the other wing's beside it.
  showFloor() {
    if (!this.floor) return;
    this.fitBounds(this.levelBox(), { pad: 18 });
  }

  // What the camera may roam over: the floor and the other wing's on its level.
  roam() {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const g of this.shown()) {
      b.x0 = Math.min(b.x0, g.bounds.x0); b.y0 = Math.min(b.y0, g.bounds.y0);
      b.x1 = Math.max(b.x1, g.bounds.x1); b.y1 = Math.max(b.y1, g.bounds.y1);
    }
    return b;
  }

  fitScale() {
    if (!this.floor) return 1;
    const b = this.roam(), v = this.visible();
    return Math.min((v.x1 - v.x0) / (b.x1 - b.x0), (v.y1 - v.y0) / (b.y1 - b.y0));
  }
  minScale() { return this.fitScale() * 0.6; }
  maxScale() { return 60; }

  zoomAt(px, py, k) {
    const c = this.cam;
    const s = Math.max(this.minScale(), Math.min(this.maxScale(), c.s * k));
    const r = s / c.s;
    c.x = px - (px - c.x) * r; c.y = py - (py - c.y) * r; c.s = s;
    this.clamp(); this.redraw();
  }

  clamp() {
    if (!this.floor) return;
    const b = this.roam(), c = this.cam, v = this.visible();
    const mx = (b.x1 - b.x0) * 0.25, my = (b.y1 - b.y0) * 0.25;
    const cx = ((v.x0 + v.x1) / 2 - c.x) / c.s, cy = ((v.y0 + v.y1) / 2 - c.y) / c.s;
    const nx = Math.max(b.x0 - mx, Math.min(b.x1 + mx, cx)), ny = Math.max(b.y0 - my, Math.min(b.y1 + my, cy));
    c.x += (cx - nx) * c.s; c.y += (cy - ny) * c.s;
  }

  tween(target, ms = 420) {
    const from = { ...this.cam }, t0 = performance.now();
    this.anim = now => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // zoom in log space so a big change of scale does not lurch
      const s = Math.exp(Math.log(from.s) + (Math.log(target.s) - Math.log(from.s)) * e);
      const v = this.visible(), mx = (v.x0 + v.x1) / 2, my = (v.y0 + v.y1) / 2;
      const ca = (mx - from.x) / from.s, cb = (my - from.y) / from.s;
      const ta = (mx - target.x) / target.s, tb = (my - target.y) / target.s;
      const wx = ca + (ta - ca) * e, wy = cb + (tb - cb) * e;
      this.cam = { s, x: mx - wx * s, y: my - wy * s };
      if (k >= 1) { this.cam = { ...target }; this.anim = null; }
    };
    this.redraw();
  }

  toScreen(x, y) { return [x * this.cam.s + this.cam.x, y * this.cam.s + this.cam.y]; }
  toWorld(px, py) { return [(px - this.cam.x) / this.cam.s, (py - this.cam.y) / this.cam.s]; }

  // ---- input ------------------------------------------------------------------------------

  gestures() {
    const cv = this.canvas, pts = new Map();
    let pinch = null, tap = null, lastTap = null, vel = null, moved = false;
    const xy = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      const p = xy(e);
      pts.set(e.pointerId, p);
      this.anim = null; this.coast = null;
      if (pts.size === 1) { tap = { x: p[0], y: p[1], t: performance.now() }; moved = false; vel = { vx: 0, vy: 0, t: performance.now() }; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(b[0] - a[0], b[1] - a[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; tap = null; }
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = xy(e), q = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        const dx = p[0] - q[0], dy = p[1] - q[1];
        if (tap && Math.hypot(p[0] - tap.x, p[1] - tap.y) > 7) { moved = true; tap = null; }
        if (!moved) return;
        this.cam.x += dx; this.cam.y += dy; this.clamp();
        const now = performance.now(), dt = Math.max(1, now - vel.t);
        vel = { vx: 0.8 * dx / dt + 0.2 * vel.vx, vy: 0.8 * dy / dt + 0.2 * vel.vy, t: now };
        this.redraw();
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.cam.x += m[0] - pinch.m[0]; this.cam.y += m[1] - pinch.m[1];
        this.zoomAt(m[0], m[1], d / pinch.d);
        pinch = { d, m };
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      // the end of a pinch: the finger still down goes on dragging
      if (pts.size === 1) { moved = true; vel = { vx: 0, vy: 0, t: performance.now() }; }
      if (pts.size === 0 && tap && performance.now() - tap.t < 450) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
          this.zoomTo(tap.x, tap.y, 2); lastTap = null;
        } else { lastTap = { ...tap, t: now }; this.tapAt(tap.x, tap.y); }
      } else if (pts.size === 0 && moved) {
        const sp = vel && performance.now() - vel.t < 80 && !REDUCED ? Math.hypot(vel.vx, vel.vy) : 0;
        if (sp > 0.25) this.coastFrom(vel.vx, vel.vy); else this.settleFloor();
      }
      tap = null;
    };
    cv.addEventListener('pointerup', up);
    // (a touch the browser takes back, for a gesture of its own, is no tap: it chose a place, the final bug check, 6 Nov)
    cv.addEventListener('pointercancel', e => { tap = null; up(e); });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = xy(e);
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018) * (e.deltaMode === 1 ? 16 : 1));
      this.anim = null;
      this.zoomAt(x, y, k);
      clearTimeout(this.wheelEnd); this.wheelEnd = setTimeout(() => this.settleFloor(), 200);
    }, { passive: false });
    cv.addEventListener('keydown', e => {
      const v = this.visible(), cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, step = 60;
      const map = { '+': () => this.zoomAt(cx, cy, 1.3), '=': () => this.zoomAt(cx, cy, 1.3), '-': () => this.zoomAt(cx, cy, 1 / 1.3),
        ArrowLeft: () => { this.cam.x += step; }, ArrowRight: () => { this.cam.x -= step; },
        ArrowUp: () => { this.cam.y += step; }, ArrowDown: () => { this.cam.y -= step; } };
      if (map[e.key]) { e.preventDefault(); map[e.key](); this.clamp(); this.redraw(); this.settleFloor(); }
    });
  }

  zoomTo(px, py, k) {
    const c = this.cam, s = Math.max(this.minScale(), Math.min(this.maxScale(), c.s * k)), r = s / c.s;
    this.tween({ s, x: px - (px - c.x) * r, y: py - (py - c.y) * r }, 300);
  }

  coastFrom(vx, vy) {
    let last = performance.now();
    this.coast = now => {
      const dt = Math.min(40, now - last); last = now;
      this.cam.x += vx * dt; this.cam.y += vy * dt;
      const k = Math.pow(0.94, dt / 16); vx *= k; vy *= k;
      this.clamp();
      if (Math.hypot(vx, vy) < 0.02) { this.coast = null; this.settleFloor(); }
    };
    this.redraw();
  }

  tapAt(px, py) {
    for (const c of this.chips) {
      if (px >= c.x0 && px <= c.x1 && py >= c.y0 && py <= c.y1) { this.on.chip && this.on.chip(c.toFloor); return; }
    }
    const f = this.floor;
    if (!f) return;
    // the floor you are on first, then the other wing's on this level; a tap on that one goes to it
    const order = [f, ...f.partners];
    const pick = (g, id) => { this.goFloor(g); if (this.on.tap) this.on.tap(id, g); };
    // a named open space or a connector's door, within a finger's width
    let best = null, bd = 18;
    for (const g of order) for (const p of g.portals) {
      if (p.entranceOf || (p.room && p.type === 'room') || !g.mine(p.x, p.y) || (p.type === 'bridge' && g.bridgeArea(p.id))) continue;
      const [sx, sy] = this.toScreen(p.x, p.y), d = Math.hypot(sx - px, sy - py);
      if (d < bd) { bd = d; best = [g, p.id]; }
    }
    if (best) { pick(...best); return; }
    const [x, y] = this.toWorld(px, py);
    for (const g of order) {
      const r = g.roomAt(x, y);
      if (r && (r.portal || r.portalId)) { pick(g, r.portal ? r.portal.id : r.portalId); return; }
    }
    // a bridge, anywhere on it (on its deck, or the covered walkway's crossing): the bridge of the
    // floor you are on when it has that bridge's door, else of the floor the deck is drawn on
    for (const g of order) {
      const ft = g.features.find(q => q.bridge && g.mine(x, y) && x >= q.bbox.x0 && x <= q.bbox.x1 && y >= q.bbox.y0 && y <= q.bbox.y1 && inside(q.ring, x, y));
      if (ft) { pick(f.portalById.has(ft.bridge) ? f : g, ft.bridge); return; }
    }
    // a place drawn as a walkable area (a library, the canteen): anywhere in it
    for (const g of order) {
      const ft = g.mine(x, y) && g.features.find(q => q.place && x >= q.bbox.x0 && x <= q.bbox.x1 && y >= q.bbox.y0 && y <= q.bbox.y1 && inside(q.ring, x, y));
      if (ft) { pick(g, ft.place.id); return; }
    }
    if (!f.onPlan(x, y)) this.goFloor(f.partners.find(g => g.onPlan(x, y)));
    if (this.on.tap) this.on.tap(null, this.floor);
  }

  // ---- drawing ----------------------------------------------------------------------------

  resize() {
    const wrap = this.canvas.parentElement, dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const first = !this.w;
    const cx = this.w ? this.toWorld(this.w / 2, this.h / 2) : null;
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    if (!first && cx) { this.cam.x = w / 2 - cx[0] * this.cam.s; this.cam.y = h / 2 - cx[1] * this.cam.s; }
    this.redraw();
  }

  // The next frame, or a timer if frames do not come (a page in a pane that is not on screen gets
  // no animation frames, and would otherwise never finish a camera move).
  redraw() {
    if (this.frame) return;
    const go = now => {
      if (!this.frame) return;
      cancelAnimationFrame(this.frame.raf); clearTimeout(this.frame.tid);
      this.frame = 0;
      this.draw(now);
    };
    this.frame = { raf: requestAnimationFrame(go), tid: setTimeout(() => go(performance.now()), 120) };
  }

  draw(now) {
    if (this.anim) this.anim(now);
    if (this.coast) this.coast(now);
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, this.w, this.h);
    const f = this.floor;
    let busy = !!(this.anim || this.coast);
    if (f) {
      const level = this.shown(f);
      for (const g of level) this.drawFloor(g);
      if (level.length > 1) for (const g of level) this.drawDecks(g);
      for (const g of level) this.drawRoute(g, now);
      this.drawLabels(level);
      this.drawMarkers(level);
      const fade = Math.min(1, (now - this.fadeAt) / 220);
      if (fade < 1 && !REDUCED) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1 - fade; ctx.fillStyle = C.ground; ctx.fillRect(0, 0, this.w, this.h); ctx.globalAlpha = 1;
        busy = true;
      }
      if (this.route && level.some(g => this.route.floors[g.id]) && !REDUCED) busy = true;
    }
    if (busy && !document.hidden) this.redraw();
  }

  world(ctx) {
    const c = this.cam, d = this.dpr;
    ctx.setTransform(d * c.s, 0, 0, d * c.s, d * c.x, d * c.y);
  }

  drawFloor(f) {
    const ctx = this.ctx, s = this.cam.s, px = 1 / s;
    this.world(ctx);
    ctx.save();
    if (f.clipPath) ctx.clip(f.clipPath);
    // the walls: the floor's footprint (every gap under 3 m between its shapes closed), and every
    // outline thick, for the building's own edge; square at the corners, as walls are (round joins
    // put a bump on every corner and a bite where two met)
    if (f.footprint) { ctx.fillStyle = C.wall; ctx.fill(f.footprint); }
    // (out of doors there are no walls: round a road, a walkway, a garden, the footprint's edge -- simplified on a
    // 0.2 m grid -- showed as slivers of wall along every slanting kerb; cleared back to ground, under the building's
    // own walls, which come next)
    ctx.fillStyle = ctx.strokeStyle = C.ground; ctx.lineWidth = 0.6;
    for (const ft of f.features) if (ft.outdoor) { ctx.fill(ft.path); ctx.stroke(ft.path); }
    // (the building's own edge a little thicker than a wall inside it; 1.6 m, with the rooms short of their walls,
    // made an outside wall three to four times an inside one)
    ctx.lineJoin = 'miter'; ctx.miterLimit = 2;
    ctx.strokeStyle = C.wall; ctx.lineWidth = OUTER_WALL; ctx.stroke(f.outline);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // a leftover too thick to be a wall is blank space with walls round it, not a slab of wall
    if (f.pockets) { ctx.fillStyle = C.blank; ctx.fill(f.pockets); }
    if (f.ground) { ctx.fillStyle = C.ground; ctx.fill(f.ground); }
    ctx.fillStyle = C.floor; ctx.fill(f.walk);
    // each door's way through the wall: a metre wide, square to the room's wall, from the room out
    // as far as the portal (in the corridor), so it opens cleanly whatever angle the portal sits at
    ctx.fillStyle = C.floor;
    ctx.fill(this.doorWays(f));
    // "not a through route" areas are floor (the hole under one too; a little over, so no sliver shows)
    ctx.fillStyle = ctx.strokeStyle = C.floor; ctx.lineWidth = 0.6;
    for (const p of f.softFloor || []) { ctx.fill(p); ctx.stroke(p); }
    // floor that is staff only (L4's admin wing): tinted and hatched, the rooms on top
    for (const z of this.zones[f.id] || []) {
      ctx.save(); ctx.clip(z.path);
      this.staffHatch.setTransform(new DOMMatrix().scale(1 / (this.dpr * this.cam.s)));
      // (and a door's way through the wall, which showed as a white bar in the hatching -- but only where it
      // runs past the floor: filled over the floor as well, the tint and hatch went on twice, darker)
      const past = new Path2D(); past.rect(-1e6, -1e6, 2e6, 2e6); past.addPath(f.walk);
      for (const fill of [C.staffTint, this.staffHatch]) {
        ctx.fillStyle = fill; ctx.fill(f.walk);
        for (const p of f.softFloor || []) ctx.fill(p);
        ctx.save(); ctx.clip(this.doorWays(f)); ctx.fill(past, 'evenodd'); ctx.restore();
      }
      ctx.restore();
    }
    for (const ft of f.features) if (ft.walkable) this.paintFeature(ft, px);
    // the room the trip starts or ends in, and the one picked on the map: a place drawn as a
    // walkable area (a library) under the rooms in it, a room over the floor
    const tint = area => {
      for (const [k, fill] of [['pick', C.pick], ['from', C.blueTint], ['to', C.redTint]]) {
        const m = this.marks[k];
        if (m && m.floor === f && m.room && m.room.kind !== 'stair' && !!m.room.walkable === area) { ctx.fillStyle = fill; ctx.fill(m.room.blockPath || m.room.path); }
      }
    };
    tint(true);
    for (const r of f.rooms) {
      ctx.fillStyle = ROOM_FILL[r.kind] || C.room;
      ctx.fill(r.blockPath || r.path);
    }
    tint(false);
    for (const r of f.rooms) if (r.kind === 'stair') this.paintStair(r, px);
    // the rooms' outlines while the wall drawn inside them is too thin to show (zoomed out), fainter
    // when the floor is small on the screen; nearer, they stood in the wall as a second line
    if (WALL_IN * s < 1.5) {
      ctx.strokeStyle = C.line; ctx.lineWidth = px;
      ctx.globalAlpha = Math.max(0.45, Math.min(1, (s - 1.5) / 4));
      for (const r of f.rooms) if (r.kind !== 'stair') ctx.stroke(r.blockPath || r.path);
      ctx.globalAlpha = 1;
    }
    // a wall inside every room's edge: rooms drawn against each other (the theatre, its music room
    // and practice rooms) had only that hairline between them, where a room the sheet keeps apart
    // from the corridor has the gap for a wall. The doors cut it.
    ctx.save(); ctx.clip(f.roomEdges);
    ctx.strokeStyle = C.wall; ctx.lineWidth = 2 * WALL_IN; ctx.stroke(f.roomEdges);
    ctx.restore();
    // ...and the same band outside every edge of the walkable area, so a room's wall onto a corridor is as thick
    // as the wall between two rooms (owner, 4 Nov 2026: one wall thickness). Not over floor drawn beside the walkable
    // area (a bridge deck, an area marked "not a through route"); opened again at each door's way through.
    ctx.save(); for (const p of this.outside(f)) ctx.clip(p, 'evenodd');
    ctx.strokeStyle = C.wall; ctx.lineWidth = 2 * WALL_IN; ctx.stroke(f.walkEdge || f.walk);
    ctx.fillStyle = C.floor; ctx.fill(this.doorWays(f));
    ctx.restore();
    if (s > 5) this.paintDoors(f, px);
    for (const ft of f.features) if (!ft.walkable) this.paintFeature(ft, px);
    for (const [k, col] of [['pick', C.text], ['from', C.blue], ['to', C.red]]) {
      const m = this.marks[k];
      if (m && m.floor === f && m.room) { ctx.strokeStyle = col; ctx.lineWidth = 2 * px; ctx.stroke(m.room.blockPath || m.room.path); }
    }
    ctx.restore();
  }

  // A bridge's deck again, over both floors' walls: the other wing's floor, drawn after the deck's
  // own, walled its end where it meets the building. With its tint and outline when it is picked.
  drawDecks(f) {
    const decks = f.features.filter(ft => ft.kind === 'bridge-deck');
    if (!decks.length) return;
    const ctx = this.ctx, px = 1 / this.cam.s;
    this.world(ctx);
    ctx.save();
    if (f.clipPath) ctx.clip(f.clipPath);
    for (const ft of decks) {
      this.paintFeature(ft, px);
      for (const [k, fill, col] of [['pick', C.pick, C.text], ['from', C.blueTint, C.blue], ['to', C.redTint, C.red]]) {
        const m = this.marks[k];
        if (m && m.room === ft) { ctx.fillStyle = fill; ctx.fill(ft.path); ctx.strokeStyle = col; ctx.lineWidth = 2 * px; ctx.stroke(ft.path); }
      }
    }
    ctx.restore();
  }

  // Each door's way through the wall, as one path for the floor: a metre wide, square to the room's
  // wall, from the room out as far as the portal (in the corridor), so it opens cleanly whatever
  // angle the portal sits at.
  doorWays(f) {
    if (f.doorWayPath) return f.doorWayPath;
    const p = new Path2D();
    for (const d of f.doors) {
      if (d.via) continue;   // (a door into the room it is reached through: paintDoors opens it)
      let nx = -d.dy, ny = d.dx, out = (d.x - d.qx) * nx + (d.y - d.qy) * ny;
      if (out < 0) { nx = -nx; ny = -ny; out = -out; }
      const L = Math.min(2.5, Math.max(0.3, out)) + 0.05;
      const ax = d.qx - nx * 0.05, ay = d.qy - ny * 0.05, tx = d.dx * 0.5, ty = d.dy * 0.5;
      p.moveTo(ax - tx, ay - ty); p.lineTo(ax + tx, ay + ty);
      p.lineTo(ax + tx + nx * L, ay + ty + ny * L); p.lineTo(ax - tx + nx * L, ay - ty + ny * L); p.closePath();
    }
    return (f.doorWayPath = p);
  }

  // Everything but the floor, as two clips (even-odd) whose overlap is what's left: the walkable area cut out of a
  // sheet the size of the world, and the floor drawn beside it (an area marked "not a through route", a walkable
  // feature such as a bridge deck) cut out of another. Worked out once per floor.
  outside(f) {
    if (f.outsidePaths) return f.outsidePaths;
    const sheet = () => { const p = new Path2D(); p.rect(-1e5, -1e5, 2e5, 2e5); return p; };
    const a = sheet(), b = sheet();
    a.addPath(f.walk);
    for (const sp of f.softFloor || []) b.addPath(sp);
    for (const ft of f.features) if (ft.walkable || ft.outdoor) b.addPath(ft.path);
    // (and not out of doors: beside a road or a lawn the walkable area's edge is a kerb, not a wall)
    const c = sheet();
    if (f.ground) c.addPath(f.ground);
    return (f.outsidePaths = [a, b, c]);
  }

  // A door: a gap in the room's outline, a metre wide, where its portal meets it.
  paintDoors(f, px) {
    const ctx = this.ctx;
    ctx.lineCap = 'butt';
    for (const d of f.doors) {
      ctx.strokeStyle = d.room.kind === 'stair' ? C.stair : ROOM_FILL[d.room.kind] || C.room;
      // from just outside the room's edge (its hairline) in through the wall band inside it
      const w = Math.max(2.5 * px, WALL_IN + 2 * px), o = w / 2 - 1.2 * px, cx = d.qx + d.ix * o, cy = d.qy + d.iy * o;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(cx - 0.45 * d.dx, cy - 0.45 * d.dy); ctx.lineTo(cx + 0.45 * d.dx, cy + 0.45 * d.dy); ctx.stroke();
      if (d.via) {
        // a door into the room it is reached through: on through the wall between them and that
        // room's own wall band, in its colour
        const v = d.gap + WALL_IN + 2 * px, ox = d.qx - d.ix * (v / 2 - 1.2 * px), oy = d.qy - d.iy * (v / 2 - 1.2 * px);
        ctx.strokeStyle = ROOM_FILL[d.via.kind] || C.room; ctx.lineWidth = v;
        ctx.beginPath(); ctx.moveTo(ox - 0.45 * d.dx, oy - 0.45 * d.dy); ctx.lineTo(ox + 0.45 * d.dx, oy + 0.45 * d.dy); ctx.stroke();
      }
    }
    ctx.lineCap = 'round';
  }

  paintStair(r, px) {
    const ctx = this.ctx;
    ctx.fillStyle = C.stair; ctx.fill(r.path);
    if (this.cam.s < 7) return;
    ctx.strokeStyle = C.tread; ctx.lineWidth = px;
    this.treads(r, 0.32);
  }

  // A flight's treads: across it, the way it runs; a curved one's on its radii (floors.js arcOf;
  // straight lines across a curve ran along the way you walk at its ends).
  treads(sh, step) {
    const ctx = this.ctx, A = sh.arc;
    if (A) {
      ctx.save(); ctx.clip(sh.path); ctx.beginPath();
      const da = step / A.r1;
      for (let a = A.a0 + da / 2; a < A.a1; a += da) {
        ctx.moveTo(A.cx + Math.cos(a) * (A.r0 - 1), A.cy + Math.sin(a) * (A.r0 - 1));
        ctx.lineTo(A.cx + Math.cos(a) * (A.r1 + 1), A.cy + Math.sin(a) * (A.r1 + 1));
      }
      ctx.stroke(); ctx.restore();
      return;
    }
    this.inFrame(sh, (w, h) => {
      ctx.beginPath();
      for (let x = -w / 2 + 0.3; x < w / 2; x += step) { ctx.moveTo(x, -h / 2 - 1); ctx.lineTo(x, h / 2 + 1); }
      ctx.stroke();
    });
  }

  // Drawing in a shape's own frame (floors.js frameOf): x along its long side, y across it, from its
  // middle, clipped to it. Treads, a zebra's bars and a court's lines follow a turned shape (a Toh
  // Tuck stair, the upper field); square to the screen they once cut across it.
  inFrame(sh, draw) {
    const ctx = this.ctx, F = sh.frame;
    ctx.save(); ctx.clip(sh.path);
    ctx.translate(F.cx, F.cy); ctx.transform(F.ux, F.uy, -F.uy, F.ux, 0, 0);
    draw(F.w, F.h);
    ctx.restore();
  }

  paintFeature(ft, px) {
    // (clipped out of a room it only partly covers: floors.js clipOut)
    if (ft.clipOut) {
      const ctx = this.ctx, out = new Path2D(); out.rect(-1e5, -1e5, 2e5, 2e5); out.addPath(ft.clipOut);
      ctx.save(); ctx.clip(out, 'evenodd');
      const keep = ft.clipOut; ft.clipOut = null;
      try { this.paintFeature(ft, px); } finally { ft.clipOut = keep; ctx.restore(); }
      return;
    }
    // a place you walk through drawn whole (a library, the canteen, the gym): its room colour
    const ctx = this.ctx, st = FEATURE[ft.kind] || (ROOM_FILL[ft.kind] ? { fill: ROOM_FILL[ft.kind], line: C.line } : FEATURE.other);
    if (st.fill) { ctx.fillStyle = st.fill; ctx.fill(ft.path); }
    if (st.hatch) {
      this.hatch.setTransform(new DOMMatrix().scale(1 / (this.dpr * this.cam.s)));
      ctx.fillStyle = this.hatch; ctx.fill(ft.path);
    }
    if (st.treads && this.cam.s > 7) {
      ctx.strokeStyle = C.steps; ctx.lineWidth = px;
      if (st.tiers) {
        // a seating bank's rows run along it (across it, they read as a stair)
        this.inFrame(ft, (w, h) => {
          ctx.beginPath();
          for (let y = -h / 2 + 0.4; y < h / 2; y += 0.8) { ctx.moveTo(-w / 2 - 1, y); ctx.lineTo(w / 2 + 1, y); }
          ctx.stroke();
        });
      } else this.treads(ft, 0.4);
    }
    if (st.court) this.paintCourt(ft, px);
    if (st.stripes) {
      // a zebra crossing: half-metre bars a metre apart, along the road, so they are crossed
      this.inFrame(ft, (w, h) => {
        ctx.fillStyle = st.stripes;
        for (let x = -w / 2 + 0.25; x < w / 2; x += 1) ctx.fillRect(x, -h / 2 - 1, 0.5, h + 2);
      });
    }
    if (ft.kind === 'bridge-deck') {
      // edged in its own colour: the floor showed as a white line along it, and its outline drew a
      // line across the mouth where it meets the building
      ctx.strokeStyle = st.fill; ctx.lineWidth = Math.max(2.5 * px, 0.3); ctx.stroke(ft.path);
    } else if (ft.kind === 'divider' && ft.frame) {
      // a curtain across a hall (L4's gym, usually open): one dashed line along it, not a bar
      const F = ft.frame, dx = F.ux * F.w / 2, dy = F.uy * F.w / 2;
      ctx.strokeStyle = st.line; ctx.lineWidth = 1.5 * px; ctx.setLineDash([4 * px, 3 * px]);
      ctx.beginPath(); ctx.moveTo(F.cx - dx, F.cy - dy); ctx.lineTo(F.cx + dx, F.cy + dy); ctx.stroke();
      ctx.setLineDash([]);
    } else if (st.line) {
      ctx.strokeStyle = st.line; ctx.lineWidth = (st.dash ? 1.5 : 1) * px;
      if (st.dash) ctx.setLineDash([4 * px, 3 * px]);
      ctx.stroke(ft.path);
      ctx.setLineDash([]);
    }
  }

  // A court's markings, so the gym reads as a gym: boundary, halfway line, centre circle, all the way
  // the court runs (the upper field and Toh Tuck's gym are turned on the map).
  paintCourt(ft, px) {
    const ctx = this.ctx;
    if (ft.frame.h < 5) return;   // (L1's two basketball courts are 7 m wide on the sheet)
    this.inFrame(ft, (w, h) => {
      const m = h * 0.08;
      ctx.strokeStyle = C.courtLine; ctx.lineWidth = Math.max(px, 0.08);
      ctx.strokeRect(-w / 2 + m, -h / 2 + m, w - 2 * m, h - 2 * m);
      ctx.beginPath(); ctx.moveTo(0, -h / 2 + m); ctx.lineTo(0, h / 2 - m); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, h * 0.12, 0, Math.PI * 2); ctx.stroke();
    });
  }

  // Fine diagonal lines: a void's lean one way in grey, a staff-only floor's the other way in red.
  makeHatch(staff = false) {
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const g = c.getContext('2d');
    g.strokeStyle = staff ? C.staffLine : C.hatch; g.lineWidth = 1;
    if (staff) { g.translate(10, 0); g.scale(-1, 1); }
    g.beginPath(); g.moveTo(-2, 12); g.lineTo(12, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
    return this.ctx.createPattern(c, 'repeat');
  }

  drawRoute(f, now) {
    const R = this.route;
    // a bridge between two floors drawn together is walked on the screen too: its link is part of the line
    const linkIx = R ? (R.links || []).map((l, j) => j).filter(j => R.links[j].floor === f.id && this.shown().some(g => g.id === R.links[j].toFloor)) : [];
    const links = linkIx.map(j => R.links[j].points);
    if (!R || (!R.floors[f.id] && !links.length)) return;
    const ctx = this.ctx, s = this.cam.s, px = 1 / s;
    this.world(ctx);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const legs = [...((this.paths && this.paths[f.id]) || R.floors[f.id] || []), ...links];
    // the line's width follows the zoom, so it stays inside a corridor drawn small: about a metre
    // wide close up, never thinner than 4.5 px or wider than 7.5 (the brand guide's is 8)
    const w = Math.max(4.5, Math.min(7.5, 1.1 * s)), cw = w + Math.max(2.5, Math.min(4.5, 0.7 * s));
    // where the line leaves the plan (the bridge on Toh Tuck's side, which the plan does not
    // draw), a walkway under it
    const off = this.offPlan(f, legs);
    if (off.length) {
      ctx.beginPath(); for (const L of off) polyline(ctx, L);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = C.wall; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = C.floor; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.lineCap = 'round';
    }
    // Step by step, three strengths (owner): what is behind you faintest, what is still ahead
    // half faded, the step you are on in full. Each walk and bridge has its place in the trip's
    // order; the step's own walk is cut where the step starts and ends.
    const step = this.focus && this.focus.floor === f.id && this.focusLine;
    const trace = () => { ctx.beginPath(); for (const L of legs) polyline(ctx, L); };
    const draw = (lines, alpha) => {
      if (!lines.length) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); for (const L of lines) polyline(ctx, L); ctx.strokeStyle = C.casing; ctx.lineWidth = cw * px; ctx.stroke();
      ctx.beginPath(); for (const L of lines) polyline(ctx, L); ctx.strokeStyle = C.red; ctx.lineWidth = w * px; ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const at = this.focusAt, O = R.order, own = legs.slice(0, legs.length - links.length);
    const gc = at && O && O.legs[at.floor] ? O.legs[at.floor][at.k] : null;
    if (gc == null) draw(legs, this.focus ? 0.32 : 1);
    else {
      const behind = [], ahead = [];
      own.forEach((L, k) => {
        const gk = O.legs[f.id] ? O.legs[f.id][k] : null;
        if (gk == null || gk > gc) ahead.push(L);
        else if (gk < gc) behind.push(L);
        else {
          const cum = cumulative(L), len = cum[cum.length - 1];
          if (at.s0 > 0.05) behind.push(sliceLine(L, cum, 0, at.s0));
          if (len - at.s1 > 0.05) ahead.push(sliceLine(L, cum, at.s1, len));
        }
      });
      linkIx.forEach((j, i) => (O.links[j] < gc ? behind : ahead).push(links[i]));
      draw(behind, 0.22);
      draw(ahead, 0.55);
    }
    if (step) draw([step], 1);
    if (!REDUCED) this.phase = (now / 1000 * 26) % 18;
    if (step) { ctx.beginPath(); polyline(ctx, step); } else trace();
    ctx.strokeStyle = C.dash; ctx.lineWidth = Math.min(2, w / 3) * px;
    ctx.setLineDash([3 * px, 15 * px]); ctx.lineDashOffset = -this.phase * px; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // The stretches of the route on this floor that cross no part of the plan, longer than 2 m and
  // reaching half a metre onto it at each end; worked out once per route and floor.
  offPlan(f, legs) {
    const key = this.route;
    if (!this.offCache || this.offCache.key !== key) this.offCache = { key, floors: new Map() };
    const known = this.offCache.floors.get(f.id + ':' + legs.length);
    if (known) return known;
    const runs = [], level = this.shown();
    for (const line of legs) {
      const cum = cumulative(line), total = cum[cum.length - 1];
      let from = null;
      for (let d = 0; d <= total + 0.25; d += 0.25) {
        const [x, y] = sliceLine(line, cum, Math.min(d, total), Math.min(d, total))[0];
        const out = d <= total && !level.some(g => g.onPlan(x, y));
        if (out && from === null) from = d;
        if (!out && from !== null) {
          if (d - from > 2) runs.push(sliceLine(line, cum, Math.max(0, from - 0.5), Math.min(total, d + 0.25)));
          from = null;
        }
      }
    }
    this.offCache.floors.set(f.id + ':' + legs.length, runs);
    return runs;
  }

  drawMarkers(level) {
    const ctx = this.ctx, R = this.route, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.chips = [];
    // a big place's sides, while the app asks which one you are at: blue start dots, numbered as the
    // card's buttons
    ctx.save();
    for (const sd of this.sides) {
      if (!level.some(g => g.id === sd.floor.id)) continue;
      const [x, y] = this.toScreen(sd.x, sd.y);
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fillStyle = C.startHalo; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = C.blue; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = C.markerRing; ctx.stroke();
      ctx.fillStyle = C.markerRing; ctx.font = `700 12px ${this.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(sd.n), x, y + 0.5);
    }
    ctx.restore();
    if (!R) return;
    const on = new Set(level.map(g => g.id));
    // the start and the pin stay in sight: a chip that would cover one sits below its point
    const keep = [];
    if (R.start && on.has(R.start.floor)) { const [x, y] = this.toScreen(R.start.x, R.start.y); keep.push([x - 12, y - 12, x + 12, y + 12]); }
    if (R.end && on.has(R.end.floor)) { const [x, y] = this.toScreen(R.end.x, R.end.y); keep.push([x - 14, y - 40, x + 14, y + 2]); }
    R.changes.forEach((ch, i) => {
      // (a bridge onto a floor drawn alongside needs no chip: the line goes on across it; a change
      // already made, step by step, has none either: it once stayed up to the arrival)
      if (!on.has(ch.floor) || (ch.kind === 'bridge' && on.has(ch.toFloor)) || i < (this.passed || 0)) return;
      const [x, y] = this.toScreen(ch.x, ch.y), v = this.visible();
      // a stair or lift off the screen has no chip: kept on the screen, it pointed past the edge
      if (x < v.x0 - 8 || x > v.x1 + 8 || y < v.y0 - 8 || y > v.y1 + 8) return;
      this.drawChip(x, y, ch, keep);
    });
    if (R.start && on.has(R.start.floor)) {
      const [x, y] = this.toScreen(R.start.x, R.start.y);
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = C.startHalo; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = C.blue; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = C.markerRing; ctx.stroke();
    }
    if (R.end && on.has(R.end.floor)) {
      const [x, y] = this.toScreen(R.end.x, R.end.y);
      drawPin(ctx, x, y, C.red);
      if (R.endName) this.callout(R.endName(this.lang), x, y - 24);
    }
  }

  // Where the card with a name goes beside the pin's head: on the screen and clear of the floor buttons.
  calloutBox(text, x, y) {
    const ctx = this.ctx, v = this.visible(), font = `600 12.5px ${this.font}`;
    ctx.font = font;
    // a name too long for the screen beside the pin goes on two lines (on one it ran under the
    // floor buttons: "Admissions, Marketing and Communicat…")
    const room = Math.max(80, Math.min(v.x1 - v.x0 - 8, Math.max(x - v.x0, v.x1 - x) - 21) - 16);
    let lines = [text];
    if (ctx.measureText(text).width > room) { const two = this.wrap(text, font, room, this.lang); if (two.length === 2) lines = two; }
    ctx.font = font;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, h = 24 + 15 * (lines.length - 1);
    let bx = x + 17;
    if (bx + w > v.x1 - 4) bx = x - 17 - w;
    bx = Math.round(Math.max(v.x0 + 4, bx));
    return { bx, by: Math.round(y - h / 2), w, h, lines, font };
  }

  callout(text, x, y) {
    const ctx = this.ctx, { bx, by, w, h, lines, font } = this.calloutBox(text, x, y);
    ctx.font = font;
    ctx.save();
    ctx.shadowColor = 'rgba(20,24,30,0.22)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
    roundRect(ctx, bx, by, w, h, 8); ctx.fillStyle = C.marker; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1; ctx.strokeStyle = C.line; roundRect(ctx, bx + 0.5, by + 0.5, w - 1, h - 1, 8); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 12.5 + 15 * i));
  }

  // "Stairs 8 up to L5" where the route leaves this floor: tap it to follow the route there.
  drawChip(x, y, ch, keep = []) {
    const ctx = this.ctx, lang = this.lang;
    const text = ch.label(lang);
    ctx.font = `600 12.5px ${this.font}`;
    const tw = ctx.measureText(text).width, w = tw + 34, h = 26;
    // keep the chip clear of the floor buttons and the screen's edges, and of the lift or stair
    // it marks, so that still shows; its pointer stays put
    const v = this.visible(), avoid = [...keep], cf = (this.floors && this.floors[ch.floor]) || this.floor;
    const conn = cf && cf.rooms.find(r => (r.kind === 'lift' || r.kind === 'stair')
      && ch.x > r.bbox.x0 - 2 && ch.x < r.bbox.x1 + 2 && ch.y > r.bbox.y0 - 2 && ch.y < r.bbox.y1 + 2);
    if (conn) {
      // (a lift's block may be turned with its building: its corners' extremes)
      const xs = conn.block ? conn.block.map(p => p[0]) : null, ys = conn.block ? conn.block.map(p => p[1]) : null;
      const b = conn.block ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : conn.bbox;
      const [x0, y0] = this.toScreen(b.x0, b.y0), [x1, y1] = this.toScreen(b.x1, b.y1);
      avoid.push([x0, y0, x1, y1]);
    }
    const over = (bx, top) => avoid.some(b => bx < b[2] && bx + w > b[0] && top < b[3] && top + h > b[1]);
    const fits = (bx, by) => bx >= v.x0 + 4 && bx + w <= v.x1 - 4 && by >= v.y0 + 4 && by + h <= v.y1 - 4;
    const across = left => Math.round(Math.max(v.x0 + 4, Math.min(v.x1 - w - 4, left)));
    // above the point, below it, beside it (right, then left), then above or below reaching to
    // one side: the first that covers nothing it should not
    const spots = [
      [across(x - w / 2), Math.round(y - h - 14), 'above'], [across(x - w / 2), Math.round(y + 14), 'below'],
      [Math.round(x + 14), Math.round(y - h / 2), 'right'], [Math.round(x - 14 - w), Math.round(y - h / 2), 'left'],
      [across(x - 8), Math.round(y - h - 14), 'above'], [across(x - w + 8), Math.round(y - h - 14), 'above'],
      [across(x - 8), Math.round(y + 14), 'below'], [across(x - w + 8), Math.round(y + 14), 'below'],
    ];
    const [bx, by, side] = spots.find(([bx, by]) => fits(bx, by) && !over(bx, by)) || spots[0];
    ctx.save();
    ctx.shadowColor = 'rgba(20,24,30,0.22)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    roundRect(ctx, bx, by, w, h, 13); ctx.fillStyle = C.red; ctx.fill();
    ctx.restore();
    ctx.beginPath();
    if (side === 'right' || side === 'left') {
      const edge = side === 'right' ? bx + 0.5 : bx + w - 0.5, tip = side === 'right' ? bx - 7 : bx + w + 7;
      ctx.moveTo(edge, y - 6); ctx.lineTo(tip, y); ctx.lineTo(edge, y + 6);
    } else {
      const px_ = Math.max(bx + 12, Math.min(bx + w - 12, x));
      const edge = side === 'below' ? by + 0.5 : by + h - 0.5, tip = side === 'below' ? by - 7 : by + h + 7;
      ctx.moveTo(px_ - 6, edge); ctx.lineTo(x, tip); ctx.lineTo(px_ + 6, edge);
    }
    ctx.closePath(); ctx.fillStyle = C.red; ctx.fill();
    ctx.save(); ctx.translate(bx + 7, by + 4); ctx.scale(18 / 24, 18 / 24); ctx.fillStyle = '#fff';
    ctx.fill(ch.kind === 'up' ? ICON.up : ch.kind === 'down' ? ICON.down : ICON.bridge); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, bx + 27, by + h / 2 + 0.5);
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = C.marker; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = C.red; ctx.stroke();
    const pad = { above: [4, 4, 4, 10], below: [4, 10, 4, 4], right: [10, 4, 4, 4], left: [4, 4, 10, 4] }[side];
    this.chips.push({ x0: bx - pad[0], y0: by - pad[1], x1: bx + w + pad[2], y1: by + h + pad[3], toFloor: ch.toFloor });
  }

  // Labels sit inside their room when they fit, in screen pixels, so text never scales. The floor
  // you are on is named first, so where the two wings meet its names win.
  drawLabels(level) {
    const ctx = this.ctx, d = this.dpr, s = this.cam.s, lang = this.lang;
    const order = [level[level.length - 1], ...level.slice(0, -1)], on = new Set(level.map(g => g.id));
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const taken = [];
    const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const free = (...box) => !taken.some(r => hit(box, r)) && this.labelClear(box);
    const W = this.w, H = this.h, v = this.visible();
    // the markers keep their spot: the pin, the start, the floor-change chips (last frame's)
    const marks = [], R = this.route;
    if (R && R.end && on.has(R.end.floor)) {
      const [x, y] = this.toScreen(R.end.x, R.end.y); marks.push([x - 14, y - 40, x + 14, y + 2]);
      // and the card beside its head, which a room's name showed under (LKS-301 under "Secondary Library")
      if (R.endName) { const c = this.calloutBox(R.endName(this.lang), x, y - 24); marks.push([c.bx - 3, c.by - 3, c.bx + c.w + 3, c.by + c.h + 3]); }
    }
    if (R && R.start && on.has(R.start.floor)) { const [x, y] = this.toScreen(R.start.x, R.start.y); marks.push([x - 11, y - 11, x + 11, y + 11]); }
    for (const c of this.chips) marks.push([c.x0, c.y0, c.x1, c.y1]);
    if (this.on.bar) { const b = this.on.bar(); marks.push([b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4]); }
    taken.push(...marks);
    // the room you are in and the one you are going to always say which they are: inside when it
    // fits, else just outside, beside the room
    // (and, step by step, the landmark the step names: "Bear left by KB-109" with KB-109 unlabelled, a
    // review found)
    const M = this.marks, named = new Set([M.from, M.to, M.near].filter(m => m && on.has(m.floor.id) && m.room).map(m => m.room));
    // ... and they go first, so an outside name has its pick of the space; it then counts as a
    // marker, which the neighbours' names keep clear of
    const outside = (r, cx, cy, bw, bh) => {
      const nm = /^classroom$/i.test(r.name.en || '') ? '' : shortName(nameIn(r.name, lang));
      // the step's landmark in the step's own words ("KB-109", not its office's job title); "the" dropped
      const said = M.near && M.near.room === r && M.near.text ? M.near.text.replace(/^the\s+/i, '') : '';
      const txt = said || nm || r.code, font = `700 12px ${this.font}`;
      if (!txt) return;
      // on a little card: bare, an outside name sat on the next room and read as that room's (a
      // review found "School Nurse" over a lab beside BT-505)
      const w = this.width(txt, font) + 12, h = 20;
      const near = [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2];
      for (const [x, y] of [[cx, near[3] + 4 + h / 2], [cx, near[1] - 4 - h / 2], [near[2] + 5 + w / 2, cy], [near[0] - 5 - w / 2, cy]]) {
        const b = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        if (b[0] < v.x0 || b[2] > v.x1 || b[1] < v.y0 || b[3] > v.y1 || !free(...b)) continue;
        ctx.save();
        ctx.shadowColor = 'rgba(20,24,30,0.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
        roundRect(ctx, b[0], b[1], w, h, 6); ctx.fillStyle = C.marker; ctx.fill();
        ctx.restore();
        ctx.lineWidth = 1; ctx.strokeStyle = C.line; roundRect(ctx, b[0] + 0.5, b[1] + 0.5, w - 1, h - 1, 6); ctx.stroke();
        ctx.font = font; ctx.fillStyle = C.text; ctx.fillText(txt, x, y + 0.5);
        taken.push(b); marks.push(b);
        return;
      }
    };
    const all = order.flatMap(g => g.rooms.filter(r => g.mine(r.lx, r.ly)));
    const rooms = named.size ? [...all].sort((a, b) => named.has(b) - named.has(a)) : all;
    for (const r of rooms) {
      const spot = this.labelSpot(r);
      if (!spot) continue;
      const [cx, cy, bw, bh] = spot;
      if (cx + bw / 2 < 0 || cx - bw / 2 > W || cy + bh / 2 < 0 || cy - bh / 2 > H) continue;
      if (r.kind === 'stair') {
        // a stair the step names says its number even when its block is too small to: on a card
        if (!this.iconLabel(r, cx, cy, bw, bh, ICON.stair, (r.id.match(/\d+/) || [''])[0], C.stairIcon) && named.has(r)) outside(r, cx, cy, bw, bh);
        continue;
      }
      if (r.kind === 'lift') { this.iconLabel(r, cx, cy, bw, bh, ICON.lift, '', C.soft); continue; }
      if (r.kind === 'blank') continue;
      // a plain classroom's colour already says so: its code alone
      const name = /^classroom$/i.test(r.name.en || '') ? '' : shortName(nameIn(r.name, lang));
      const lines = [];
      const roomW = bw - 6, roomH = bh - 4;
      // the largest size the code fits at, down to 9 px: a code is worth more small than missing
      // (a size up on a big screen, read from further away)
      let size = (s > 14 ? 12.5 : 11.5) + (this.w >= 700 ? 1 : 0);
      if (r.code) while (size > 9 && this.width(r.code, `600 ${size}px ${this.font}`) > roomW) size -= 1;
      const codeFont = `600 ${size}px ${this.font}`, nameFont = `${Math.max(9, size - 0.5)}px ${this.font}`;
      if (r.kind === 'toilet' && bw > 16 && bh > 16) {
        const k = Math.min(bw, bh, 26) / 24;
        if (k > 0.55) {
          // the figures for who it is for (girls' toilets alone show the girl), and, when the room
          // is big enough on the screen, which: "Girls · Boys", "Adults"
          const has = r.has || [];
          const male = !has.length || has.some(h => MALE.has(h)), female = !has.length || has.some(h => FEMALE.has(h));
          // the caption on one line, or two, or one name a line, whichever the room has space for
          const names = has.map(h => t(lang, 'cap' + h[0].toUpperCase() + h.slice(1))), sep = t(lang, 'capSep');
          const capFont = `600 ${Math.max(9, size - 2)}px ${this.font}`, lh = Math.max(9, size - 2) + 2;
          const half = Math.ceil(names.length / 2);
          const ways = names.length ? [[names.join(sep)], [names.slice(0, half).join(sep), names.slice(half).join(sep)], names] : [];
          // (none where it would run under a marker: the pin at the door, say; nor off the edge of the screen,
          // where half of "Female students · Male students" read as something else)
          const clear = ls => { const w = Math.max(24 * k, ...ls.map(l => this.width(l, capFont))), h = 24 * k + 2 + ls.length * lh;
            return cx - w / 2 >= 1 && cx + w / 2 <= W - 1 && !marks.some(b => hit([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], b)); };
          const cap = ways.find(ls => ls.every(l => this.width(l, capFont) <= roomW) && 24 * k + 2 + ls.length * lh <= roomH && clear(ls)) || [];
          const capW = Math.max(0, ...cap.map(l => this.width(l, capFont))), capH = cap.length ? 2 + cap.length * lh : 0;
          const iy = cy - capH / 2;
          ctx.save(); ctx.translate(cx - 12 * k, iy - 12 * k); ctx.scale(k, k); ctx.fillStyle = C.toiletIcon;
          if (male && female) ctx.fill(ICON.toilet);
          else { ctx.translate(male ? 5 : -5, 0); ctx.fill(male ? ICON.man : ICON.woman); }
          ctx.restore();
          ctx.font = capFont; ctx.fillStyle = C.soft;
          cap.forEach((l, i) => ctx.fillText(l, cx, iy + 12 * k + 2 + lh * (i + 0.5)));
          taken.push([cx - Math.max(12 * k, capW / 2), iy - 12 * k, cx + Math.max(12 * k, capW / 2), iy + 12 * k + capH]);
          continue;
        }
      }
      if (r.code) {
        const cw = this.width(r.code, codeFont);
        if (cw > roomW || size + 2 > roomH) { if (named.has(r)) outside(r, cx, cy, bw, bh); continue; }
        const nameLines = name ? this.wrap(name, nameFont, roomW, lang) : [];
        if (nameLines.length && nameLines.length <= 2 && (size + 2) * (1 + nameLines.length) <= roomH) {
          nameLines.forEach(l => lines.push([l, nameFont, C.soft]));
        }
        lines.push([r.code, codeFont, C.text]);
      } else if (name) {
        const nl = this.wrap(name, codeFont, roomW, lang);
        if (!nl.length || nl.length > 2 || 14 * nl.length > roomH) { if (named.has(r)) outside(r, cx, cy, bw, bh); continue; }
        nl.forEach(l => lines.push([l, codeFont, C.text]));
      } else continue;
      const lh = size + 2, th = lines.length * lh;
      const tw = Math.max(...lines.map(([txt, font]) => this.width(txt, font)));
      const box = (x, y) => [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2];
      let lx = cx, mid = cy;
      // a marker on the name: the name moves to the nearest free side of it inside the room
      // (beside, below, above), or waits until the room is bigger on the screen
      const m = marks.find(b => hit(box(cx, cy), b));
      if (m) {
        // the nearest free side of the marker inside the room, for a label tw x th
        const sideOf = (tw, th) => {
          const bx = (x, y) => [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2];
          const inRoom = ([x, y]) => x - tw / 2 >= cx - bw / 2 + 1 && x + tw / 2 <= cx + bw / 2 - 1
            && y - th / 2 >= cy - bh / 2 + 1 && y + th / 2 <= cy + bh / 2 - 1;
          return [[m[2] + 2 + tw / 2, cy], [m[0] - 2 - tw / 2, cy], [cx, m[3] + 2 + th / 2], [cx, m[1] - 2 - th / 2]]
            .filter(q => inRoom(q) && !marks.some(b => hit(bx(...q), b)))
            .sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))[0];
        };
        let spot = sideOf(tw, th);
        // the room you are in or going to keeps its code inside it, smaller beside its marker if it
        // must (outside, it read as the next room's: a review found "KB-405" over KB-406)
        if (!spot && named.has(r) && r.code) {
          for (let z = Math.min(size, 11) - 1; z >= 8 && !spot; z--) {
            const f = `600 ${z}px ${this.font}`;
            spot = sideOf(this.width(r.code, f), z + 2);
            if (spot) { lines.length = 0; lines.push([r.code, f, C.text]); size = z; }
          }
          if (spot) {
            const [x, y] = spot, w = this.width(r.code, lines[0][1]);
            ctx.font = lines[0][1]; ctx.fillStyle = C.text; ctx.fillText(r.code, x, y);
            taken.push([x - w / 2, y - (size + 2) / 2, x + w / 2, y + (size + 2) / 2]);
            continue;
          }
        }
        if (!spot) { if (named.has(r)) outside(r, cx, cy, bw, bh); continue; }
        [lx, mid] = spot;
      }
      // half a name at the edge of the screen reads as a different name
      if (lx - tw / 2 < 1 || lx + tw / 2 > W - 1) continue;
      const top = mid - (lines.length - 1) * lh / 2;
      lines.forEach(([txt, font, col], i) => { ctx.font = font; ctx.fillStyle = col; ctx.fillText(txt, lx, top + i * lh); });
      taken.push(box(lx, mid));
    }
    // A bridge is an area you walk across: its marker and name sit on it, mid-deck (the covered
    // walkway's on its crossing), the name along the deck when it fits on it, else beside the marker.
    for (const g of order) for (const ft of g.features) {
      if (!ft.bridge || !g.mine(...ft.mid)) continue;
      const p = g.portalById.get(ft.bridge) || g.partners.map(q => q.portalById.get(ft.bridge)).find(Boolean);
      const [x, y] = this.toScreen(...ft.mid);
      if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = C.marker; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.save(); ctx.translate(x - 8, y - 8.5); ctx.scale(16 / 24, 16 / 24); ctx.fillStyle = C.soft; ctx.fill(ICON.bridge); ctx.restore();
      taken.push([x - 12, y - 12, x + 12, y + 12]);
      const txt = p ? shortName(nameIn(p.name, lang)) : '', font = `600 11.5px ${this.font}`, w = this.width(txt, font);
      if (!txt) continue;
      // along the deck, past the marker, reading left to right
      let [ux, uy] = ft.axis;
      if (ux < 0 || (ux === 0 && uy < 0)) { ux = -ux; uy = -uy; }
      const len = (ft.bbox.x1 - ft.bbox.x0) * Math.abs(ux) + (ft.bbox.y1 - ft.bbox.y0) * Math.abs(uy);
      if (len * s >= w + 40) {
        const off = 15 + w / 2, lx = x + ux * off, ly = y + uy * off, ang = Math.atan2(uy, ux);
        const hw = Math.abs(ux) * w / 2 + Math.abs(uy) * 7, hh = Math.abs(uy) * w / 2 + Math.abs(ux) * 7;
        const b = [lx - hw, ly - hh, lx + hw, ly + hh];
        if (b[0] >= v.x0 && b[2] <= v.x1 && free(...b)) {
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang);
          ctx.font = font; ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(txt, 0, 0);
          ctx.fillStyle = C.text; ctx.fillText(txt, 0, 0); ctx.restore();
          taken.push(b);
          continue;
        }
      }
      for (const lx of [x + 15 + w / 2, x - 15 - w / 2]) {
        const b = [lx - w / 2 - 2, y - 8, lx + w / 2 + 2, y + 8];
        if (b[0] < v.x0 || b[2] > v.x1 || !free(...b)) continue;
        ctx.font = font; ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(txt, lx, y);
        ctx.fillStyle = C.text; ctx.fillText(txt, lx, y);
        taken.push(b);
        break;
      }
    }
    // named open spaces (the canteen, a pod, the bus bay) and named features, where they fit
    const font = `600 11.5px ${this.font}`, ital = `italic 11px ${this.font}`;
    for (const p of order.flatMap(g => g.openPlaces.filter(q => g.mine(q.x, q.y)))) {
      const txt = shortName(nameIn(p.name, lang)) || p.code;
      if (!txt) continue;
      const [x, y] = this.toScreen(p.x, p.y);
      // its spot under the floor buttons, the sheet or off the screen: no name
      if (x < v.x0 || x > v.x1 || y < v.y0 + 14 || y > v.y1) continue;
      // a long name on two lines rather than one long one across whatever lies beside it
      const lines = this.width(txt, font) > 130 ? this.wrap(txt, font, 130, lang) : [txt];
      if (!lines.length || lines.length > 2) continue;
      const w = Math.max(...lines.map(l => this.width(l, font))), th = 14 * lines.length;
      if (w + 8 > v.x1 - v.x0) continue;
      // the name stays on the screen even when its spot is near the edge
      const lx = Math.max(v.x0 + w / 2 + 4, Math.min(v.x1 - w / 2 - 4, x));
      const box = [lx - w / 2 - 3, y - 4 - th, lx + w / 2 + 3, y - 4];
      // and a few pixels clear of other names, so two do not read as one
      if (!free(box[0] - 4, box[1] - 3, box[2] + 4, box[3] + 3)) continue;
      // and not written across rooms ("Admissions, Marketing and Communications" over the offices,
      // a review found): it waits until there is open floor for it
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      if (order.some(g => g.rooms.some(r => {
        if (r.kind === 'blank') return false;
        const [x0, y0] = this.toScreen(r.bbox.x0, r.bbox.y0), [x1, y1] = this.toScreen(r.bbox.x1, r.bbox.y1);
        return Math.max(0, Math.min(box[2], x1) - Math.max(box[0], x0)) * Math.max(0, Math.min(box[3], y1) - Math.max(box[1], y0)) > 0.35 * area;
      }))) continue;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = C.soft; ctx.fill();
      ctx.font = font; ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.fillStyle = C.text;
      lines.forEach((l, i) => { const ly = y - 11 - (lines.length - 1 - i) * 14; ctx.strokeText(l, lx, ly); ctx.fillText(l, lx, ly); });
      taken.push(box);
    }
    // staff-only floor says so, in the middle of it
    for (const z of order.flatMap(g => this.zones[g.id] || [])) {
      const txt = t(lang, 'staffOnly'), [x, y] = this.toScreen(z.lx, z.ly), w = this.width(txt, ital);
      if (w > z.lw * s + 20 || x - w / 2 < v.x0 || x + w / 2 > v.x1 || y < v.y0 || y > v.y1) continue;
      const box = [x - w / 2 - 2, y - 7, x + w / 2 + 2, y + 7];
      if (!free(...box)) continue;
      ctx.font = ital; ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(txt, x, y);
      ctx.fillStyle = C.staffText; ctx.fillText(txt, x, y);
      taken.push(box);
    }
    for (const ft of order.flatMap(g => g.features.filter(q => g.mine(q.lx, q.ly)))) {
      // a numbered stair's own flights (Stairs 5's curved ones round the atrium) are labelled as a stair
      // is, with its icon and number, not a name in italics
      const sn = ft.kind === 'stair-flight' && (String(ft.id).match(/^STAIR-(\d+)/) || [])[1];
      if (sn) {
        const [x, y] = this.toScreen(ft.lx, ft.ly), bw = ft.lw * s, bh = ft.lh * s;
        const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1 || !free(...box)) continue;
        this.iconLabel(ft, x, y, bw, bh, ICON.stair, sn, C.stairIcon);
        taken.push(box);
        continue;
      }
      if (!ft.label) continue;
      const txt = nameIn(ft.label, lang);
      if (!txt) continue;
      const [x, y] = this.toScreen(ft.lx, ft.ly);
      const w = this.width(txt, ital);
      if (w > ft.lw * s + 30 || 12 > ft.lh * s) continue;
      if (x - w / 2 < v.x0 || x + w / 2 > v.x1 || y < v.y0 || y > v.y1) continue;
      const box = [x - w / 2, y - 7, x + w / 2, y + 7];
      if (!free(...box)) continue;
      // a name a little wider than its feature may run onto the open floor beside it, not onto a room or a stair
      // (L1's "Servery", 1.8 m wide, ran across Stairs 9's treads); the room the feature stands in is its floor.
      // Tested on the rooms' own outlines: a slanted room's box takes in the road beside it (the north road's name went)
      const fw = ft.lw * s;
      if (w > fw) {
        const own = order.map(g => g.roomAt(ft.lx, ft.ly)).find(Boolean), pts = [];
        for (const [a, b] of [[box[0] + 2, x - fw / 2], [x + fw / 2, box[2] - 2]]) if (b > a)
          for (const px of [a, (a + b) / 2, b]) for (const py of [y - 4, y, y + 4]) pts.push(this.toWorld(px, py));
        if (pts.some(([wx, wy]) => order.some(g => g.rooms.some(r => r !== own && r.kind !== 'blank' &&
            wx >= r.bbox.x0 && wx <= r.bbox.x1 && wy >= r.bbox.y0 && wy <= r.bbox.y1 && inside(r.block || r.ring, wx, wy))))) continue;
      }
      ctx.font = ital; ctx.lineWidth = 3; ctx.strokeStyle = C.halo; ctx.strokeText(txt, x, y);
      ctx.fillStyle = C.faint; ctx.fillText(txt, x, y);
      taken.push(box);
    }
  }

  // Where a room's name goes, in screen pixels: [x, y] of its middle and the width and height it may
  // fill, or null for none. Here the plan seen flat from above: the room's label box, to scale. (The
  // model the homepage and the slideshow show, app/model.js, tilts the plan and raises its walls: it
  // answers with the floor its walls leave showing.)
  labelSpot(r) {
    const [x, y] = this.toScreen(r.lx, r.ly), s = this.cam.s;
    return [x, y, r.lw * s, r.lh * s];
  }
  // Whether anything stops a name going in this box, [x0, y0, x1, y1] on the screen, besides the
  // other names (the model's walls and edges do).
  labelClear() { return true; }

  // (true when the number is drawn with the icon)
  iconLabel(r, cx, cy, bw, bh, icon, num, col) {
    const ctx = this.ctx;
    const k = Math.min(bw * 0.8, bh * 0.8, 22) / 24;
    if (k < 0.45) return false;
    const font = `700 ${Math.round(10 + 3 * k)}px ${this.font}`;
    // the stair's number beside the icon when both fit; centred on what is drawn, so the icon
    // does not stay pushed aside once the number has gone
    const nw = num ? this.width(num, font) + 3 : 0, both = num && 24 * k + nw < bw - 2;
    const tw = 24 * k + (both ? nw : 0);
    ctx.save(); ctx.translate(cx - tw / 2, cy - 12 * k); ctx.scale(k, k); ctx.fillStyle = col; ctx.fill(icon); ctx.restore();
    if (both) {
      ctx.font = font; ctx.fillStyle = col; ctx.textAlign = 'left';
      ctx.fillText(num, cx - tw / 2 + 24 * k + 2, cy + 0.5); ctx.textAlign = 'center';
    }
    return !!both;
  }

  width(text, font) {
    const k = font + '|' + text;
    let w = this.textCache.get(k);
    if (w === undefined) { this.ctx.font = font; w = this.ctx.measureText(text).width; this.textCache.set(k, w); }
    return w;
  }

  // Up to three lines that fit the width: English breaks at spaces, Chinese and Japanese as wrapZh
  // says, Thai (no spaces between its words) between the words the browser finds in it.
  wrap(text, font, maxW, lang) {
    if (this.width(text, font) <= maxW) return [text];
    if (/[㐀-鿿぀-ヿ]/.test(text)) return this.wrapZh(text, font, maxW);
    const thai = /[\u0e00-\u0e7f]/.test(text);
    const parts = thai ? thaiWords(text) : text.split(/\s+/);
    const joiner = thai ? '' : ' ';
    const lines = [];
    let cur = '';
    for (const w of parts) {
      const next = cur ? cur + joiner + w : w;
      if (this.width(next, font) <= maxW) cur = next;
      else {
        if (!cur) return [];
        lines.push(cur); cur = w;
        if (this.width(cur, font) > maxW) return [];
      }
      if (lines.length > 2) return [];
    }
    if (cur) lines.push(cur);
    return lines.length > 3 ? [] : lines;
  }

  // Chinese may break between any two characters, but reads badly broken just anywhere: lines of
  // about equal length, never a character or a lone number on its own, a code or a number kept
  // whole, and the break after a part that ends a word where there is one (中学部 / 副校长室, not
  // 中学部副校 / 长室; 网络 / 机房, not 网络机 / 房).
  wrapZh(text, font, maxW) {
    const tokens = text.match(/\s*[A-Za-z0-9][A-Za-z0-9.\-]*|\s+|./gu) || [];
    const px = parseFloat((/([\d.]+)px/.exec(font) || [0, 12])[1]);
    const ok = s => s.trim().length >= 2 && !/^[\d\s.\-]+$/.test(s.trim()) && this.width(s.trim(), font) <= maxW;
    const ENDS = /[部学级心区处馆楼层及和与的·）)]$/;
    // where each break would fall in the text, and whether it splits one of the words names are made of
    const at = [0];
    for (const tk of tokens) at.push(at[at.length - 1] + tk.length);
    const inside = new Set();
    for (const w of ZH_WORDS) for (let k = text.indexOf(w); k >= 0; k = text.indexOf(w, k + 1)) for (let c = k + 1; c < k + w.length; c++) inside.add(c);
    const cost = (lines, cuts) => Math.max(...lines.map(l => this.width(l, font)))
      - px * 0.6 * lines.slice(0, -1).filter(l => ENDS.test(l.trim())).length
      + px * 3 * cuts.filter(i => inside.has(at[i])).length;
    const join = (a, b) => tokens.slice(a, b).join('').trim();
    let best = null, bc = Infinity;
    for (let i = 1; i < tokens.length; i++) {
      const two = [join(0, i), join(i, tokens.length)], c = cost(two, [i]);
      if (two.every(ok) && c < bc) { bc = c; best = two; }
    }
    if (best) return best;
    for (let i = 1; i < tokens.length; i++) for (let j = i + 1; j < tokens.length; j++) {
      const three = [join(0, i), join(i, j), join(j, tokens.length)], c = cost(three, [i, j]);
      if (three.every(ok) && c < bc) { bc = c; best = three; }
    }
    return best || [];
  }
}


// Thai written as it is, without spaces, cut into its words where the browser can (Intl.Segmenter),
// else at its spaces and between letter clusters.
const thaiSeg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
function thaiWords(text) {
  if (thaiSeg) {
    const out = [];
    for (const { segment } of thaiSeg.segment(text)) {
      if (/^\s+$/.test(segment)) { if (out.length) out[out.length - 1] += ' '; continue; }
      out.push(segment);
    }
    return out;
  }
  return text.match(/\S*\s|\S+$/g) || [''];   // (each piece with its space, as a split after it would: not with a lookbehind, which iOS before 16.4 cannot parse, and the file with it)
}

function boxOf(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

function polyline(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

// The route's line made to look drawn by hand: straightened, moved to the middle of the corridor,
// then every corner a real arc.
//
// Straightening is like Douglas-Peucker with two extra tests: a straight stretch replaces the
// line only if it stays within STRAIGHT metres of it (so it never takes another way than the
// directions say) and keeps CLEAR metres of open floor on either side (so it neither cuts a wall
// nor grazes one); the last metres at each end, a door or a stair on a wall, are let off the
// clearance. Then each stretch moves to the middle of its corridor (centre), and each corner
// becomes an arc of up to ARC metres, smaller where the stretches either side are short, so
// neighbouring arcs never overlap.
//
// Straightened on into the bends either side, a long straight run of the engine's line down a corridor tilted
// with them, and the line leaned against the walls it ran between: 0.7 m over 24 m down the east side of L4's
// gym, 1.1 m over 36 m past L3's Makerspace (6 Nov). So the line is also drawn with each such run kept where the
// engine has it (straighten's keepRuns), and of the two the one whose long stretches lean less is drawn.
const STRAIGHT = 1.6, CLEAR = 0.7, ENDS = 1.5, ARC = 3, HALF = 3.5, WOBBLE = 0.8, NEAR = 0.3, BACK = 2;
const LONG = 6, LEAN = 0.25, PARALLEL = 0.25;

function smoothLine(pts, floor) {
  if (pts.length < 3) return pts;
  if (!floor || !floor.walkable) return fillet(pts, ARC);
  const P = unhook(pts, floor);
  const plain = fillet(centre(straighten(P, floor), floor), ARC, floor);
  const runs = straighten(P, floor, true);
  if (!runs) return plain;
  const kept = fillet(centre(runs, floor), ARC, floor);
  return leanOf(kept, floor) < leanOf(plain, floor) - 0.05 ? kept : plain;
}

// How far a line leans in a straight corridor: of its stretches LONG metres or more whose walls are both within
// HALF metres and run parallel (the corridor as wide at a fifth, half and four fifths of the way), the most any
// one comes nearer one wall over those three points.
function leanOf(line, floor) {
  let most = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], L = Math.hypot(bx - ax, by - ay);
    if (L < LONG) continue;
    const [l, r] = gaps(floor, line[i - 1], line[i]);
    if (Math.max(...l, ...r) >= HALF) continue;
    const w = l.map((v, k) => v + r[k]);
    if (Math.max(...w) - Math.min(...w) > PARALLEL) continue;
    most = Math.max(most, Math.max(...l) - Math.min(...l));
  }
  return most;
}

// The open floor either side of a stretch (to HALF metres) at a fifth, half and four fifths of the way along it.
function gaps(floor, [ax, ay], [bx, by]) {
  const L = Math.hypot(bx - ax, by - ay) || 1e-9, nx = -(by - ay) / L, ny = (bx - ax) / L;
  const gap = (x, y, sx, sy) => { let d = 0; while (d < HALF && floor.walkable(x + sx * (d + 0.1), y + sy * (d + 0.1))) d += 0.1; return d; };
  const l = [], r = [];
  for (const t of [0.2, 0.5, 0.8]) {
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    l.push(gap(x, y, nx, ny)); r.push(gap(x, y, -nx, -ny));
  }
  return [l, r];
}

// A line that doubles back where it needn't, its way back within BACK metres of its way out across open
// floor, is drawn straight across. The engine's network makes a few: where a door joins the corridor's
// network behind the way the trip goes, a walk leaves the door the wrong way and turns back (L2's BT-210, 2 m;
// L5's Stairs 6, half a metre past the door and back). (tools/app/routelines.mjs finds any that are left.)
function unhook(pts, floor) {
  const P = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5);
    for (let k = 1; k <= n; k++) P.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  const cum = cumulative(P), ends = [P[0], P[P.length - 1]], d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // (within half a metre of the line's own ends, a door or a stair on a wall, the floor is not asked)
  const across = (p, q) => {
    const L = d(p, q);
    for (let t = 0; t <= L; t += 0.1) {
      const x = [p[0] + (q[0] - p[0]) * t / (L || 1), p[1] + (q[1] - p[1]) * t / (L || 1)];
      if (d(x, ends[0]) > 0.5 && d(x, ends[1]) > 0.5 && !floor.walkable(x[0], x[1])) return false;
    }
    return true;
  };
  const keep = [0];
  let cut = false;
  for (let i = 0; i < P.length - 1;) {
    let to = i + 1;
    for (let j = i + 2; j < P.length && cum[j] - cum[i] <= 25; j++) {
      if (d(P[i], P[j]) <= Math.min(BACK, 0.3 * (cum[j] - cum[i])) && across(P[i], P[j])) to = j;
    }
    if (to > i + 1) cut = true;
    keep.push(to);
    i = to;
  }
  return cut ? keep.map(k => P[k]) : pts;
}

// The engine's line keeps to the inside of every corner, so down a corridor it runs along one
// wall. Across each straight stretch the open floor either side is measured at three points; where
// both walls are within HALF metres (a corridor, not a hall), the stretch moves by half the
// difference. A corner goes where the moved stretches meet; the two ends stay at their door or
// stair, joined to the moved stretch a couple of metres on. A move that would take a stretch off
// the open floor is not made.
function centre(pts, floor) {
  const n = pts.length;
  if (n < 2) return pts;
  const gap = (x, y, nx, ny) => {
    let d = 0;
    while (d < HALF && floor.walkable(x + nx * (d + 0.5), y + ny * (d + 0.5))) d += 0.5;
    if (d >= HALF) return HALF;
    let lo = d, hi = d + 0.5;
    for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; if (floor.walkable(x + nx * m, y + ny * m)) lo = m; else hi = m; }
    return lo;
  };
  const seg = [];
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.hypot(bx - ax, by - ay);
    const ux = L ? (bx - ax) / L : 0, uy = L ? (by - ay) / L : 0;
    const o = [];
    if (L >= 3) for (const t of [0.25, 0.5, 0.75]) {
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      if (!floor.walkable(x, y)) continue;
      const l = gap(x, y, -uy, ux), r = gap(x, y, uy, -ux);
      if (l < HALF && r < HALF) o.push((l - r) / 2);
    }
    const off = o.length >= 2 ? o.sort((p, q) => p - q)[o.length >> 1] : 0;
    seg.push({ ux, uy, nx: -uy, ny: ux, L, off: Math.abs(off) < 0.15 ? 0 : off });
  }
  const shifted = (i, k) => [pts[k][0] + seg[i].nx * seg[i].off, pts[k][1] + seg[i].ny * seg[i].off];
  const build = () => {
    const out = [pts[0]], own = [];
    const push = (p, i) => { out.push(p); own.push(i); };
    if (seg[0].off) { const t = Math.min(2, seg[0].L / 3); push([pts[0][0] + seg[0].ux * t + seg[0].nx * seg[0].off, pts[0][1] + seg[0].uy * t + seg[0].ny * seg[0].off], 0); }
    for (let k = 1; k < n - 1; k++) {
      const a = seg[k - 1], b = seg[k], p = shifted(k - 1, k), q = shifted(k, k);
      const cross = a.ux * b.uy - a.uy * b.ux;
      if (Math.abs(cross) < 0.26) {
        // nearly straight on: one point halfway between the two moved stretches, so the line eases from the
        // one to the other along them. (It stepped across, square to the line, and rounded that drew an
        // S-shaped kink: 92 places over the campus, tools/app/routelines.mjs, 3 Nov.) A turn right back
        // still steps across: that is the foot of its U.
        if (a.ux * b.ux + a.uy * b.uy > 0) push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], k - 1);
        else { push(p, k - 1); if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.1) push(q, k); }
        continue;
      }
      // where line p + a.u t meets line q + b.u s
      const t = ((q[0] - p[0]) * b.uy - (q[1] - p[1]) * b.ux) / cross;
      const x = [p[0] + a.ux * t, p[1] + a.uy * t];
      if (Math.hypot(x[0] - pts[k][0], x[1] - pts[k][1]) > 2 * HALF) { push(p, k - 1); push(q, k); } else push(x, k - 1);
    }
    const last = seg[n - 2];
    if (last.off) { const t = Math.min(2, last.L / 3); push([pts[n - 1][0] - last.ux * t + last.nx * last.off, pts[n - 1][1] - last.uy * t + last.ny * last.off], n - 2); }
    push(pts[n - 1], n - 2);
    return { out, own };
  };
  const total = cumulative(pts)[n - 1];
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!seg.some(g => g.off)) return pts;
    const { out, own } = build(), cum = cumulative(out);
    let bad = -1;
    for (let i = 1; i < out.length && bad < 0; i++) {
      const [ax, ay] = out[i - 1], [bx, by] = out[i], L = Math.hypot(bx - ax, by - ay), g = seg[own[i - 1]];
      // (a piece running back against its own stretch: a moved corner fell past the next one, and the
      // line looped there, or ran past its end and back -- TT L4 and TT L3 by the lift, 3 Nov)
      if (L > 0.05 && (bx - ax) * g.ux + (by - ay) * g.uy < -0.1 * L) { bad = own[i - 1]; break; }
      for (let d = 0.2; d < L; d += 0.4) {
        const along = cum[i - 1] + d;
        if (along < ENDS || along > cum[cum.length - 1] - ENDS) continue;
        if (!floor.walkable(ax + (bx - ax) * d / L, ay + (by - ay) * d / L)) { bad = own[i - 1]; break; }
      }
    }
    if (bad < 0) return Math.abs(cum[cum.length - 1] - total) < 0.25 * total + 4 ? out : pts;
    if (seg[bad].off) seg[bad].off = 0;
    else for (const i of [bad - 1, bad + 1]) if (seg[i]) seg[i].off = 0;
  }
  return pts;
}

// (keepRuns: a straight run of LONG metres or more down a corridor, its walls parallel to it, keeps both its ends
// wherever one straight line would tilt it by more than LEAN metres over its length; null if the line has none)
function straighten(pts, floor, keepRuns = false) {
  const n = pts.length, cum = cumulative(pts), total = cum[n - 1];
  const open = (i, j) => {
    const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) return true;
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let d = 0.2; d < L; d += 0.4) {
      const along = cum[i] + (cum[j] - cum[i]) * d / L;
      if (along < ENDS || along > total - ENDS) continue;
      const x = ax + (bx - ax) * d / L, y = ay + (by - ay) * d / L;
      if (!floor.walkable(x, y) || !floor.walkable(x + nx * CLEAR, y + ny * CLEAR) || !floor.walkable(x - nx * CLEAR, y - ny * CLEAR)) return false;
    }
    return true;
  };
  // (a stretch that strays at most WOBBLE metres from the straight way -- the engine's line zig-zagging round
  // a corner too tight for CLEAR, as L1's does round the stair at the north entrance -- is drawn straight where
  // that comes no nearer a wall than the line it replaces did, nor nearer than NEAR where that line kept it.
  // Cut at any nearness, a corner clipped the wall's end: L3 by TK-302, 3 Nov.)
  const strays = (i, j) => {
    const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = 0;
    for (let k = i + 1; k < j; k++) far = Math.max(far, Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L);
    return far;
  };
  const runs = [];
  if (keepRuns) {
    for (let i = 0; i < n - 1;) {
      let j = i + 1;
      while (j + 1 < n && strays(i, j + 1) <= 0.02) j++;
      if (cum[j] - cum[i] >= LONG) {
        const [l, r] = gaps(floor, pts[i], pts[j]), spread = v => Math.max(...v) - Math.min(...v);
        if (Math.max(...l, ...r) < HALF && spread(l) <= PARALLEL && spread(r) <= PARALLEL) runs.push([i, j]);
      }
      i = j;
    }
    if (!runs.length) return null;
  }
  // the first such run within pts[a]..pts[b] that one straight line from a to b would tilt by more than LEAN
  const leans = (a, b) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    return runs.find(([i, j]) => i >= a && j <= b && (i > a || j < b) &&
      Math.abs((bx - ax) * (pts[j][1] - pts[i][1]) - (by - ay) * (pts[j][0] - pts[i][0])) / L > LEAN);
  };
  const room = (x, y, nx, ny) => {
    for (const c of [NEAR, 0.2, 0.1]) if (floor.walkable(x + nx * c, y + ny * c) && floor.walkable(x - nx * c, y - ny * c)) return c;
    return 0;
  };
  const onFloor = (i, j) => {
    const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) return true;
    const nx = -(by - ay) / L, ny = (bx - ax) / L;
    let least = NEAR;
    for (let d = 0.1; d < L; d += 0.2) {
      const along = cum[i] + (cum[j] - cum[i]) * d / L;
      if (along < ENDS || along > total - ENDS) continue;
      const x = ax + (bx - ax) * d / L, y = ay + (by - ay) * d / L;
      if (!floor.walkable(x, y)) return false;
      if (least > 0) least = Math.min(least, room(x, y, nx, ny));
    }
    if (least >= NEAR) return true;
    for (let k = i + 1; k < j; k++) if (cum[k] >= ENDS && cum[k] <= total - ENDS && room(pts[k][0], pts[k][1], nx, ny) <= least) return true;
    return false;
  };
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let far = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > far) { far = d; at = i; }
    }
    if (far > STRAIGHT || !(far <= WOBBLE ? onFloor(a, b) : open(a, b))) { keep[at] = 1; stack.push([a, at], [at, b]); continue; }
    const run = leans(a, b);
    if (run) { const [i, j] = run; keep[i] = keep[j] = 1; stack.push([a, i], [i, j], [j, b]); }
  }
  // Then each zig-zag on its own: splitting a longer stretch at a zig-zag's furthest point keeps that point. From
  // each point kept, the line goes straight on to the furthest kept point it strays at most WOBBLE from on the
  // way (and that onFloor allows; the nearer ones are tried in turn).
  const ids = [];
  for (let i = 0; i < n; i++) if (keep[i]) ids.push(i);
  const out = [pts[ids[0]]];
  for (let a = 0; a < ids.length - 1;) {
    let c = a + 1;
    while (c + 1 < ids.length && strays(ids[a], ids[c + 1]) <= WOBBLE && !leans(ids[a], ids[c + 1])) c++;
    while (c > a + 1 && !onFloor(ids[a], ids[c])) c--;
    out.push(pts[ids[c]]);
    a = c;
  }
  return out;
}

// (with a floor, an arc stays on it: where it would cut over a wall's corner it is drawn tighter, down to a
// plain corner. Once the straightening left fewer, longer stretches, a full 3 m arc clipped the wall's corner
// by L2's BT-201 and L3's TK-302, 3 Nov. The last ENDS metres, at a door or a stair, are let off, as above.)
function fillet(s, rMax, floor = null) {
  const out = [s[0]], first = s[0], last = s[s.length - 1];
  const ok = ([x, y]) => !floor || Math.hypot(x - first[0], y - first[1]) < ENDS || Math.hypot(x - last[0], y - last[1]) < ENDS || floor.walkable(x, y);
  for (let i = 1; i < s.length - 1; i++) {
    const [ax, ay] = s[i - 1], [bx, by] = s[i], [cx, cy] = s[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const u1 = [(ax - bx) / l1, (ay - by) / l1], u2 = [(cx - bx) / l2, (cy - by) / l2];
    const theta = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (Math.PI - theta < 0.06 || theta < 1e-3) { out.push(s[i]); continue; }   // straight on, or doubling back
    const half = Math.tan(theta / 2), bis = [u1[0] + u2[0], u1[1] + u2[1]], bl = Math.hypot(bis[0], bis[1]) || 1e-9;
    const arc = t => {
      const r = t * half, p1 = [bx + u1[0] * t, by + u1[1] * t], p2 = [bx + u2[0] * t, by + u2[1] * t];
      const dc = r / Math.sin(theta / 2), c = [bx + bis[0] / bl * dc, by + bis[1] / bl * dc];
      const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
      let da = Math.atan2(p2[1] - c[1], p2[0] - c[0]) - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.max(2, Math.ceil(Math.abs(da) * r / 0.25)), pts = [];
      for (let j = 0; j <= k; j++) { const a = a1 + da * j / k; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
      return pts;
    };
    let t = Math.min(rMax / half, 0.5 * l1, 0.5 * l2), pts = arc(t);
    for (let tries = 0; tries < 6 && !pts.every(ok); tries++) { t *= 0.6; pts = arc(t); }
    if (pts.every(ok)) out.push(...pts); else out.push(s[i]);
  }
  out.push(last);
  return out;
}

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}

// The nearest point of a line to p: how far along it (s, metres) and how far off (d).
function nearestOn(line, cum, [px, py]) {
  let best = { s: 0, d: Infinity };
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
    const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
    if (d < best.d) best = { s: cum[i - 1] + t * (cum[i] - cum[i - 1]), d };
  }
  return best;
}

// The part of a line between s0 and s1 metres along it.
function sliceLine(line, cum, s0, s1) {
  const at = s => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
  };
  const out = [at(s0)];
  for (let i = 0; i < line.length; i++) if (cum[i] > s0 && cum[i] < s1) out.push(line[i]);
  out.push(at(s1));
  return out;
}


function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawPin(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(20,24,30,0.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-3, -7, -13, -14, -13, -24);
  ctx.arc(0, -24, 13, Math.PI, 0, false);
  ctx.bezierCurveTo(13, -14, 3, -7, 0, 0);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -24, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

export { FONT, smoothLine };
