// The ten floors of the map, turned into shapes the app draws.
//
// Every floor is drawn in METRES, not in its sheet's pixels. The evacuation sheets are drawn
// 10-47% wider than tall (data/floors_evac.json, `metres.pxPerMetre`), so drawing the pixels
// would stretch every room. Every floor goes through `metres.toCampus` into the CAD's campus
// frame, so the floors stack (switching floor keeps the view over the same spot), and a Lakeside
// floor and the Toh Tuck floor on its level (the floors index's `sameLevel`) are each other's
// `partners`: the map draws them together, the bridge between them. Toh Tuck is turned about 25
// degrees in that frame, as it is on the ground. A floor without a placement is scaled to metres
// and stacked on the stairs it shares with the others of its building (stackTohTuck).
//
// Nothing here changes the map. The shapes are the map's own (data/<F>_evac/navmesh_data.json);
// a room's colour comes from what its name says it is, the way the evacuation sheets colour it.

const RE_CODE = /^[A-Z]{2,4}-\d{3}/;

// The floors come a level at a time, so the map can be drawn before the rest are in. A level is a
// Lakeside floor and the Toh Tuck floor that shares it (the index's `sameLevel`): they are drawn
// together, the bridge between them joined, so they come together. `first` names the floors wanted
// soonest, in order (the one a trip starts on, then where it goes; none, and it is the index's first,
// Level 1, where a visit starts). That level is asked for on its own, so the other floors do not slow
// it down; then all the others at once, those between the ones named first (a trip from L3 to L5 may
// well pass L4), then outward. onLevel(floors, campus) hears of each level as soon as it is built:
// `campus` fills as they come (its `floors` in the index's order), and is whole when the promise
// answers with it.
export async function loadFloors(root, { first = [], onLevel = null } = {}) {
  // each floor's footprint (the gaps between its shapes closed) and walkable area (cleaned of
  // slivers and nicks), as drawn: tools/app/footprints.py; without them, drawn from the traced data
  // (asked for with the index: the first level needs it, and it once waited for every floor)
  const printsIn = getJSON(root + 'data/footprints_evac.json').catch(() => null);
  const index = await getJSON(root + 'data/floors_evac.json');
  const campus = { index, floors: [], byId: {}, buildings: [] };
  const pos = new Map(index.floors.map((m, i) => [m.id, i]));
  // the levels: each floor with those it shares a level with (a floor with no placement is stacked
  // on the others of its building, stackTohTuck, so then they all come as one)
  const unplaced = index.floors.some(m => !(m.metres && m.metres.toCampus));
  const levelOf = new Map(index.floors.map(m => [m.id, unplaced ? index.floors : [m]]));
  for (const [a, b] of unplaced ? [] : index.sameLevel || []) {
    const A = levelOf.get(a), B = levelOf.get(b);
    if (!A || !B || A === B) continue;
    const both = [...A, ...B].sort((m, n) => pos.get(m.id) - pos.get(n.id));
    for (const m of both) levelOf.set(m.id, both);
  }
  const levels = [...new Set(levelOf.values())];
  const want = [...new Set(first.map(id => levelOf.get(id)).filter(Boolean))];
  if (!want.length) want.push(levels[0]);
  const lo = Math.min(...want.map(g => g[0].level)), hi = Math.max(...want.map(g => g[0].level));
  const off = g => Math.max(lo - g[0].level, g[0].level - hi, 0);
  const order = [...want, ...levels.filter(g => !want.includes(g)).sort((a, b) => off(a) - off(b) || pos.get(a[0].id) - pos.get(b[0].id))];
  let prints;
  const build = (metas, datas) => {
    const floors = metas.map((meta, i) => new Floor(meta, datas[i], prints && prints.floors && prints.floors[meta.id],
      fixesFor(index.corrections, meta.id)));
    stackTohTuck(floors);
    for (const f of floors) f.build();
    for (const f of floors) campus.byId[f.id] = f;
    // a level the two wings share (L2 and TT 2, joined by a bridge): drawn together when both are placed
    for (const [a, b] of index.sameLevel || []) {
      const A = floors.find(f => f.id === a), B = floors.find(f => f.id === b);
      if (A && B && A.campus && B.campus) { A.partners.push(B); B.partners.push(A); }
    }
    joinBridges(floors);
    walkwayAreas(floors);
    campus.floors = index.floors.map(m => campus.byId[m.id]).filter(Boolean);
    if (onLevel) onLevel(floors, campus);
  };
  const fetchLevel = metas => Promise.all(metas.map(m => getJSON(root + m.data)));
  const [firstData, fp] = await Promise.all([fetchLevel(order[0]), printsIn]);
  prints = fp;
  build(order[0], firstData);
  // (asked for in that order: on a connection that takes a few files at a time, it is the order they come)
  await Promise.all(order.slice(1).map(metas => fetchLevel(metas).then(datas => build(metas, datas))));
  campus.buildings = index.buildings.map(b => ({ ...b, floors: b.verticalOrder.map(id => campus.byId[id]) }));
  return campus;
}

// The CAD's corrections to a sheet's layout (data/floors_evac.json `corrections`, from
// tools/evacpipe/corrections.json; tools/routing/build.mjs measures with the same): inside a
// region (campus metres), campus x and y move by dx and dy, each piecewise linear in y. Lakeside's
// west side is drawn about 10 m too far north on every sheet (dy: its rooms stay square), and its
// front straight where the CAD's curves (dx along the front). Where a corridor runs along a region's
// edge the move fades in across it (the edge's `band`, metres), so a route over it slants rather
// than jumps; along a wall it is a hard edge.
function fixesFor(corrections, id) {
  return Object.values(corrections || {}).filter(c => c.region && c.region[id])
    .map(c => ({ ring: c.region[id].ring, band: c.region[id].band, dx: c.dx || null, dy: c.dy || null }));
}

// How much of a correction applies at (x, y): 0 outside its region, else fading in from each soft
// edge over its band.
function fixWeight(f, x, y) {
  if (!inside(f.ring, x, y)) return 0;
  let w = 1;
  const r = f.ring, n = r.length;
  for (let i = 0; i < n; i++) {
    const b = f.band[i];
    if (!b) continue;
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % n], ex = bx - ax, ey = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    const d = Math.hypot(ax + t * ex - x, ay + t * ey - y);
    if (d < b) { const s = d / b; w = Math.min(w, s * s * (3 - 2 * s)); }
  }
  return w;
}

// A piecewise linear function [[v, f(v)], ...] at v, held level beyond its ends.
function along(pts, v) {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [a, fa] = pts[i - 1], [b, fb] = pts[i];
    if (v <= b) return fa + (fb - fa) * (v - a) / (b - a);
  }
  return pts[pts.length - 1][1];
}

// (init: fetch's own options, such as main.js's { priority: 'low' } for the walking network)
// Tells each floor how the routing network's points sit on it (the graph's `floors[].raster`): a floor routed on
// its own map gives its points on that grid (Floor.routePoint). Call it once the network and the floors are in.
export function useRouting(campus, graph) {
  for (const g of (graph && graph.floors) || []) {
    const f = campus.byId[g.id];
    if (f) f.routeT = g.raster ? g.raster.toCampus : null;
  }
}

