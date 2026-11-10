// The map as a model, for the pages about the app (the slideshow's title, the homepage): the app's own
// drawing of a floor (app/map.js, app/floors.js), tilted as if seen from 38 degrees above, its walls
// raised to waist height so the rooms still show, the floor plate lifted off the page on its own
// shadow. The route is a real one, worked out by the app's router when the page loads, so it is
// always the map as it is now.
import { loadFloors, getJSON, useRouting } from './floors.js';
import { MapView, smoothLine } from './map.js';
import { Router } from '../routing/engine.mjs';

// the data is beside app/, wherever the page that shows the model is
const ROOT = new URL('../', import.meta.url).href;
const TILT = 0.62;        // a metre across the floor, on the screen, for a metre along it (sin of the 38 degrees)
const RISE = 0.78;        // a metre up, on the screen (cos 38)
const WALL = 1.25;        // metres: the walls are cut low, like a model's, so the rooms behind them show
const SLAB = 0.7;         // metres: the floor plate's edge under the walls
const WALL_IN = 0.18;     // metres: the wall the app draws inside each room's edge (map.js WALL_IN)
// the model's own colours (the floor and the labels are the app's, light or dark as the phone is): the
// slideshow is always light; the homepage follows the phone
const LIGHT = { top: '#8693A2', side: '#646F7D', plate: '#C9CFD6', drop: 'rgba(28,36,48,0.22)', foot: 'rgba(28,36,48,0.28)',
  casing: 'rgba(255,255,255,0.96)', dash: 'rgba(255,255,255,0.6)', glow: 'rgba(218,41,28,0.18)', ring: '#fff' };
