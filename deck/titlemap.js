// The title slide's map: the app's own drawing of a floor (app/map.js, app/floors.js), turned into a
// model. The plan is tilted as if seen from 38 degrees above, its walls raised to waist height so the
// rooms still show, the floor plate lifted off the page on its own shadow. The route is a real one,
// worked out by the app's router when the slide loads, so it is always the map as it is now.
import { loadFloors, getJSON, useRouting } from '../app/floors.js';
import { MapView, smoothLine } from '../app/map.js';
import { Router } from '../routing/engine.mjs';

const ROOT = '../';
const TILT = 0.62;        // a metre across the floor, on the screen, for a metre along it (sin of the 38 degrees)
const RISE = 0.78;        // a metre up, on the screen (cos 38)
const WALL = 1.25;        // metres: the walls are cut low, like a model's, so the rooms behind them show
const SLAB = 0.7;         // metres: the floor plate's edge under the walls
const WALL_IN = 0.18;     // metres: the wall the app draws inside each room's edge (map.js WALL_IN)
const TOP = '#8693A2', SIDE = '#646F7D', PLATE = '#C9CFD6';

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// a picture's shape in one colour (a wall's side, its top, the plate's edge)
function tint(src, color) {
  const c = canvasOf(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

class Model extends MapView {
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
    const plate = tint(floor, PLATE);
    b.save(); b.shadowColor = 'rgba(28,36,48,0.22)'; b.shadowBlur = 46 * d; b.shadowOffsetY = 34 * d;
    b.drawImage(plate, 0, down); b.restore();
    for (let i = down; i > 0; i--) b.drawImage(plate, 0, i);
    b.drawImage(floor, 0, 0);
    // the walls: a soft shadow at their feet, their sides stacked a pixel at a time, then their tops
    const side = tint(walls, SIDE), top = tint(walls, TOP);
    b.save(); b.shadowColor = 'rgba(28,36,48,0.28)'; b.shadowBlur = 7 * d; b.shadowOffsetY = 2 * d; b.drawImage(side, 0, 0); b.restore();
    for (let i = 0; i < up; i++) b.drawImage(side, 0, -i);
    b.drawImage(top, 0, -up);
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
    line(); ctx.strokeStyle = 'rgba(255,255,255,0.96)'; ctx.lineWidth = 15; ctx.stroke();
    line(); ctx.strokeStyle = '#DA291C'; ctx.lineWidth = 9; ctx.stroke();
    const phase = this.still ? 0 : (now / 1000 * 30) % 22;
    line(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 18]); ctx.lineDashOffset = -phase; ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    if (p < 1) {   // the walker, at the head of the line
      const [x, y] = cut[cut.length - 1];
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = 'rgba(218,41,28,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = '#DA291C'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }

  play() { this.paused = false; this.t0 = null; this.arrived = null; this.redraw(); }
  pause() { this.paused = true; }
}

// A trip from `from` to `to` on one floor, shown turned by `turn` radians, fitted into `box`
// ([x0, y0, x1, y1], fractions of the canvas).
export async function titleMap(canvas, { from, to, toName = null, turn = 0.42, box = [0.55, 0.25, 0.87, 0.78], stageScale } = {}) {
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
  view.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  view.paused = true;
  view.view = { turn, line, box };
  view.setFloors(campus.byId);
  view.floor = f;
  const room = id => f.rooms.find(r => r.id === id) || null;
  view.marks = { from: { floor: f, room: room(from.split(':')[1]) }, to: { floor: f, room: room(to.split(':')[1]) }, pick: null };
  view.route = { floors: { [F]: [line] }, start: { floor: F, x: line[0][0], y: line[0][1] },
    end: { floor: F, x: line[line.length - 1][0], y: line[line.length - 1][1] }, changes: [],
    endName: toName ? () => toName : null };   // the app's card above the pin
  view.paths = { [F]: [line] };
  view.resize();
  return view;
}