export async function getJSON(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// What a room is, from its id and English name: decides its colour and icon.
export function roomKind(id, en) {
  if (/^ELEV-/.test(id)) return 'lift';
  if (/^STAIR-/.test(id)) return 'stair';
  if (/UNNAMED/.test(id) || !id) return 'blank';
  const s = en || '';
  // (a theatre's dressing room is a back room, below: the Black Box's, which the CAD names DRESSING ROOM)
  if (/toilet|\bwc\b|washroom|changing|shower|restroom/i.test(s)) return 'toilet';
  // where you arrive: by bus, by car, on foot (a tree said "outdoors", which is not what a bus bay is)
  if (/\bbus (bay|drop|pick|stop)/i.test(s)) return 'bus';
  if (/drop-?off|pick-?up|car park|driveway|taxi/i.test(s)) return 'drop';
  if (/\bentrance\b/i.test(s)) return 'entrance';
  // what people go to, by what it is for; the back rooms after
  if (/kitchen|pantry|servery|\bprep\b/i.test(s) && !/classroom|bakery|baking/i.test(s)) return 'service';
  if (/canteen|caf[eé]|dining|alfresco/i.test(s)) return 'food';
  if (/store|storage|plant|riser|switch|transformer|electrical|generator|pump|tank|server|\blan\b|closet|janitor|cleaner|refuse|\btes\b|\bahu\b|substation|meter|sprinkler|fire control|hose reel|locker|m&e|equipment|costume|props|dressing room|maintenance|supply|thermal|chiller|bicycle/i.test(s)) return 'service';
  if (/\bpool\b/i.test(s)) return 'pool';
  if (/librar|study area/i.test(s) && !/office|workroom/i.test(s)) return 'library';
  if (/theatre|auditorium|black ?box|gymnasium|\bgym\b|fitness|convention|viewing gallery|sound lock/i.test(s) && !/office/i.test(s)) return 'hall';
  if (/\bnurse\b|clinic|medical|health|counsel|learning support|speech|occupational|therap|well-?being|inclusion|\bls\b|behaviou?rist/i.test(s) && !/head of/i.test(s)) return 'care';
  if (/office|head of|principal|director|admission|reception|finance|human resources|\bhr\b|board|meeting|staff|marketing|registrar|bursar|security|leadership|admin|\bpta\b|\bceo\b|operations|facilities|accounts|it help|i\.t\.|advisor|coordinator|co-?worker|workroom|work room|transport|eca|csr|\blead\b/i.test(s)) return 'office';
  if (/sand|play area|playground|garden|field|court/i.test(s)) return 'outdoor';
  if (/\blab\b|laboratory|makerspace|steam|science|music|art|drama|dance|studio|bak(ery|ing)|motor|design|technology|computer|\bict\b|robot|film|recording|academy|practice/i.test(s)) return 'special';
  return 'room';
}

// "Gross Motor Room 1 TK-401" -> {code: "TK-401", name: "Gross Motor Room 1"}
export function splitLabel(id, label) {
  const code = RE_CODE.test(id) ? id : '';
  const strip = s => {
    if (!s) return '';
    // the code wherever it sits, with or without its hyphens ("Learning Support LKS207-1")
    if (code) s = s.replace(new RegExp(code.split('-').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('-?'), 'g'), ' ');
    return s.replace(/\(\s*\)|（\s*）/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—,·]+|[\s\-–—,·]+$/g, '').trim();
  };
  return { code, name: { en: strip(label && label.en), zh: strip(label && label.zh) } };
}

// Feature kinds that are out of doors (tools/app/footprints.py OUTDOOR): no building wall round them.
const OUTDOOR = new Set(['deck', 'garden', 'playground', 'play-equipment', 'road', 'crossing', 'walkway', 'parking', 'planter',
  'divider', 'floor-marking', 'parapet', 'gate', 'ramp']);

// The order features are drawn in where they overlap: ground, then what is laid on it, then planting, then what is
// built (a kerb, a fence, a counter), so the built thing shows whole. Kinds not listed are 0.
const FEATURE_Z = { road: -3, parking: -3, crossing: -2, walkway: -2, 'bridge-deck': -2, deck: -2, court: -2, playground: -2,
  courtyard: -2, 'open-air': -2, ramp: -1, garden: -1, planter: 1, 'play-equipment': 1, seating: 1, 'seating-bank': 1,
  platform: 1, counter: 2, fixture: 2, service: 2, store: 2, shaft: 2, 'back-of-house': 2, divider: 3, parapet: 3, gate: 3,
  'floor-marking': 3 };

class Floor {
  constructor(meta, data, drawn, fixes) {
    this.meta = meta;
    this.data = data;
    this.fixes = fixes || [];
    this.footprintRings = (drawn && drawn.footprint) || null;
    this.walkDrawn = (drawn && drawn.walk) || null;
    this.pocketRings = (drawn && drawn.pockets) || null;
    this.groundRings = (drawn && drawn.ground) || null;
    this.grownRings = (drawn && drawn.rooms) || null;
    // (on a floor the CAD's corrections move, tools/app/footprints.py works these out where they are
    // drawn, in campus metres: frame "campus")
    this.drawnOnMap = !!(drawn && drawn.frame === 'campus');
    this.id = meta.id;
    this.building = meta.building;
    this.level = meta.level;
    this.name = meta.name;
    const m = meta.metres || {};
    const ppm = m.pxPerMetre || { x: 1, y: 1 };
    // sheet px -> metres: [a, b, c, d, e, f] as (a x + b y + c, d x + e y + f)
    this.T = m.toCampus ? m.toCampus.slice() : [1 / ppm.x, 0, 0, 0, 1 / ppm.y, 0];
    this.campus = !!m.toCampus;
    // which way the sheet's x runs on the map (a Toh Tuck sheet is turned about 25 degrees)
    this.axis = unit([this.T[0], this.T[3]]);
    // the part of the sheet that is this floor (TT_L1's also draws the Lakeside bus bay), sheet px
    this.clipSheet = m.clip || null;
    this.partners = [];
  }

  view(x, y) {
    const T = this.T, X = T[0] * x + T[1] * y + T[2], Y = T[3] * x + T[4] * y + T[5];
    // (the CAD's corrections to the sheet's layout, each judged where the sheet puts the point: see fixesFor)
    let u = X, v = Y;
    for (const f of this.fixes) {
      const w = fixWeight(f, X, Y);
      if (w > 0) { if (f.dx) u += w * along(f.dx, Y); if (f.dy) v += w * along(f.dy, Y); }
    }
    return [u, v];
  }

  ring(vs) { return this.mapRing(vs.map(v => [v.x, v.y])); }

  // One of tools/app/footprints.py's rings (footprint, walk, pockets, ground) in campus metres.
  drawnRing(rg) { return this.drawnOnMap ? rg : this.mapRing(rg); }

  // A ring of sheet px in campus metres. Where a correction moves x along y (the south-west wing's
  // facade), an edge's two ends move by different amounts and a straight edge would stay straight:
  // such edges are cut into metre lengths first, so they bend as the CAD's facade does.
  mapRing(pts) {
    if (!this.fixes.length) return pts.map(([x, y]) => this.view(x, y));
    const bend = this.fixes.filter(f => f.dx);
    const T = this.T, ppm = (this.meta.metres && this.meta.metres.pxPerMetre) || { x: 1, y: 1 }, step = Math.min(ppm.x, ppm.y);
    const at = (f, x, y) => fixWeight(f, T[0] * x + T[1] * y + T[2], T[3] * x + T[4] * y + T[5]);
    const moved = (x, y) => bend.some(f => at(f, x, y) > 0);
    const weights = (x, y) => this.fixes.map(f => at(f, x, y));
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      out.push(this.view(ax, ay));
      const n = Math.floor(Math.hypot(bx - ax, by - ay) / step);
      if (n < 2) continue;
      const cut = k => this.view(ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
      // (both ends in it: an edge across its boundary is a jog the move closes, and cut up it scattered)
      if (moved(ax, ay) && moved(bx, by)) { for (let k = 1; k < n; k++) out.push(cut(k)); continue; }
      // A move fading in along the edge (its ends weighted differently) is cut up too, so the edge bends
      // through the fade rather than running one straight slant from the moved end to the still one: L4's
      // outline north of the roof drew a 30 m wedge so.
      const wa = weights(ax, ay), wb = weights(bx, by);
      if (!wa.some((w, j) => Math.abs(w - wb[j]) > 0.05)) continue;
      // (quarter-metre cuts: a 9.5 m move fading in over 2 m shifts 7 m in a metre. Where the edge crosses
      // a hard region edge the cuts jump the whole move between two of them, and the jump is kept: a step
      // where the move starts. Left straight instead, the edge ran one slant from the moved end to the
      // still one: the canteen's north side under L2's music block drew a 3 m wedge so.)
      // ...but a move along the edge's own line (a wing moved east, under an east-west edge) jumps it back over the
      // stretch just drawn: those points are skipped until the line passes where it jumped from, or the outline drew
      // a stub past the corner (the Secondary Library's south side, 2.5 m past its corner into the corridor)
      const [vx, vy] = this.view(bx, by), [ux, uy] = out[out.length - 1];
      const dl = Math.hypot(vx - ux, vy - uy) || 1, dx = (vx - ux) / dl, dy = (vy - uy) / dl;
      let last = out[out.length - 1], from = null;
      for (let k = 1; k < 4 * n; k++) {
        const p = this.view(ax + (bx - ax) * k / (4 * n), ay + (by - ay) * k / (4 * n));
        if (!from && Math.hypot(p[0] - last[0], p[1] - last[1]) > 1) from = last;
        if (from && (p[0] - from[0]) * dx + (p[1] - from[1]) * dy < 0) continue;
        out.push(p); last = p;
      }
    }
    return out;
  }

