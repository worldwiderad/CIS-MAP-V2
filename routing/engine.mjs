// CIS-MAP routing engine: finds a walking route between two places on the campus.
//
// It runs in the browser or in Node, on the network tools/routing/build.mjs makes from the
// evacuation map (data/<F>_evac/) and the zones file (data/zones_evac.json):
//
//   import { Router } from './engine.mjs';
//   const r = new Router(graphJson);
//   const route = r.route('L3:KB-305', 'L5:BT-508');            // or { stepFree: true }
//   route.metres, route.seconds, route.legs[i].points, route.steps
//
// How a route is chosen: every stretch of floor has a PRICE, and the route is the cheapest
// chain from start to end. The price is the walking distance, raised near walls (so corridors
// are walked down the middle), raised on floor the trip should avoid (the other section, a
// toll such as the library) and infinite on a closed gate. Stairs and lifts are priced by the
// time they take. The distance and time a route reports are always the REAL ones: a toll
// changes which way the route goes, never how far it says it is.

const SECTIONS = ['shared', 'primary', 'secondary'];

// Drops points that stray less than tol px from the line through their neighbours: the joins
// between network edges leave pixel-sized wobbles that would show once the app rounds corners.
function simplify(pts, tol = 1.5) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const topK = k[0], topV = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topK;
    return topV;
  }
}

export class Router {
  constructor(g) {
    this.g = g;
    this.travel = g.travel;
    this.rules = g.rules;
    const N = g.nodes.floor.length, P = g.portals.length;
    this.N = N; this.P = P;
    // Graph nodes: 0..N-1 are places on a floor (spine points and door points). Each door
    // (portal) k also gets three virtual nodes, so a door is never walked THROUGH on its own
    // floor: IN (arrive at the door), OUT (leave from it), SHAFT (inside a stair/lift/bridge).
    this.IN = k => N + 3 * k; this.OUT = k => N + 3 * k + 1; this.SHAFT = k => N + 3 * k + 2;
    const total = N + 3 * P;
    const adj = Array.from({ length: total }, () => []);
    const portalAt = new Map(g.portals.map((p, k) => [p.node, k]));
    this.portalAt = portalAt;
    // floor edges: [kind 0, edge index, forward?]
    g.edges.forEach((e, i) => {
      const pa = portalAt.get(e.a), pb = portalAt.get(e.b);
      const from = n => (portalAt.has(n) ? this.OUT(portalAt.get(n)) : n);
      const to = n => (portalAt.has(n) ? this.IN(portalAt.get(n)) : n);
      adj[from(e.a)].push([0, i, 1, to(e.b)]);
      adj[from(e.b)].push([0, i, 0, to(e.a)]);
      void pa; void pb;
    });
    g.portals.forEach((p, k) => {
      if (p.connector) {
        adj[this.IN(k)].push([2, k, 1, this.SHAFT(k)]);    // step into the stair / lift / bridge
        adj[this.SHAFT(k)].push([2, k, 0, this.OUT(k)]);   // step out onto the floor
      }
    });
    g.links.forEach((l, i) => {
      adj[this.SHAFT(l.a)].push([1, i, 1, this.SHAFT(l.b)]);
      adj[this.SHAFT(l.b)].push([1, i, 0, this.SHAFT(l.a)]);
    });
    this.adj = adj;
    this.dest = g.dest;
    this.floorOf = g.floors.map(f => f.id);
  }

  // All places a route can start or end at: [{key, label, floor, section}]
  places() {
    return Object.entries(this.dest).map(([key, d]) => ({ key, label: d.label, floor: d.floor, section: d.section }));
  }