const DARK = { top: '#78828F', side: '#3E4651', plate: '#2C3138', drop: 'rgba(0,0,0,0.5)', foot: 'rgba(0,0,0,0.5)',
  casing: 'rgba(20,23,27,0.95)', dash: 'rgba(255,255,255,0.6)', glow: 'rgba(255,128,115,0.22)', ring: '#14171B' };

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// a picture's shape in one colour (a wall's side, its top, the plate's edge)
function tint(src, color) {
  const c = canvasOf(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

class Model extends MapView {
  get P() { return this.dark ? DARK : LIGHT; }
  setDark(dark) { if (this.dark === !!dark) return; this.dark = !!dark; this.layers = null; this.redraw(); }
  // (the labels are drawn once, with the rest that does not move: a new language draws them again)
  setLang(lang) { this.layers = null; super.setLang(lang); }
  // the stage is scaled to the window: the canvas is drawn at the pixels it is shown at
  resize() {
    const wrap = this.canvas.parentElement, w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    // (the box is drawn small and scaled up, --zoom, so the app's labels and lines read across a room)
    const zoom = parseFloat(getComputedStyle(wrap).getPropertyValue('--zoom')) || 1;
    const k = Math.min(3, (window.devicePixelRatio || 1) * zoom * (this.stageScale ? this.stageScale() : 1));
    this.dpr = Math.max(1, k); this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.layers = null;
    if (this.view) this.aim();
    this.redraw();
  }

  // the view: the plan turned by `turn` about the trip's middle and squashed in depth, the trip
  // fitted into the box given (fractions of the canvas)
  aim() {
    const { turn, line, box } = this.view, c = Math.cos(turn), s = Math.sin(turn);
    const rx = ([x, y]) => c * x - s * y, ry = ([x, y]) => TILT * (s * x + c * y);
    const xs = line.map(rx), ys = line.map(ry);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const W = this.w * (box[2] - box[0]), H = this.h * (box[3] - box[1]);
    const k = Math.min(W / bw, H / bh);
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
    const ox = this.w * (box[0] + box[2]) / 2 - k * mx, oy = this.h * (box[1] + box[3]) / 2 - k * my;
    this.m = { a: k * c, b: k * TILT * s, c: -k * s, d: k * TILT * c, e: ox, f: oy };
    this.cam.s = k;           // the app's detail follows the zoom: doors, treads, which labels
  }
  toScreen(x, y) { const m = this.m; return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; }
  toWorld(px, py) {
    const m = this.m, det = m.a * m.d - m.b * m.c, x = px - m.e, y = py - m.f;
    return [(m.d * x - m.c * y) / det, (m.a * y - m.b * x) / det];
  }
  world(ctx) { const m = this.m, k = this.dpr; ctx.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k); }

  // The names go on floor that shows. The app places a name by its room seen flat from above; here the
  // plan is tilted and turned and its walls stand up over the floor, so a name that "fitted" ran onto
  // the walls, under the start and off the edge (owner, 10 Nov 2026). What hides the floor, in screen
  // pixels: every wall from its foot to its top, the route's line as drawn, and a margin round the
  // picture (wider where the page lays a fade over it: `inset`).
  shade(walls) {
    const w = Math.ceil(this.w), h = Math.ceil(this.h), c = canvasOf(w, h), g = c.getContext('2d', { willReadFrequently: true });
    const up = WALL * this.cam.s * RISE;
    for (let i = 0; i <= Math.ceil(up); i++) g.drawImage(walls, 0, -Math.min(i, up), w, h);
    const pts = this.view.line.map(([x, y]) => this.toScreen(x, y));
    g.lineJoin = g.lineCap = 'round'; g.lineWidth = 19; g.strokeStyle = '#000';
    g.beginPath(); g.moveTo(...pts[0]); for (const q of pts.slice(1)) g.lineTo(...q); g.stroke();
    const a = g.getImageData(0, 0, w, h).data, [t, r, b, l] = this.labelInset ? this.labelInset(this.w, this.h) : [0, 0, 0, 0];
    const blocked = new Uint8Array(w * h), sum = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const off = x < 6 + l || x >= w - 6 - r || y < 6 + t || y >= h - 6 - b || a[(y * w + x) * 4 + 3] > 40 ? 1 : 0;
        blocked[y * w + x] = off; row += off;
        sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
      }
    }
    this.occ = { w, h, blocked, sum };
  }
  // a box nothing hides, wholly in the picture
  labelClear([x0, y0, x1, y1]) {
    const o = this.occ;
    if (!o) return true;
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
    if (x0 < 0 || y0 < 0 || x1 > o.w || y1 > o.h || x1 <= x0 || y1 <= y0) return false;
    const W = o.w + 1, S = o.sum;
    return S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0] === 0;
  }
  // A room's name: in the biggest upright box of its floor that shows (as wide as a name needs, as
  // tall as two lines; past that, the one nearest the middle of what shows), or none.
  labelSpot(r) {
    const o = this.occ;
    if (!o) return super.labelSpot(r);
    const cs = [[r.bbox.x0, r.bbox.y0], [r.bbox.x1, r.bbox.y0], [r.bbox.x0, r.bbox.y1], [r.bbox.x1, r.bbox.y1]].map(p => this.toScreen(...p));
    const x0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[0])))), x1 = Math.min(o.w, Math.ceil(Math.max(...cs.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...cs.map(p => p[1])))), y1 = Math.min(o.h, Math.ceil(Math.max(...cs.map(p => p[1]))));
    const w = x1 - x0, h = y1 - y0;
    if (w < 10 || h < 8) return null;
    const c = this.scratch ||= canvasOf(256, 256);
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    const g = c.getContext('2d', { willReadFrequently: true }), m = this.m;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0); g.fillStyle = '#000'; g.fill(r.path);
    const a = g.getImageData(0, 0, w, h).data, free = new Uint8Array(w * h);
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a[(y * w + x) * 4 + 3] > 160 && !o.blocked[(y + y0) * o.w + x + x0]) { free[y * w + x] = 1; sx += x; sy += y; n++; }
    }
    if (n < 60) return null;
    const mx = sx / n, my = sy / n, hts = new Int32Array(w);
    let best = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) hts[x] = free[y * w + x] ? hts[x] + 1 : 0;
      // every box standing on this row as tall as its columns allow (a stack over the heights)
      const st = [];
      for (let x = 0; x <= w; x++) {
        const ht = x < w ? hts[x] : 0;
        let from = x;
        while (st.length && st[st.length - 1][1] >= ht) {
          const [sx0, bh] = st.pop(), bw = x - sx0;
          from = sx0;
          if (bw < 8 || bh < 6) continue;
          const score = Math.min(bw, 110) * Math.min(bh, 44), cx = sx0 + bw / 2, cy = y - bh / 2 + 0.5;
          const dist = Math.hypot(cx - mx, cy - my);
          if (!best || score > best.score + 0.5 || (score > best.score - 0.5 && dist < best.dist)) best = { score, dist, cx, cy, bw, bh };
        }
        st.push([from, ht]);
      }
    }
    return best ? [x0 + best.cx, y0 + best.cy, best.bw, best.bh] : null;
  }

  // the app's drawing onto a canvas of our own (it draws on this.ctx)
  onto(canvas, fn) { const keep = this.ctx; this.ctx = canvas.getContext('2d'); try { fn(); } finally { this.ctx = keep; } }

  // What does not move, drawn once: the plate, its floors, the walls raised; and the labels.
  build() {
    const W = this.canvas.width, H = this.canvas.height, level = this.shown(), d = this.dpr;
    const floor = canvasOf(W, H);
    this.onto(floor, () => { for (const g of level) this.drawFloor(g); if (level.length > 1) for (const g of level) this.drawDecks(g); });
    // the walls as the app shows them: the footprint, less every floor, room and door way, plus the wall
    // drawn inside each room's edge
    const walls = canvasOf(W, H), w = walls.getContext('2d');
    this.world(w);
    for (const f of level) {
      w.save();
      if (f.clipPath) w.clip(f.clipPath);
      w.fillStyle = w.strokeStyle = '#000';
      if (f.footprint) w.fill(f.footprint);
      w.globalCompositeOperation = 'destination-out'; w.lineWidth = 0.6;                   // (map.js: no walls out of doors)
      for (const ft of f.features) if (ft.outdoor) { w.fill(ft.path); w.stroke(ft.path); }
      w.globalCompositeOperation = 'source-over';
      w.lineJoin = 'miter'; w.miterLimit = 2; w.lineWidth = 0.5; w.stroke(f.outline);     // (map.js OUTER_WALL)
      w.globalCompositeOperation = 'destination-out';
      for (const p of [f.pockets, f.ground, f.walk, this.doorWays(f)]) if (p) w.fill(p);
      w.lineWidth = 0.6; for (const p of f.softFloor || []) { w.fill(p); w.stroke(p); }
      // (and every feature the app paints over the wall colour: a void or light well is a hole in the floor,
      // a shaft or a store a box; only a parapet is a wall)
      for (const ft of f.features) if (ft.kind !== 'parapet' && ft.kind !== 'divider' && ft.path) w.fill(ft.path);
      for (const r of f.rooms) w.fill(r.blockPath || r.path);
      w.globalCompositeOperation = 'source-over';
      w.save(); w.clip(f.roomEdges); w.lineWidth = 2 * WALL_IN; w.stroke(f.roomEdges); w.restore();
      // (and opened at each door, where the app's paintDoors opens it: left in, a door read as a sliver of wall)
      const px = 1 / this.cam.s;
      w.globalCompositeOperation = 'destination-out'; w.lineCap = 'butt';
      for (const dr of f.doors) {
        const ww = Math.max(2.5 * px, WALL_IN + 2 * px), o = ww / 2 - 1.2 * px, cx = dr.qx + dr.ix * o, cy = dr.qy + dr.iy * o;
        w.lineWidth = ww; w.beginPath(); w.moveTo(cx - 0.45 * dr.dx, cy - 0.45 * dr.dy); w.lineTo(cx + 0.45 * dr.dx, cy + 0.45 * dr.dy); w.stroke();
        if (dr.via) {
          const v = dr.gap + WALL_IN + 2 * px, ox = dr.qx - dr.ix * (v / 2 - 1.2 * px), oy = dr.qy - dr.iy * (v / 2 - 1.2 * px);
          w.lineWidth = v; w.beginPath(); w.moveTo(ox - 0.45 * dr.dx, oy - 0.45 * dr.dy); w.lineTo(ox + 0.45 * dr.dx, oy + 0.45 * dr.dy); w.stroke();
        }
      }
      w.globalCompositeOperation = 'source-over';
      // (and the band outside the walkable area's edges, as map.js draws it, opened at each door's way through)
      w.save(); for (const c of this.outside(f)) w.clip(c, 'evenodd');
      w.lineWidth = 2 * WALL_IN; w.stroke(f.walkEdge || f.walk);
      w.globalCompositeOperation = 'destination-out'; w.fill(this.doorWays(f));
      w.restore();
      w.restore();
    }
    const up = Math.round(WALL * this.cam.s * RISE * d), down = Math.round(SLAB * this.cam.s * RISE * d);
    const base = canvasOf(W, H), b = base.getContext('2d');
    // the plate's shadow on the page, and its edge
    const P = this.P, plate = tint(floor, P.plate);
    b.save(); b.shadowColor = P.drop; b.shadowBlur = 46 * d; b.shadowOffsetY = 34 * d;
    b.drawImage(plate, 0, down); b.restore();
    for (let i = down; i > 0; i--) b.drawImage(plate, 0, i);
    b.drawImage(floor, 0, 0);
    // the walls: a soft shadow at their feet, their sides stacked a pixel at a time, then their tops
    const side = tint(walls, P.side), top = tint(walls, P.top);
    b.save(); b.shadowColor = P.foot; b.shadowBlur = 7 * d; b.shadowOffsetY = 2 * d; b.drawImage(side, 0, 0); b.restore();
    for (let i = 0; i < up; i++) b.drawImage(side, 0, -i);
    b.drawImage(top, 0, -up);
    this.shade(walls);
    const labels = canvasOf(W, H);
    this.onto(labels, () => this.drawLabels(level));
    this.layers = { base, labels };
  }

  draw(now) {
    if (!this.m || !this.floor) return;
    if (!this.layers) this.build();
    const ctx = this.ctx, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layers.base, 0, 0);
    const p = this.progress(now);
    this.drawTrip(p, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.layers.labels, 0, 0);
    // the app's own start dot, and its pin once the line has arrived
    const R = this.route, end = R.end;
    if (p < 1) R.end = null;
    ctx.save(); ctx.globalAlpha = 1; this.drawMarkers(this.shown()); ctx.restore();
    R.end = end;
    if (this.paused) return;               // (drawn and waiting, behind the opening slide)
    if (p < 1 || (now - this.arrived < 600)) this.redraw();
    else if (!this.still) this.redraw();   // the dashes keep walking
  }

  // how far along the line is drawn, 0 to 1
  progress(now) {
    if (this.paused) return 0;
    if (this.still) return 1;
    if (this.t0 == null) this.t0 = now;
    const t = Math.min(1, Math.max(0, (now - this.t0 - 700) / 2600));
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (t >= 1 && this.arrived == null) this.arrived = now;
    return e;
  }

  // the route, as the app draws it (red, a white casing, white dashes walking along it), but wider and
  // flat to the screen, the way a line printed on the plan would read from across a room
  drawTrip(p, now) {
    const ctx = this.ctx, d = this.dpr, pts = this.view.line.map(([x, y]) => this.toScreen(x, y));
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] * p, cut = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] <= L) { cut.push(pts[i]); continue; }
      const t = (L - cum[i - 1]) / (cum[i] - cum[i - 1]);
      cut.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
      break;
    }
    if (cut.length < 2) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineJoin = ctx.lineCap = 'round';
    const line = () => { ctx.beginPath(); ctx.moveTo(...cut[0]); for (const q of cut.slice(1)) ctx.lineTo(...q); };
    const P = this.P;
    line(); ctx.strokeStyle = P.casing; ctx.lineWidth = 15; ctx.stroke();
    line(); ctx.strokeStyle = '#DA291C'; ctx.lineWidth = 9; ctx.stroke();
    const phase = this.still ? 0 : (now / 1000 * 30) % 22;
    line(); ctx.strokeStyle = P.dash; ctx.lineWidth = 2.5; ctx.setLineDash([4, 18]); ctx.lineDashOffset = -phase; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    if (p < 1) {   // the walker, at the head of the line
      const [x, y] = cut[cut.length - 1];
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = P.glow; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = '#DA291C'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = P.ring; ctx.stroke();
    }
  }

  play() { this.paused = false; this.t0 = null; this.arrived = null; this.redraw(); }
  pause() { this.paused = true; }
}