  // A point of a route, as the engine gives it, in campus metres. On a floor the CAD's corrections move, the
  // network is built on the floor as the map draws it (tools/routing/build.mjs), and its points are on that
  // network's own grid: `routeT` (from useRouting) takes them to campus metres, with nothing left to correct.
  routePoint(x, y) {
    const R = this.routeT;
    return R ? [R[0] * x + R[1] * y + R[2], R[3] * x + R[4] * y + R[5]] : this.view(x, y);
  }

  // A route leg's line (sheet px) where the map draws it, in campus metres: on a floor the CAD's corrections
  // move, cut into half-metre pieces first, so a run whose one end a correction moves and whose other end it
  // doesn't bends with the floor. Drawn corner to corner it cut straight across Stairs 13's treads on L5 and
  // L4, where tk-south moves the passage south of the stair and not the corridor before it (the audit, 2 Nov:
  // 31 of its 35 routes drawn through a room were this). Then unspur (below). tools/app/routelines.mjs
  // checks the line this gives, on trips all over the campus.
  mapLine(pts) {
    if (this.routeT) return pts.map(([x, y]) => this.routePoint(x, y));
    if (!this.fixes.length) return pts.map(([x, y]) => this.view(x, y));
    // (the engine's points are sheet pixels: a piece is half a metre on the map or of the sheet, whichever
    // is longer -- in pixels it was 3 cm, and the line followed every ripple of a correction)
    const scale = Math.hypot(this.T[0], this.T[3]), base = [], view = [];
    // (where a correction's move changes within a piece -- at its edge -- and the piece, drawn straight, would
    // leave the floor, it is halved, and halved again, until each half is half a metre on the map or on the
    // floor: the line bends with the floor, as its outline does (Floor.mapRing). In one straight 0.5 m piece it
    // stepped 3 m at lakeside-west's edge on L1, across the wall beside it. A step that stays on the floor --
    // half a metre across a corridor, L4 by BT-408 -- is left a straight slant: halved down, it was a Z.)
    const put = (p, v) => { base.push(p); view.push(v); };
    const onFloor = (v, w) => {
      const L = Math.hypot(w[0] - v[0], w[1] - v[1]);
      for (let t = 0; t <= L; t += 0.1) if (!this.walkable(v[0] + (w[0] - v[0]) * t / L, v[1] + (w[1] - v[1]) * t / L)) return false;
      return true;
    };
    const split = (p, v, q, w, depth) => {
      if (depth < 12 && Math.hypot(w[0] - v[0], w[1] - v[1]) > 0.5 && Math.hypot(q[0] - p[0], q[1] - p[1]) * scale > 0.01 && !onFloor(v, w)) {
        const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], mv = this.view(m[0], m[1]);
        split(p, v, m, mv, depth + 1);
        split(m, mv, q, w, depth + 1);
      } else put(q, w);
    };
    pts.forEach(([x, y], i) => {
      const here = this.view(x, y);
      if (!i) { put([x, y], here); return; }
      const [px, py] = pts[i - 1], a = view[view.length - 1];
      const n = Math.ceil(Math.max(Math.hypot(here[0] - a[0], here[1] - a[1]), Math.hypot(x - px, y - py) * scale) / 0.5);
      for (let k = 1; k <= n; k++) {
        const q = k < n ? [px + (x - px) * k / n, py + (y - py) * k / n] : [x, y];
        split(base[base.length - 1], view[view.length - 1], q, k < n ? this.view(q[0], q[1]) : here, 0);
      }
    });
    return unspur(view, base);
  }

  // A walkable ring as drawn. The sheets' colour tracing leaves its edges ragged (a notch, a step,
  // a slanted end a few pixels long) and every ragged bit showed in the walls, as a nick or a
  // sliver. For drawing only (walkable() keeps the traced edges): simplified to within TIDY metres,
  // then each edge within SNAP degrees of the sheet's axes squared to them (the sheets are drawn
  // square), so a wall runs straight and turns square.
  tidy(vs) {
    const ppm = (this.meta.metres && this.meta.metres.pxPerMetre) || { x: 1, y: 1 };
    const p = simplifyRing(vs.map(v => [v.x, v.y]), TIDY * Math.min(ppm.x, ppm.y));
    const q = p.length > 2 ? squareRing(p, Math.tan(SNAP * Math.PI / 180), CHAMFER * Math.min(ppm.x, ppm.y), SQUARE_DEV * Math.min(ppm.x, ppm.y)) : p;
    return (q.length > 2 ? q : vs.map(v => [v.x, v.y])).map(([x, y]) => ({ x, y }));
  }

  build() {
    const d = this.data;
    const e = d.editor || {};
    // the walkable area as traced (walkable() tests it) and as drawn: cleaned (tools/app/footprints.py)
    // or, without that, tidied here (see tidy)
    const outers = [], holes = [], drawOuters = [], drawHoles = [];
    const add = (vs, traced, drawn) => {
      traced.push(this.ring(vs));
      if (this.walkDrawn) return;
      const t = this.ring(this.tidy(vs)); if (t.length > 2) drawn.push(t);
    };
    if (e.walkableOuter && e.walkableOuter.length > 2) add(e.walkableOuter, outers, drawOuters);
    for (const h of e.walkableHoles || []) if (h.length > 2) add(h, holes, drawHoles);
    for (const p of d.walkableParts || []) {
      add(p.vertices, outers, drawOuters);
      for (const h of p.holes || []) if (h.length > 2) add(h, holes, drawHoles);
    }
    for (const rg of this.walkDrawn || []) (ringArea(rg) > 0 ? drawOuters : drawHoles).push(this.drawnRing(rg));
    this.walk = pathOf([...drawOuters, ...drawHoles]);
    this.walkOuters = drawOuters;   // (joinBridges squares a deck's end to the wall it meets)
    this.walkRings = [...outers, ...holes];
    this.walkIndex = null;
    this.clipRing = this.clipSheet ? this.clipSheet.map(([x, y]) => this.view(x, y)) : null;
    this.clipPath = this.clipRing ? pathOf([this.clipRing]) : null;

    this.rooms = [];
    const roomById = new Map();
    for (const r of d.rooms || []) {
      if (!r.vertices || r.vertices.length < 3) continue;
      const room = this.makeShape(r.id, r.label, this.ring(r.vertices));
      room.kind = r.unnamed ? 'blank' : roomKind(r.id, r.label && r.label.en);
      room.portalId = r.portalId || null;
      this.rooms.push(room);
      roomById.set(r.id, room);
    }
    for (const s of d.staircases || []) {
      if (!s.vertices || s.vertices.length < 3) continue;
      const room = this.makeShape(s.id, s.label, this.ring(s.vertices));
      room.kind = 'stair';
      room.portalId = s.portalId || s.id;
      this.rooms.push(room);
      roomById.set(s.id, room);
    }
    // A room the routing walks through, with walkable floor under it (L1's Reception, the way into the admin suite), is
    // floor to the route's drawing too. As a room it was not, and the line across it was left as the engine's, kinked,
    // with a hook at Head of IT's door (review, 10 Nov). Judged on a grid of points inside it.
    for (const r of this.rooms) {
      if (r.kind === 'stair') { r.through = false; continue; }
      const b = r.bbox, pts = [];
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
        const x = b.x0 + (b.x1 - b.x0) * i / 10, y = b.y0 + (b.y1 - b.y0) * j / 10;
        if (inside(r.ring, x, y)) pts.push([x, y]);
      }
      // (Reception is 97% walkable floor, a thin wall or two inside it; the next room on the campus is 26%)
      r.through = pts.length >= 8 && pts.filter(([x, y]) => this.inWalk(x, y)).length >= 0.8 * pts.length;
    }
    // Each room as drawn: grown into the gap round it to meet its walls (tools/app/footprints.py rooms_grown),
    // so every wall is the same band; its traced outline stays for taps, labels and routes.
    for (const r of this.rooms) {
      const g = this.grownRings && this.grownRings[r.id];
      if (g) { r.block = this.drawnRing(g); r.blockPath = pathOf([r.block]); }
    }
    this.features = [];
    for (const f of d.features || []) {
      if (!f.vertices || f.vertices.length < 3) continue;
      const sh = this.makeShape(f.id, f.label, this.ring(f.vertices));
      sh.kind = f.kind; sh.walkable = !!f.walkable; sh.outdoor = OUTDOOR.has(f.kind);
      this.features.push(sh);
    }
    for (const b of d.blocked || []) {
      if (!b.vertices || b.vertices.length < 3) continue;
      const sh = this.makeShape(b.id, b.label, this.ring(b.vertices));
      sh.kind = 'void'; sh.walkable = false;
      this.features.push(sh);
    }
    this.soft = (d.softBlocked || []).filter(s => s.vertices && s.vertices.length > 2)
      .map(s => this.makeShape(s.id, s.label, this.ring(s.vertices)));

    // A lift's shaft is a hole in the floor a little bigger than the lift, ragged with the CAD's
    // wall lines (L4's is 26 corners round a 4-corner lift): the lift is drawn as one clean block
    // over both, and the shaft's outline is left out of the walls.
    // The block is square to the lift (a Toh Tuck lift turns with its building: a block square to
    // the screen stood out over the toilets beside it and through the wall), and a hole that is
    // another room's is not the shaft.
    const shafts = new Set();
    for (const r of this.rooms) {
      if (r.kind !== 'lift') continue;
      const b = { ...r.bbox }, area = (b.x1 - b.x0) * (b.y1 - b.y0), pts = [...r.ring];
      for (const h of drawHoles) {
        const hb = boundsOf(h), hx = (hb.x0 + hb.x1) / 2, hy = (hb.y0 + hb.y1) / 2;
        if (hb.x0 >= b.x1 || hb.x1 <= b.x0 || hb.y0 >= b.y1 || hb.y1 <= b.y0) continue;
        if ((hb.x1 - hb.x0) * (hb.y1 - hb.y0) > 4 * area) continue;
        if (this.rooms.some(o => o !== r && o.kind !== 'lift' && inside(o.ring, hx, hy))) continue;
        shafts.add(h); pts.push(...h);
        b.x0 = Math.min(b.x0, hb.x0); b.y0 = Math.min(b.y0, hb.y0); b.x1 = Math.max(b.x1, hb.x1); b.y1 = Math.max(b.y1, hb.y1);
      }
      const F = extent(pts, r.frame.ux, r.frame.uy);
      r.block = cornersOf(F);
      r.blockPath = pathOf([r.block]);
      Object.assign(r, { lx: F.cx, ly: F.cy, lw: F.w, lh: F.h });
    }

    // An area marked "not a through route" (L1's atrium, L4's gym) is floor all the same: drawn as
    // floor, with no wall round it or round the hole the walkable area has under it.
    const underSoft = [];
    for (const sf of this.soft) for (const h of drawHoles) {
      const hb = boundsOf(h), b = sf.bbox;
      if (hb.x0 > b.x0 - 1 && hb.x1 < b.x1 + 1 && hb.y0 > b.y0 - 1 && hb.y1 < b.y1 + 1) { shafts.add(h); underSoft.push(h); }
    }
    // So is the hole under a thing that stands on the floor with no walls round it (the atrium's
    // curved stairs, a planter, seating): no room in it, and such things covering half of it. Drawn
    // as floor, the thing on top, instead of a wall-coloured halo the shape of the hole.
    const OPEN_THING = new Set(['stair-flight', 'planter', 'seating', 'seating-bank', 'counter', 'fixture', 'platform', 'garden', 'parapet']);
    const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    // ...and the hole under a round thing drawn whole (the atrium's void, TT_L1's round Arts Room and
    // Pod): the hole is the trace's stepped polygon, and its corners stood out round the ellipse in
    // the wall colour. Drawn as floor, the round thing on top.
    const round = [...this.features.filter(ft => ft.kind === 'void'), ...this.rooms].filter(isRound);
    for (const h of drawHoles) {
      if (shafts.has(h)) continue;
      const hb = boundsOf(h), area = (hb.x1 - hb.x0) * (hb.y1 - hb.y0);
      if (area && round.some(sh => overlap(sh.bbox, hb) >= 0.6 * area)) { shafts.add(h); underSoft.push(h); }
    }
    for (const h of drawHoles) {
      if (shafts.has(h)) continue;
      const hb = boundsOf(h), area = (hb.x1 - hb.x0) * (hb.y1 - hb.y0);
      if (!area || this.rooms.some(r => overlap(r.bbox, hb) > 0.05 * area)) continue;
      const covered = this.features.filter(ft => OPEN_THING.has(ft.kind)).reduce((a, ft) => a + overlap(ft.bbox, hb), 0);
      if (covered >= 0.5 * area) { shafts.add(h); underSoft.push(h); }
    }
    // (each its own path: a hole and the area over it run opposite ways and would cancel in one)
    this.softFloor = [...underSoft, ...this.soft.map(sf => sf.ring)].map(rg => pathOf([rg]));

    // The walls: every outline the floor has, stroked thick in the wall colour underneath the
    // rest, closes the hairline seams between a room block and the corridor it opens onto, which
    // the sheet used to hide (tools/evacpipe/gapcheck.py measures them). A wider hole that nothing
    // fills (L3's open middle) stays open: on this map, that is outside.
    const solid = [...this.rooms, ...this.features];
    // the floor's footprint: filled in the wall colour first, so a gap between shapes (a block of
    // rooms 1.7 m short of a void) reads as wall, not as a stray light line
    this.footprint = this.footprintRings ? pathOf(this.footprintRings.map(rg => this.drawnRing(rg))) : null;
    // the gaps in it too thick for a wall (tools/app/footprints.py): blank space, walled round
    this.pockets = this.pocketRings && this.pocketRings.length ? pathOf(this.pocketRings.map(rg => this.drawnRing(rg))) : null;
    // ...and those out among the site's outdoor features (the field deck, the car park): open ground
    this.ground = this.groundRings && this.groundRings.length ? pathOf(this.groundRings.map(rg => this.drawnRing(rg))) : null;
    // (not round what is out of doors: a road or a garden has no wall, and the outline drew one along every kerb)
    this.outline = pathOf([...drawOuters, ...drawHoles.filter(h => !shafts.has(h)), ...solid.filter(r => !OUTDOOR.has(r.kind)).map(r => r.block || r.ring)]);
    // the walkable area's own edges, for the wall band outside them (app/map.js): not round a hole drawn as floor
    this.walkEdge = pathOf([...drawOuters, ...drawHoles.filter(h => !shafts.has(h))]);
    // A feature half over a room or stair (a garden over Stairs 8's corner, a parapet over Stairs 11) is drawn
    // clipped out of it: green over a stair read as a drawing error (owner, 4 Nov 2026). One wholly inside a room
    // (a counter, the stair's own flight) is its furniture and stays. Then the features in a set order by kind,
    // ground first, so two that overlap meet edge to edge whichever the data lists first.
    for (const ft of this.features) {
      const cut = this.rooms.filter(r => {
        const b = r.bbox, fb = ft.bbox;
        if (fb.x0 >= b.x1 || fb.x1 <= b.x0 || fb.y0 >= b.y1 || fb.y1 <= b.y0) return false;
        const rg = r.block || r.ring, n = ft.ring.filter(([x, y]) => inside(rg, x, y)).length;
        return (n > 0 && n < ft.ring.length) || (n === 0 && rg.some(([x, y]) => inside(ft.ring, x, y)));
      });
      if (cut.length) ft.clipOut = pathOf(cut.map(r => r.block || r.ring));
    }
    this.features.sort((a, b) => (FEATURE_Z[a.kind] || 0) - (FEATURE_Z[b.kind] || 0));
    // every room's edge, all one way round so that, as a clip, rooms that overlap make one area
    this.roomEdges = pathOf(this.rooms.map(r => r.block || r.ring).map(rg => (ringArea(rg) < 0 ? [...rg].reverse() : rg)));

    const portals = (d.portals || []).map(p => {
      const [x, y] = this.view(p.x, p.y);
      const room = roomById.get(p.id) || null;
      return { id: p.id, type: p.type, label: p.label, x, y, room, entranceOf: p.entranceOf || null, side: p.side || null,
               exactOnly: !!p.exactOnly, door: p.door ? this.view(p.door[0], p.door[1]) : null, ...splitLabel(p.id, p.label) };
    });
    // A number with no room (L3's TK-306, L2's TK-206: the bridge landing where its cell was; owner,
    // 3 Nov 2026) is reached by its id alone: kept out of the floor's portals, it is not drawn,
    // tapped, named in directions or listed, and is there only for whoever types it whole.
    this.portals = portals.filter(p => !p.exactOnly);
    this.portalById = new Map(portals.map(p => [p.id, p]));
    for (const r of this.rooms) {
      const p = this.portalById.get(r.portalId || r.id);
      if (p) { r.portal = p; if (!p.room) p.room = r; }
    }
    // A door: where a room's portal meets its outline, and which way that wall runs. A room
    // reached through another (L3's practice rooms, off the music room) has its door where the
    // labels' doorAt put it, on the wall the two share; any other portal more than a couple of
    // metres off its room gets none. A room's second door (a classroom's back door, from the CAD:
    // an entrance of the room, tools/audit/doorpins.mjs) is cut in its wall as well.
    this.doors = [];
    for (const p of this.portals) {
      const r = p.room || (p.entranceOf && roomById.get(p.entranceOf)) || null;
      if (!r || p.type === 'elevator') continue;
      // (on the room as drawn, grown to its wall: a door on the traced outline sat inside the room, behind the wall)
      const ring = r.block || r.ring, [ax, ay] = p.door || [p.x, p.y], q = nearestOnRing(ring, ax, ay);
      if (!p.door && q.d > 2.5) continue;
      // (ix, iy: square to the wall, into the room, for the cut through the room's wall band)
      const inward = inside(ring, q.x - q.dy * 0.3, q.y + q.dx * 0.3) ? 1 : -1, ix = -q.dy * inward, iy = q.dx * inward;
      // (via: the room on the wall's other side, whose wall band the door cuts too, gap metres off)
      const via = p.door ? this.rooms.find(o => o !== r && inside(o.ring, q.x - ix * 0.4, q.y - iy * 0.4)) || null : null;
      this.doors.push({ x: p.x, y: p.y, qx: q.x, qy: q.y, dx: q.dx, dy: q.dy, ix, iy, room: r,
        via, gap: via ? nearestOnRing(via.ring, q.x, q.y).d : 0 });
    }
    // Places with no shape of their own (the canteen, a pod, the bus bay): open floor with a name.
    this.openPlaces = this.portals.filter(p => !p.room && p.type === 'room' && !p.entranceOf);
    // ... unless a walkable area drawn whole holds its point (the libraries, the canteen, the gyms):
    // then that area is the place, a room you walk through, tapped and outlined like one
    for (const ft of this.features) {
      if (!ft.walkable || !AREA_KINDS.has(ft.kind)) continue;
      const p = this.openPlaces.find(q => !q.area && inside(ft.ring, q.x, q.y));
      if (p) { p.area = ft; ft.place = p; }
    }

    const xs = [], ys = [];
    for (const rg of [...outers, ...this.rooms.map(r => r.ring)]) for (const [x, y] of rg) { xs.push(x); ys.push(y); }
    this.bounds = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    // what an overview frames: the rooms, trimmed of the odd outlier, and a margin; a long walk or
    // a bus yard out at the edge no longer shrinks the building to a corner of the screen
    const q = (v, k) => { const a = [...v].sort((m, n) => m - n); return a[Math.max(0, Math.min(a.length - 1, Math.round(k * (a.length - 1))))]; };
    const rx = this.rooms.map(r => r.lx), ry = this.rooms.map(r => r.ly);
    if (rx.length > 4) {
      const c = { x0: q(rx, 0.02), y0: q(ry, 0.02), x1: q(rx, 0.98), y1: q(ry, 0.98) };
      const m = 6;
      this.core = { x0: Math.max(this.bounds.x0, c.x0 - m), y0: Math.max(this.bounds.y0, c.y0 - m),
                    x1: Math.min(this.bounds.x1, c.x1 + m), y1: Math.min(this.bounds.y1, c.y1 + m) };
    } else this.core = this.bounds;
  }

  makeShape(id, label, ring) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const sh = { id, label: label || null, ring, path: pathOf([ring]), bbox: { x0, y0, x1, y1 },
                 frame: frameOf(ring, this.axis), arc: arcOf(ring), ...splitLabel(id, label) };
    Object.assign(sh, labelBox(ring, sh.bbox));
    return sh;
  }

  // Open floor at (x, y), in metres: inside the walkable area (rings even-odd) and in no room.
  walkable(x, y) {
    if (!this.mine(x, y) || !this.inWalk(x, y)) return false;
    const r = this.roomAt(x, y);
    return !r || r.through;
  }

  // Inside the walkable rings, even-odd: a ray's crossings with all their edges (the parity of each ring's
  // crossings summed), counted over the edges in the point's metre band only. Drawing a route asks this a
  // thousand times a leg, and a corrected floor's rings have 1,000-1,400 corners: tried one by one, that
  // took 15-30 us a time (3 Nov). The same test as inside(), edge for edge, so the same answers.
  inWalk(x, y) {
    const I = this.walkIndex || (this.walkIndex = edgeBands(this.walkRings));
    const E = I.bands[Math.floor((y - I.y0) / I.h)];
    if (!E) return false;
    let c = false;
    for (let k = 0; k < E.length; k += 4) {
      const xi = E[k], yi = E[k + 1], xj = E[k + 2], yj = E[k + 3];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // On the plan at all at (x, y): the walkable area, a room, or anything the mapping drew there.
  onPlan(x, y) {
    if (!this.mine(x, y)) return false;
    if (this.inWalk(x, y)) return true;
    const hit = sh => x >= sh.bbox.x0 && x <= sh.bbox.x1 && y >= sh.bbox.y0 && y <= sh.bbox.y1 && inside(sh.ring, x, y);
    return this.rooms.some(hit) || this.features.some(hit) || this.soft.some(hit);
  }

  // Inside the part of the sheet that is this floor.
  mine(x, y) { return !this.clipRing || inside(this.clipRing, x, y); }

  // The area a bridge is walked across (its deck, or the covered walkway's crossing), drawn on this
  // floor or the other wing's on its level; null for a bridge with none.
  bridgeArea(id) { return [this, ...this.partners].flatMap(g => g.features).find(ft => ft.bridge === id) || null; }

  // The room (or stair, or lift) whose shape holds this point, in metres.
  roomAt(x, y) {
    if (!this.mine(x, y)) return null;
    let best = null;
    for (const r of this.rooms) {
      const b = r.bbox;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      if (inside(r.ring, x, y)) {
        const area = (b.x1 - b.x0) * (b.y1 - b.y0);
        if (!best || area < best.area) best = { room: r, area };
      }
    }
    return best && best.room;
  }
}

export function nearestOnRing(ring, x, y) {
  let best = { d: Infinity };
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
    if (L2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2));
    const qx = ax + t * ex, qy = ay + t * ey, d = Math.hypot(qx - x, qy - y);
    if (d < best.d) { const L = Math.sqrt(L2); best = { d, x: qx, y: qy, dx: ex / L, dy: ey / L }; }
  }
  return best;
}