  // 'KB-305' -> 'L3:KB-305' when the id is on one floor only.
  resolve(q) {
    if (this.dest[q]) return q;
    const hits = Object.keys(this.dest).filter(k => k.split(':')[1] === q);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`"${q}" is on several floors: ${hits.join(', ')}`);
    throw new Error(`no place "${q}"`);
  }

  // What a trip is allowed to do, decided from its two ends.
  rulesFor(a, b, opts = {}) {
    const g = this.g, A = this.dest[a], B = this.dest[b];
    const secs = new Set([A.section, B.section]); secs.delete('shared');
    let avoid = null;
    if (opts.sections !== false) {
      if (secs.size === 1) avoid = secs.has('primary') ? 'secondary' : 'primary';
    }
    const open = new Set([...(A.opens || []), ...(B.opens || []), ...(opts.open || [])]);
    const bldA = g.floors[A.floor].building, bldB = g.floors[B.floor].building;
    g.gates.forEach((gt, i) => {
      const bs = (gt.opensFor && gt.opensFor.buildings) || [];
      if (bs.includes(bldA) || bs.includes(bldB)) open.add(i);
    });
    const mult = g.classes.map(([sec, gate, toll, steps, strong]) => {
      let m = 1;
      if (avoid && SECTIONS[sec] === avoid) m *= strong ? (g.rules.sectionAvoidStrong || g.rules.sectionAvoid) : g.rules.sectionAvoid;
      if (toll && opts.tolls !== false) m *= toll;   // (tolls: false, to see what a toll changes)
      if (gate && !open.has(gate - 1)) m = Infinity;
      if (steps && opts.stepFree) m = Infinity;
      return m;
    });
    return { avoid, open: [...open].map(i => g.gates[i].id), openIdx: open, mult, stepFree: !!opts.stepFree };
  }

  edgePrice(e, mult) {
    let p = 0;
    for (const [c, cost] of e.c) {
      const m = mult[c];
      if (m === Infinity) return Infinity;
      p += cost * m;
    }
    return p;
  }

  // Seconds a connector link takes in one direction (forward = a -> b), or Infinity.
  linkSeconds(l, forward, stepFree) {
    const t = this.travel, rise = forward ? l.rise : -l.rise;
    if (l.kind === 'stair') {
      if (Math.abs(rise) < 0.05) return t.landingSeconds;
      if (stepFree) return Infinity;
      return rise > 0 ? rise * t.stairUpSecondsPerMetre : -rise * t.stairDownSecondsPerMetre;
    }
    if (l.kind === 'elevator') return t.liftWaitSeconds + Math.abs(rise) * t.liftSecondsPerMetre;
    if (l.kind === 'bridge') return l.length / t.walkSpeed;
    return Infinity;
  }

  route(from, to, opts = {}) {
    const a = this.resolve(from), b = this.resolve(to);
    const R = this.rulesFor(a, b, opts);
    const g = this.g, t = this.travel;
    const total = this.adj.length;
    const dist = new Float64Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const via = new Array(total);
    const heap = new Heap();
    for (const k of this.dest[a].portals) {
      for (const n of g.portals[k].connector ? [this.OUT(k), this.SHAFT(k)] : [this.OUT(k)]) {
        dist[n] = 0; heap.push(0, n);
      }
    }
    const targets = new Set();
    for (const k of this.dest[b].portals) {
      targets.add(this.IN(k));
      if (g.portals[k].connector) targets.add(this.SHAFT(k));
    }
    const priceCache = new Float64Array(g.edges.length).fill(-1);
    let hit = -1;
    while (heap.size) {
      const n = heap.pop(), d = heap.lastKey;
      if (d > dist[n]) continue;
      if (targets.has(n)) { hit = n; break; }
      for (const arc of this.adj[n]) {
        const [kind, i, fwd, m] = arc;
        let p;
        if (kind === 0) {
          p = priceCache[i];
          if (p < 0) p = priceCache[i] = this.edgePrice(g.edges[i], R.mult);
        } else if (kind === 1) {
          p = this.linkSeconds(g.links[i], fwd === 1, R.stepFree) * t.walkSpeed;
        } else p = 0;
        if (p === Infinity) continue;
        const nd = d + p;
        if (nd < dist[m]) { dist[m] = nd; prev[m] = n; via[m] = arc; heap.push(nd, m); }
      }
    }
    if (hit < 0) return { ok: false, from: a, to: b, rules: this._rulesOut(R), reason: 'no route under these rules' };
    const arcs = [];
    for (let n = hit; prev[n] >= 0; n = prev[n]) arcs.push(via[n]);
    arcs.reverse();
    return this._describe(a, b, arcs, dist[hit], R);
  }

  _rulesOut(R) {
    return { avoidSection: R.avoid, gatesOpen: R.open, stepFree: R.stepFree };
  }

  _describe(a, b, arcs, price, R) {
    const g = this.g, t = this.travel;
    const legs = [], steps = [];
    let metres = 0, seconds = 0, walk = null;
    const zoneMetres = {};
    for (const [kind, i, fwd] of arcs) {
      if (kind === 0) {
        const e = g.edges[i];
        const floor = g.nodes.floor[e.a];
        if (!walk || walk.floorIdx !== floor) {
          walk = { type: 'walk', floor: g.floors[floor].id, floorIdx: floor, metres: 0, points: [] };
          steps.push(walk); legs.push(walk);
        }
        const pts = [];
        for (let j = 0; j < e.pts.length; j += 2) pts.push([e.pts[j], e.pts[j + 1]]);
        if (!fwd) pts.reverse();
        for (const p of pts) {
          const q = walk.points[walk.points.length - 1];
          if (!q || q[0] !== p[0] || q[1] !== p[1]) walk.points.push(p);
        }
        walk.metres += e.m; metres += e.m;
        for (const [c, , m] of e.c) {
          const [sec, gate, toll] = g.classes[c];
          const key = gate ? `gate:${g.gates[gate - 1].id}` : toll ? `toll:x${toll}` : `section:${SECTIONS[sec]}`;
          zoneMetres[key] = (zoneMetres[key] || 0) + m;
        }
      } else if (kind === 1) {
        walk = null;
        const l = g.links[i];
        const s = this.linkSeconds(l, fwd === 1, R.stepFree);
        const pa = g.portals[fwd ? l.a : l.b], pb = g.portals[fwd ? l.b : l.a];
        const rise = fwd ? l.rise : -l.rise;
        if (l.kind === 'bridge') metres += l.length; else seconds += s;
        const last = steps[steps.length - 1];
        // a stair walked through several floors is one step: "up 2 floors"
        if (last && last.type === l.kind && last.id === pa.id && last.toFloor === g.floors[pa.floor].id
            && Math.sign(last.rise || rise) === Math.sign(rise || last.rise)) {
          last.toFloor = g.floors[pb.floor].id; last.rise += rise; last.seconds += s;
          if (Math.abs(rise) > 0.05) last.flights++;
        } else {
          steps.push({ type: l.kind, id: pa.id, label: pa.label, fromFloor: g.floors[pa.floor].id,
                       toFloor: g.floors[pb.floor].id, rise, seconds: s, flights: Math.abs(rise) > 0.05 ? 1 : 0,
                       metres: l.kind === 'bridge' ? l.length : 0 });
        }
      }
    }
    seconds += metres / t.walkSpeed;
    const round = s => (s.type === 'walk'
      ? { type: 'walk', floor: s.floor, metres: Math.round(s.metres) }
      : { ...s, rise: Math.round(s.rise * 100) / 100, seconds: Math.round(s.seconds) });
    return {
      ok: true, from: a, to: b,
      fromLabel: this.dest[a].label, toLabel: this.dest[b].label,
      metres: Math.round(metres), seconds: Math.round(seconds), price: Math.round(price),
      legs: legs.map(L => ({ floor: L.floor, metres: Math.round(L.metres), points: simplify(L.points) })),
      steps: steps.map(round),
      zones: Object.fromEntries(Object.entries(zoneMetres).map(([k, v]) => [k, Math.round(v)])),
      rules: this._rulesOut(R),
    };
  }
}

// Plain-language directions for a route: ["Walk 40 m on L3", "Take Stairs 7 up 2 floors to L5", ...]
export function directions(route) {
  if (!route.ok) return [`No route from ${route.from} to ${route.to}: ${route.reason}.`];
  const lines = [];
  for (const s of route.steps) {
    if (s.type === 'walk') { if (s.metres > 0) lines.push(`Walk ${s.metres} m on ${s.floor}`); continue; }
    const name = (s.label && s.label.en) || s.id;
    if (s.type === 'bridge') { lines.push(`Cross the ${name} to ${s.toFloor} (${Math.round(s.metres)} m)`); continue; }
    if (!s.flights) { lines.push(`Through the ${name} landing onto ${s.toFloor}`); continue; }
    const dir = s.rise > 0 ? 'up' : 'down';
    lines.push(s.type === 'elevator'
      ? `Take ${name} ${dir} to ${s.toFloor}`
      : `Take ${name} ${dir} ${s.flights === 1 ? '1 floor' : s.flights + ' floors'} to ${s.toFloor}`);
  }
  return lines;
}