// A trip from `from` to `to` on one floor, shown turned by `turn` radians, fitted into `box`
// (turned a little, 0.15, the rooms stand nearly square to the screen and their names fit; at 0.42, as
// first drawn, the plan was a diagonal and half the rooms had too thin a strip of floor for a name)
// ([x0, y0, x1, y1], fractions of the canvas); `toName` is the name on the pin's card, or a function
// (lang, place) giving it, the place a room or a door, each with its `name`; `dark` for the dark model (setDark changes it);
// `inset(w, h)`, [top, right, bottom, left] in pixels, keeps names out of a margin the page covers.
export async function titleMap(canvas, { from, to, toName = null, turn = 0.15, box = [0.55, 0.25, 0.87, 0.78], stageScale, dark = false, inset = null } = {}) {
  const F = from.split(':')[0];
  const [campus, graph] = await Promise.all([
    new Promise(ok => { let done = false; loadFloors(ROOT, { first: [F], onLevel: (fl, c) => { if (!done && c.byId[F]) { done = true; ok(c); } } }); }),
    getJSON(ROOT + 'data/routing/graph_evac.json'),
  ]);
  useRouting(campus, graph);
  const f = campus.byId[F], rt = new Router(graph).route(from, to);
  const leg = rt.legs.find(l => l.floor === F || l.floorId === F) || rt.legs[0];
  const line = smoothLine(f.mapLine(leg.points), f);
  const view = new Model(canvas);
  view.stageScale = stageScale;
  view.dark = dark;
  view.labelInset = inset;   // (not `inset`: the map's own, the margins its panels cover)
  view.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  view.paused = true;
  view.view = { turn, line, box };
  view.setFloors(campus.byId);
  view.floor = f;
  const room = id => f.rooms.find(r => r.id === id) || null;
  view.marks = { from: { floor: f, room: room(from.split(':')[1]) }, to: { floor: f, room: room(to.split(':')[1]) }, pick: null };
  // (where the trip ends, for its name: the room, or the door of a place that has no room drawn, as the
  // Secondary Library's, LKS-304)
  const there = room(to.split(':')[1]) || f.portalById.get(to.split(':')[1]) || null;
  view.route = { floors: { [F]: [line] }, start: { floor: F, x: line[0][0], y: line[0][1] },
    end: { floor: F, x: line[line.length - 1][0], y: line[line.length - 1][1] }, changes: [],
    endName: toName ? lang => (typeof toName === 'function' ? toName(lang, there) : toName) : null };   // the app's card above the pin
  view.paths = { [F]: [line] };
  view.resize();
  return view;
}