const TIDY = 0.45, SNAP = 12, CHAMFER = 2, SQUARE_DEV = 0.3;   // as tools/app/footprints.py
// walkable areas that are a place of their own when one's point is inside them
const AREA_KINDS = new Set(['library', 'food', 'hall', 'court', 'special', 'outdoor', 'garden']);

// Douglas-Peucker on a closed ring: anchored at its first point and the point farthest from it.
function simplifyRing(p, eps) {
  const n = p.length;
  if (n < 5) return p;
  let far = 0, fd = -1;
  for (let i = 1; i < n; i++) { const d = (p[i][0] - p[0][0]) ** 2 + (p[i][1] - p[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const keep = new Uint8Array(n); keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = p[a % n], [bx, by] = p[b % n], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = p[i % n], d = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi % n] = 1; stack.push([a, mi], [mi, b]); }
  }
  return p.filter((_, i) => keep[i]);
}

// Each edge near the axes made exactly horizontal or vertical: a run of such edges in a row takes
// one level (weighted by length), and a corner takes its x from the vertical edge and its y from the
// horizontal one. Diagonal edges stay; points left in a straight line, or doubled, go.
function squareRing(p, tan, chamfer = 0, dev = Infinity) {
  const n = p.length, kind = [], len = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % n], dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    kind.push(dy <= tan * dx ? 'h' : dx <= tan * dy ? 'v' : 'd'); len.push(Math.hypot(dx, dy));
  }
  const level = new Array(n).fill(0);
  const start = kind.findIndex((k, i) => k !== kind[(i + n - 1) % n]);
  if (start < 0) return p;
  for (let k = 0; k < n;) {
    const i0 = (start + k) % n, kd = kind[i0];
    let m = 0;
    while (m < n - k && kind[(i0 + m) % n] === kd) m++;
    if (kd !== 'd') {
      let w = 0, sum = 0;
      for (let j = 0; j < m; j++) {
        const i = (i0 + j) % n, [ax, ay] = p[i], [bx, by] = p[(i + 1) % n];
        sum += len[i] * (kd === 'h' ? (ay + by) / 2 : (ax + bx) / 2); w += len[i];
      }
      const lv = w ? sum / w : 0, c = kd === 'h' ? 1 : 0;
      // a run straying further than `dev` from that line is a curve or a real slant: left as drawn
      let far = 0;
      for (let j = 0; j <= m; j++) far = Math.max(far, Math.abs(p[(i0 + j) % n][c] - lv));
      if (far > dev) for (let j = 0; j < m; j++) kind[(i0 + j) % n] = 'd';
      for (let j = 0; j < m; j++) level[(i0 + j) % n] = lv;
    }
    k += m;
  }
  // a short slant between a horizontal and a vertical edge is a corner the tracing rounded off: the
  // two edges meet square instead
  // (a run of slants, one or several, chamfer long at most)
  const steps = new Map();
  for (let i = 0; i < n; i++) {
    if (kind[i] !== 'd' || kind[(i + n - 1) % n] === 'd') continue;
    let j = i, total = 0;
    while (kind[j % n] === 'd' && j - i < n) { total += len[j % n]; j++; }
    const a = kind[(i + n - 1) % n], b = kind[j % n];
    if (total <= chamfer && ((a === 'h' && b === 'v') || (a === 'v' && b === 'h'))) for (let k = i; k < j; k++) kind[k % n] = 'c';
    // between two parallel edges (a neck widening into a lift core): a square step halfway
    else if (total <= chamfer && a === b && a !== 'd') {
      for (let k = i; k < j; k++) kind[k % n] = 's';
      steps.set(i % n, [j % n, a === 'v' ? (p[i % n][1] + p[j % n][1]) / 2 : (p[i % n][0] + p[j % n][0]) / 2]);
    }
  }
  const through = (i, step) => { while (kind[(i + n) % n] === 'c') i += step; return (i + n) % n; };   // past squared corners
  let out = [];
  for (let i = 0; i < n; i++) {
    const a = through((i + n - 1) % n, -1), b = through(i, 1);
    const x = kind[a] === 'v' ? level[a] : kind[b] === 'v' ? level[b] : p[i][0];
    const y = kind[a] === 'h' ? level[a] : kind[b] === 'h' ? level[b] : p[i][1];
    out.push([x, y]);
  }
  for (const [i, [j, mid]] of steps) {     // a step's two corners; the points between join them
    const before = level[(i + n - 1) % n], after = level[j], horiz = kind[(i + n - 1) % n] === 'v';
    out[i] = horiz ? [before, mid] : [mid, before];
    for (let k = (i + 1) % n; k !== j; k = (k + 1) % n) out[k] = out[i];
    out[j] = horiz ? [after, mid] : [mid, after];
  }
  // drop doubles and points on a straight line between their neighbours
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5 || Math.abs(cross) < 1e-6 * (1 + Math.hypot(c[0] - a[0], c[1] - a[1]) ** 2)) { out.splice(i, 1); i--; changed = true; }
    }
  }
  return out;
}

// Twice a ring's signed area: positive for the tool's outer rings, negative for its holes.
function ringArea(rg) {
  let a = 0;
  for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) a += rg[j][0] * rg[i][1] - rg[i][0] * rg[j][1];
  return a;
}

// Which way a shape runs: the smallest rectangle round it (rotating calipers on its hull), as its
// middle, the direction of its long side (ux, uy) and its sides (w along, h across). Within 12
// degrees of its floor's axes it takes them exactly (most shapes are drawn square to their sheet);
// further off it keeps its own angle (the upper field, 25 degrees off Lakeside's).
export function frameOf(ring, axis = [1, 0]) {
  const hull = hullOf(ring);
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], L = dist(a, b);
    if (L < 1e-9) continue;
    const f = extent(hull, (b[0] - a[0]) / L, (b[1] - a[1]) / L);
    if (!best || f.w * f.h < best.w * best.h - 1e-9) best = f;
  }
  if (!best) best = extent(ring, 1, 0);
  const base = Math.atan2(axis[1], axis[0]), turn = Math.atan2(best.uy, best.ux) - base;
  const q = Math.round(turn / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(turn - q) < 12 * Math.PI / 180) best = extent(ring, Math.cos(base + q), Math.sin(base + q));
  // the long side first, pointing right (or down)
  let { cx, cy, w, h, ux, uy } = best;
  if (h > w) { [w, h] = [h, w]; [ux, uy] = [-uy, ux]; }
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) { ux = -ux; uy = -uy; }
  return { cx, cy, w, h, ux, uy };
}

// A shape drawn as an ellipse (a void, a round room): every corner on the ellipse its frame holds.
function isRound(sh) {
  if (sh.ring.length < 16) return false;
  const F = sh.frame, a = F.w / 2, b = F.h / 2;
  if (a < 1 || b < 1) return false;
  return sh.ring.every(([x, y]) => {
    const dx = x - F.cx, dy = y - F.cy, u = dx * F.ux + dy * F.uy, v = dy * F.ux - dx * F.uy;
    return Math.abs((u / a) ** 2 + (v / b) ** 2 - 1) < 0.2;
  });
}

// A curved flight (the atrium's stairs): the circle its sides lie on, and the radii and angles it
// spans, for treads on its radii; null for anything else. Fitted to its outer side only: its hull
// less the chord across the inside of the curve (one circle fitted to both sides, of two radii,
// came out small and through the middle of the flight).
export function arcOf(ring) {
  if (ring.length < 10) return null;
  const hull = hullOf(ring);
  let k = 0, longest = 0;
  for (let i = 0; i < hull.length; i++) { const L = dist(hull[i], hull[(i + 1) % hull.length]); if (L > longest) { longest = L; k = i; } }
  const outer = hull.filter((_, i) => i !== k && i !== (k + 1) % hull.length);
  if (outer.length < 5) return null;
  // the circle x² + y² + D x + E y + F = 0 nearest those corners (least squares, about their mean)
  const mx = outer.reduce((a, p) => a + p[0], 0) / outer.length, my = outer.reduce((a, p) => a + p[1], 0) / outer.length;
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [px, py] of outer) {
    const x = px - mx, y = py - my, z = x * x + y * y;
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sxz += x * z; syz += y * z; sz += z;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, outer.length]], b = [-sxz, -syz, -sz];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det(M);
  if (Math.abs(d0) < 1e-9) return null;
  const col = c => M.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)));
  const [D, E, F] = [0, 1, 2].map(c => det(col(c)) / d0);
  const r1 = Math.sqrt(Math.max(0, D * D / 4 + E * E / 4 - F)), cx = mx - D / 2, cy = my - E / 2;
  if (!(r1 > 2 && r1 < 80) || inside(ring, cx, cy)) return null;
  // its outer corners on that circle, the rest on one inside it: a curved band, not any long shape
  const onHull = new Set(hull.map(p => p.join()));
  const dOut = outer.map(([x, y]) => Math.hypot(x - cx, y - cy)), dIn = ring.filter(p => !onHull.has(p.join())).map(([x, y]) => Math.hypot(x - cx, y - cy));
  if (dIn.length < 3 || Math.max(...dOut) - Math.min(...dOut) > 0.5 || Math.max(...dIn) - Math.min(...dIn) > 0.5) return null;
  const r0 = Math.min(...dIn);
  if (r0 >= r1 - 0.5) return null;
  // the angles it spans: all but the widest gap between its corners' angles
  const as = ring.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((p, q) => p - q);
  let gap = as[0] + 2 * Math.PI - as[as.length - 1], at = 0;
  for (let i = 1; i < as.length; i++) if (as[i] - as[i - 1] > gap) { gap = as[i] - as[i - 1]; at = i; }
  const a0 = as[at], a1 = at === 0 ? as[as.length - 1] : as[at - 1] + 2 * Math.PI;
  return a1 - a0 < Math.PI ? { cx, cy, r0, r1, a0, a1 } : null;
}

// The rectangle round some points, along (ux, uy) and across it.
function extent(pts, ux, uy) {
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, y] of pts) {
    const u = x * ux + y * uy, v = y * ux - x * uy;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { cx: cu * ux - cv * uy, cy: cu * uy + cv * ux, w: u1 - u0, h: v1 - v0, ux, uy };
}

// A frame's four corners.
export function cornersOf(F) {
  const a = F.w / 2, c = F.h / 2, { cx, cy, ux, uy } = F;
  return [[cx - a * ux + c * uy, cy - a * uy - c * ux], [cx + a * ux + c * uy, cy + a * uy - c * ux],
          [cx + a * ux - c * uy, cy + a * uy + c * ux], [cx - a * ux - c * uy, cy - a * uy + c * ux]];
}

function hullOf(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

function boundsOf(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

function pathOf(rings) {
  const p = new Path2D();
  for (const rg of rings) {
    if (rg.length < 3) continue;
    p.moveTo(rg[0][0], rg[0][1]);
    for (let i = 1; i < rg.length; i++) p.lineTo(rg[i][0], rg[i][1]);
    p.closePath();
  }
  return p;
}

export function inside(ring, x, y) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Where a shape's label goes, and how much room it has there: the widest interior point on a
// coarse grid, then how far the shape runs from it left, right, up and down.
function labelBox(ring, b) {
  const W = b.x1 - b.x0, H = b.y1 - b.y0;
  let cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  if (!inside(ring, cx, cy) || ring.length > 5) {
    let best = -1;
    const N = 9;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const x = b.x0 + W * i / N, y = b.y0 + H * j / N;
      if (!inside(ring, x, y)) continue;
      const d = edgeDistance(ring, x, y);
      if (d > best) { best = d; cx = x; cy = y; }
    }
  }
  const run = (dx, dy) => {
    let t = 0;
    const step = Math.max(W, H) / 60 || 0.1;
    while (t < Math.max(W, H) && inside(ring, cx + dx * (t + step), cy + dy * (t + step))) t += step;
    return t;
  };
  let w = 2 * Math.min(run(1, 0), run(-1, 0)), h = 2 * Math.min(run(0, 1), run(0, -1));
  // the runs from the middle say nothing of the box's corners: in a turned or slanted room (Toh
  // Tuck's) they stood outside it, and a name set in the box ran over the walls; the box shrinks
  // until its corners are in the room too
  const fits = () => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inside(ring, cx + a * w * 0.49, cy + b * h * 0.49));
  for (let k = 0; k < 14 && w > 0.5 && h > 0.5 && !fits(); k++) { w *= 0.9; h *= 0.9; }
  return { lx: cx, ly: cy, lw: w, lh: h };
}

function edgeDistance(ring, x, y) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return best;
}

// A bridge drawn whole. The Toh Tuck sheet draws its deck from Pod G to the sheet's edge, some metres
// short of the Lakeside door (the floors' bridge connector is that gap): with both floors drawn
// together, the deck is carried on, straight, to the door of its Lakeside partner, its end square to
// it and widened enough to take the door in where the two sheets' placements disagree (L3: a metre).
function joinBridges(floors) {
  for (const B of floors) {
    for (const A of B.partners) {
      const door = A.portals.find(p => p.type === 'bridge' && B.portalById.has(p.id));
      const k = door ? B.features.findIndex(ft => ft.kind === 'bridge-deck') : -1;
      if (k < 0 || A.building === 'tohtuck') continue;
      const ring = B.features[k].ring, n = ring.length, D = [door.x, door.y];
      // the deck's end nearest the door: its two corners there, and the edges running back from them
      const near = ring.map((q, i) => i).sort((i, j) => dist(ring[i], D) - dist(ring[j], D)).slice(0, 2);
      if ((near[0] - near[1] + n) % n !== 1 && (near[1] - near[0] + n) % n !== 1) continue;   // not one edge: leave it
      const back = i => { const a = ring[(i + 1) % n], b = ring[(i + n - 1) % n]; return near.includes((i + 1) % n) ? b : a; };
      const dir = near.map(i => unit([ring[i][0] - back(i)[0], ring[i][1] - back(i)[1]]));
      const u = unit([dir[0][0] + dir[1][0], dir[0][1] + dir[1][1]]), w = [-u[1], u[0]];
      // each corner on along the deck's line (its edges are drawn a little splayed: carried on, the
      // deck would taper) to where the door stands
      const end = near.map(i => {
        const t = (D[0] - ring[i][0]) * u[0] + (D[1] - ring[i][1]) * u[1];
        return [ring[i][0] + t * u[0], ring[i][1] + t * u[1]];
      });
      // across the deck, the door inside it with 0.6 m to spare
      const side = q => (q[0] - D[0]) * w[0] + (q[1] - D[1]) * w[1];
      const [lo, hi] = side(end[0]) < side(end[1]) ? [0, 1] : [1, 0];
      if (side(end[lo]) > -0.6) end[lo] = [end[lo][0] - (side(end[lo]) + 0.6) * w[0], end[lo][1] - (side(end[lo]) + 0.6) * w[1]];
      if (side(end[hi]) < 0.6) end[hi] = [end[hi][0] + (0.6 - side(end[hi])) * w[0], end[hi][1] + (0.6 - side(end[hi])) * w[1]];
      // and its end along the wall it comes in through (the corridor's edge its middle crosses), not
      // square to the deck: square, it stuck a wedge into the corridor where the two met at a slant
      const mid = [(end[0][0] + end[1][0]) / 2, (end[0][1] + end[1][1]) / 2], cross = (a, b) => a[0] * b[1] - a[1] * b[0];
      let wall = null;
      for (const rg of A.walkOuters) {
        for (let i = 0; i < rg.length; i++) {
          const p = rg[i], q = rg[(i + 1) % rg.length], e = [q[0] - p[0], q[1] - p[1]], den = cross(u, e);
          if (Math.abs(den) < 1e-9) continue;
          const r = [p[0] - mid[0], p[1] - mid[1]], s = cross(r, e) / den, f = cross(r, u) / den;
          if (f >= 0 && f <= 1 && Math.abs(s) < 2.5 && (!wall || Math.abs(s) < Math.abs(wall.s))) wall = { s, p, e };
        }
      }
      if (wall && Math.abs(cross(u, unit(wall.e))) > 0.5) {
        for (let m = 0; m < 2; m++) {
          const r = [wall.p[0] - end[m][0], wall.p[1] - end[m][1]], s = cross(r, wall.e) / cross(u, wall.e) + 0.05;
          end[m] = [end[m][0] + s * u[0], end[m][1] + s * u[1]];
        }
      }
      // the deck's ring with those two corners carried on (the edge between them is the new end)
      const out = [];
      for (let i = 0; i < n; i++) {
        const m = near.indexOf(i);
        if (m < 0) { out.push(ring[i]); continue; }
        // walking the ring, the corner's own edge back comes first or last: keep the order round
        const after = near.includes((i + 1) % n);
        if (after) out.push(ring[i], end[m]); else out.push(end[m], ring[i]);
      }
      // (the wall where the deck meets the building: map.js draws the deck again over both floors)
      // (the old corners stay as points along the carried-on edges: straight, so they draw as nothing)
      const ft = B.features[k];
      B.features[k] = Object.assign(B.makeShape(ft.id, ft.label, out.filter((q, i) => i === 0 || dist(q, out[i - 1]) > 1e-6)),
        { kind: ft.kind, walkable: ft.walkable });
      areaOf(B.features[k], door.id, u, [A, B]);
    }
  }
}

// A bridge is a place you walk across, not a point: its area (the deck; the zebra crossing for the
// covered walkway at grade) carries its portal's id, the middle of it and which way it runs, so the
// map names it there and a tap anywhere on it picks it.
function areaOf(ft, id, u, floors = []) {
  // picked or routed to, a bridge is its deck, tinted and outlined like a room
  for (const g of floors) { const p = g.portalById.get(id); if (p) p.area = ft; }
  let a = 0, cx = 0, cy = 0;
  const r = ft.ring;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const c = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += c; cx += (r[j][0] + r[i][0]) * c; cy += (r[j][1] + r[i][1]) * c;
  }
  ft.bridge = id;
  ft.mid = Math.abs(a) > 1e-9 ? [cx / (3 * a), cy / (3 * a)] : [(ft.bbox.x0 + ft.bbox.x1) / 2, (ft.bbox.y0 + ft.bbox.y1) / 2];
  ft.axis = u || ((ft.bbox.x1 - ft.bbox.x0) >= (ft.bbox.y1 - ft.bbox.y0) ? [1, 0] : [0, 1]);
}

// The covered walkway has no deck: its area is the crossing by its Lakeside door. A bridge left with
// no area at all is a seam where two sheets meet at grade (directions.js seam()): no place, no marker.
function walkwayAreas(floors) {
  for (const A of floors) {
    if (A.building === 'tohtuck') continue;
    for (const p of A.portals) {
      if (p.type !== 'bridge' || A.features.some(ft => ft.bridge === p.id)) continue;
      if (A.partners.some(B => B.features.some(ft => ft.bridge === p.id))) continue;
      // the crossing its door is at (within 3 m of it), and no other bridge's: the seam south of the
      // pool deck (BRIDGE-11, 1 Nov 2026), 19 m from the walkway's zebra, once took that as its own
      const off = q => Math.hypot(Math.max(q.bbox.x0 - p.x, 0, p.x - q.bbox.x1), Math.max(q.bbox.y0 - p.y, 0, p.y - q.bbox.y1));
      const ft = A.features.filter(q => q.kind === 'crossing' && !q.bridge && off(q) <= 3).sort((a, b) => off(a) - off(b))[0];
      if (ft) areaOf(ft, p.id, undefined, [A, ...A.partners]);
    }
  }
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function unit(v) { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }

// The rings' edges by band of h metres down the floor, each in every band its ends span, as [xi, yi, xj, yj]
// (ring[i] and the corner before it, as inside() takes them): see Floor.inWalk.
function edgeBands(rings, h = 1) {
  let y0 = Infinity, y1 = -Infinity;
  for (const rg of rings) for (const p of rg) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  if (!(y1 >= y0)) return { y0: 0, h, bands: [] };
  const lists = Array.from({ length: Math.floor((y1 - y0) / h) + 1 }, () => []);
  for (const rg of rings) {
    for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) {
      const [xi, yi] = rg[i], [xj, yj] = rg[j];
      for (let b = Math.floor((Math.min(yi, yj) - y0) / h); b <= Math.floor((Math.max(yi, yj) - y0) / h); b++) lists[b].push(xi, yi, xj, yj);
    }
  }
  return { y0, h, bands: lists.map(l => Float64Array.from(l)) };
}

// Where a correction shears the floor -- moves a corridor metres further than the rooms beside it -- a route
// that turns there came out going on past its turn and back: "down the corridor, then east to the toilets"
// drawn as "down the corridor too far, back up, then east" (owner, 3 Nov: by L4's KB toilets, "and in
// multiple places"). A walk the engine found never doubles back, so a stretch that doubles back on the map
// (it comes back to within 2.5 m of where it left, its ends far closer than its length) but runs on in the
// sheet (a turn at most, not a hairpin) is the correction's doing: it is drawn straight across. (A jog,
// where a correction offsets one side of a seam, does not come back: it stays, rather than a diagonal
// through the room on the corner -- L3's LKS-305 by block-south-L3's west edge.)
function unspur(view, base) {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const keep = [0];
  for (let i = 0; i < view.length - 1;) {
    let to = i + 1, vl = 0, bl = 0;
    for (let j = i + 1; j < view.length && vl <= 15; j++) {
      vl += d(view[j - 1], view[j]); bl += d(base[j - 1], base[j]);
      if (j - i >= 2 && vl > 2 && d(view[i], view[j]) < Math.min(2.5, 0.45 * vl) && d(base[i], base[j]) > 0.6 * bl) to = j;
    }
    keep.push(to);
    i = to;
  }
  return keep.map(k => view[k]);
}

// Toh Tuck's sheets are scaled to metres but sit at their own offsets: line each floor up on the
// stairs it shares with TT_L2 (the median offset, so one stair drawn a little off cannot drag it).
function stackTohTuck(floors) {
  const tt = floors.filter(f => !f.campus);
  const ref = tt.find(f => f.id === 'TT_L2') || tt[0];
  if (!ref) return;
  const centres = f => {
    const out = {};
    for (const s of f.data.staircases || []) {
      const pts = s.vertices.map(v => f.view(v.x, v.y));
      out[s.id] = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    }
    return out;
  };
  const R = centres(ref);
  for (const f of tt) {
    if (f === ref) continue;
    const C = centres(f);
    const dx = [], dy = [];
    for (const k in C) if (R[k]) { dx.push(R[k][0] - C[k][0]); dy.push(R[k][1] - C[k][1]); }
    if (!dx.length) continue;
    f.T[2] += median(dx); f.T[5] += median(dy);
  }
}

function median(a) {
  const s = [...a].sort((x, y) => x - y), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
