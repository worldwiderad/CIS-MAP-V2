// Turn-by-turn directions from a route the engine found (routing/engine.mjs).
//
// The engine says WHERE to walk: per floor, a line of points, and the stairs, lifts and bridges
// between floors. This turns each floor's line into what a person needs: leave the room, turn
// left at Stairs 7, walk 40 m, arrive with the door on your right.
//
// Everything is measured in metres in the drawn frame (app/floors.js), where the sheets'
// stretch is undone, so an angle here is a real angle.

import { t, floorName, placeName, shortName, buildingName, nameIn } from './i18n.js';
import { inside, nearestOnRing } from './floors.js';

const TURN = 40;        // degrees: less than this is walking on, not a turn
const BEAR = 65;        // degrees: up to this is "bear left", beyond it "turn left"
const BACK = 150;       // degrees: beyond this is turning round
const MIN_RUN = 3;      // metres: a shorter stretch is a jog round something, not a new direction
const WOBBLE = 1.5;     // metres: bends smaller than this, across a corridor ~2.5 m wide, are not turns
const LAST = 5;         // metres: a turn this close to the door you are making for goes unsaid
const THEN = 6;         // metres: a second turn this soon after the first is said with it
const JOG = 12;         // metres: ... and a turn back the other way this soon ("left at Stairs 7, then right")
const SHORT_LEG = 6;    // metres: a floor walked for less than this needs no instructions but arriving
const MARK_CONNECTOR = 6, MARK_ROOM = 6, MARK_PLACE = 6;   // metres: how far a landmark may be
const LIFT_STAIR = 12, LIFT_PLACE = 20;   // metres: how far the stair (else the place) a lift is told by may be

export function routeSteps(route, campus, lang) {
  if (!route || !route.ok) return [];
  const out = [];
  const steps = route.steps;
  const ends = new Set([route.from, route.to]);
  const stepFree = !!(route.rules && route.rules.stepFree);
  // each walk's points in the drawn frame
  const legs = [];
  let li = 0;
  for (const s of steps) {
    if (s.type !== 'walk') { legs.push(null); continue; }
    const leg = route.legs[li++], floor = campus.byId[s.floor];
    legs.push(leg && leg.points.length >= 2 ? { floor, pts: leg.points.map(([x, y]) => floor.routePoint(x, y)) } : null);
  }
  // The Toh Tuck sheets draw most of the Linkway Bridge themselves, so most of a crossing is walked
  // on their floor: that stretch belongs to the crossing ("Cross the Linkway Bridge — 40 m"), not to
  // the walk after it (it was 7 m, and the rest counted as walking on in Toh Tuck).
  const decks = new Map();
  steps.forEach((s, i) => {
    if (s.type !== 'bridge' || walkway(s)) return;
    for (const [j, first] of [[i - 1, false], [i + 1, true]]) {
      const L = legs[j], cut = L && deckRun(L.floor, L.pts, first);
      if (!cut) continue;
      const d = decks.get(i) || { metres: 0, pts: [] };
      d.metres += cut.metres; d.pts.push(...cut.pts);
      decks.set(i, d);
      L.pts = cut.rest;
    }
  });
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type !== 'walk') { out.push(connectorStep(s, campus, lang, decks.get(i))); continue; }
    if (!legs[i]) continue;
    const { floor, pts } = legs[i];
    let start = i === 0 ? endPortal(floor, route.from, pts[0])
                        : floor.portalById.get(steps[i - 1].id) || null;
    // (a trip from a room's second door starts at the room, "From KB-305", not at the door's own id: the door's
    // place is kept, for which way you face; a side of a big place keeps its side, to name it)
    if (start && start.entranceOf && !start.side) { const m = floor.portalById.get(start.entranceOf); if (m) start = { ...m, x: start.x, y: start.y }; }
    let end = i === steps.length - 1 ? endPortal(floor, route.to, pts[pts.length - 1]) : null;
    // (a trip to a big place ends at its nearer side, and arrives at the place: "Arrive at the
    // Secondary Library", straight ahead; a start at a side keeps the side, to name it)
    if (end && end.entranceOf) { const m = floor.portalById.get(end.entranceOf); if (m) end = { ...m, x: end.x, y: end.y }; }
    const next = i < steps.length - 1 ? floor.portalById.get(steps[i + 1].id) || null : null;
    out.push(...walkSteps(pts, floor, start, end, next, lang, ends, stepFree));
  }
  const last = steps[steps.length - 1];
  if (last && last.type !== 'walk') {
    const f = campus.byId[last.toFloor], id = route.to.slice(route.to.indexOf(':') + 1);
    const p = f.portalById.get(id);
    if (p) out.push({ kind: 'arrive', dir: null, text: t(lang, 'arrive', { place: goalName(p, lang) }), dist: null,
                      floor: f.id, at: [p.x, p.y], focus: [[p.x, p.y]] });
  }
  return out;
}

// The door of a place that the route actually used: a place may have two (the gym).
function endPortal(floor, key, [x, y]) {
  const id = key.slice(key.indexOf(':') + 1);
  let best = null, bd = Infinity;
  for (const p of floor.portals) {
    if (p.id !== id && p.entranceOf !== id) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  // (a number with no room, TK-306, is not among the floor's portals: by its id)
  return best || floor.portalById.get(id) || null;
}

// The walk along a bridge's deck from the bridge's end of a floor's walk (its first points, or its
// last): the deck's length, its points, and the walk that is left. Null when the walk does not
// start (end) on a deck, or is all deck.
function deckRun(floor, pts, first) {
  const seq = first ? pts : [...pts].reverse();
  const ft = floor.features.find(f => f.kind === 'bridge-deck'
    && (inside(f.ring, seq[0][0], seq[0][1]) || nearestOnRing(f.ring, seq[0][0], seq[0][1]).d < 1.5));
  if (!ft) return null;
  const on = ([x, y]) => inside(ft.ring, x, y);
  let k = 0;
  while (k + 1 < seq.length && on(seq[k + 1])) k++;
  if (k >= seq.length - 1) return null;
  // where the walk steps off the deck, between the last point on it and the next
  let a = seq[k], b = seq[k + 1];
  for (let n = 0; n < 24; n++) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (on(m)) a = m; else b = m;
  }
  const run = [...seq.slice(0, k + 1), a], rest = [a, ...seq.slice(k + 1)];
  const metres = run.reduce((s, p, n) => (n ? s + Math.hypot(p[0] - run[n - 1][0], p[1] - run[n - 1][1]) : 0), 0);
  if (metres < 2) return null;
  return first ? { metres, pts: run, rest } : { metres, pts: run.reverse(), rest: rest.reverse() };
}

function walkSteps(pts, floor, start, end, next, lang, ends, stepFree) {
  const out = [];
  const total = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
  if (end && total < SHORT_LEG) return [arrival(end, pts, lang, undefined, floor.id)];
  const simp = rdp(pts, WOBBLE);
  // a step's stretch is drawn over the route, so it takes the route's own points between the
  // simplified ones it starts and ends at (rdp keeps the originals)
  const index = new Map(pts.map((p, k) => [p, k]));
  const full = poly => pts.slice(index.get(poly[0]), index.get(poly[poly.length - 1]) + 1);
  // and its length is the route's own, so a trip's steps add up to its total
  const length = line => line.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - line[k - 1][0], p[1] - line[k - 1][1]) : 0), 0);
  const runs = [];
  let cur = null;
  for (let k = 1; k < simp.length; k++) {
    const a = simp[k - 1], b = simp[k];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const hdg = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (!cur) { cur = { turn: 0, at: a, len, hdg, main: len, pts: [a, b] }; continue; }
    const d = angle(hdg, cur.hdg);
    if (Math.abs(d) >= TURN && len >= MIN_RUN) {
      runs.push(cur);
      cur = { turn: d, at: a, len, hdg, main: len, pts: [a, b] };
    } else {
      cur.len += len; cur.pts.push(b);
      if (len > cur.main) { cur.main = len; cur.hdg = hdg; }
    }
  }
  if (cur) runs.push(cur);
  // two turns the same way a few steps apart are one turn ("bear right" twice is "turn right")
  for (let k = 1; k < runs.length - 1; k++) {
    const a = runs[k], b = runs[k + 1];
    if (a.len < 8 && Math.sign(a.turn) === Math.sign(b.turn) && Math.abs(a.turn + b.turn) <= BACK) {
      runs.splice(k, 2, { turn: a.turn + b.turn, at: a.at, len: a.len + b.len, hdg: b.hdg, main: b.main,
                          pts: [...a.pts, ...b.pts.slice(1)] });
      k--;
    }
  }
  // a jog: a turn one way and, a few steps on, back the other is one bend, said as the turn it
  // comes to ("turn left 6 m, bear right" was two orders for one kink); nothing at all when it
  // comes out on about the same heading
  for (let k = 1; k < runs.length - 1; k++) {
    const a = runs[k], b = runs[k + 1];
    if (a.len < 8 && Math.sign(a.turn) !== Math.sign(b.turn)) {
      const net = a.turn + b.turn;
      if (Math.abs(net) < TURN) {
        const prev = runs[k - 1];
        prev.len += a.len + b.len; prev.pts.push(...a.pts.slice(1), ...b.pts.slice(1));
        runs.splice(k, 2);
      } else {
        runs.splice(k, 2, { turn: net, at: a.at, len: a.len + b.len, hdg: b.hdg, main: b.main, pts: [...a.pts, ...b.pts.slice(1)] });
      }
      k--;
    }
  }
  while (runs.length > 1 && runs[runs.length - 1].len < LAST) {
    const z = runs.pop(), y = runs[runs.length - 1];
    y.len += z.len; y.pts.push(...z.pts.slice(1));
  }
  if (!runs.length) return out;

  // Leaving: the short stub from the door into the corridor belongs to leaving, and which way
  // you turn is judged against the way you face coming out of the door.
  let r0 = 0;
  while (r0 < runs.length - 1 && runs[r0].len < 3) r0++;
  const lead = runs.slice(0, r0 + 1);
  const leadLen = lead.reduce((a, r) => a + r.len, 0);
  const facing = start && start.room ? Math.atan2(start.y - start.room.ly, start.x - start.room.lx) : null;
  // (at a side of a big place, "Leave the Secondary Library by the atrium side": the place, and the side)
  const sideOf = start && start.side && start.entranceOf ? floor.portalById.get(start.entranceOf) || null : null;
  const what = sideOf ? refName({ ...sideOf, code: '' }, lang) : start ? refName(start, lang) : '';
  const sideName = sideOf ? nameIn(start.side, lang) : '';
  const isRoom = start && start.room && start.type === 'room';
  // A walk that goes more or less straight to the door it is making for (across a pod, down one
  // corridor) is said in one go: "head for Stairs 8", not every bend on the way. A long one with
  // more than one real bend gets its turns: 90 m on "head for" leaves you guessing at the corners.
  const goal = end || next;
  const [a0, z0] = [pts[0], pts[pts.length - 1]];
  const crow = Math.hypot(z0[0] - a0[0], z0[1] - a0[1]);
  const bends = runs.slice(r0 + 1).filter(r => Math.abs(r.turn) >= TURN).length;
  // (never "head for" a seam: there is nothing there to see)
  const direct = goal && !seam(goal) && crow > 6 && total < 1.25 * crow && runs.slice(r0 + 1).every(r => Math.abs(r.turn) < 75)
    && (total < 40 || bends <= 1);
  const head = direct ? 'Head' : '';
  // a lift is told by what stands beside it: there are two on most floors
  const target = direct ? (goal.type === 'elevator' ? liftName(goal, floor, lang) : refName(goal, lang)) : '';
  const skip = [start, end, next];
  let text, leaveDir = null, towardId = null, towardText = null, towardEn = null;
  if (start) {
    // walking on over a seam (the road south of the pool deck), there is nothing there to start "from"
    const onward = seam(start);
    const base = isRoom ? 'leave' : onward ? 'on' : sideOf ? 'leaveBy' : 'startAt';
    const d = facing === null ? 0 : angle(runs[r0].hdg, facing);
    const dir = side(d);
    if (facing === null || Math.abs(d) < TURN || Math.abs(d) > BACK) {
      // with no way you face coming out to judge "straight on" by (a stair, the entrance), the
      // first thing to make for, when there is one to name
      const toward = facing === null && !direct && !isRoom && runs[r0 + 1] ? landmark(floor, runs[r0 + 1].at, ends, skip, stepFree) : null;
      if (toward) { towardId = toward.id; towardText = toward.name(lang); towardEn = toward.name('en'); }
      text = toward ? t(lang, onward ? 'onToward' : sideOf ? 'leaveByToward' : 'startAtToward', { place: what, side: sideName, mark: toward.name(lang) })
                    : t(lang, base + (direct ? 'Head' : 'Straight'), { place: what, target, side: sideName });
    } else { text = t(lang, base + 'Turn' + head, { place: what, target, ...dirVars(dir, lang) }); leaveDir = dir; }
  } else text = t(lang, 'startAt', { place: floorName(floor, lang) });
  // (a start that turns carries its turn, for its icon: "From Stairs 11, turn left and head for …")
  if (direct) {
    out.push({ kind: 'depart', dir: leaveDir, text, dist: total, floor: floor.id, at: pts[0], focus: pts });
    if (end) out.push(arrival(end, pts, lang, runs[runs.length - 1].hdg, floor.id));
    return out;
  }
  // a turn a few steps out of the door is said with leaving: "From Stairs 7, turn left, then left
  // again"; one back the other way a little further on, too ("Leave KB-405 and turn left, then right")
  let first = r0 + 1, departPts = lead.flatMap(r => r.pts), turnDir = leaveDir;
  const n1 = runs[first];
  if (n1 && Math.abs(n1.turn) > BEAR && Math.abs(n1.turn) <= BACK
      && leadLen < (leaveDir && side(n1.turn) !== leaveDir ? JOG : THEN)) {
    const d1 = side(n1.turn);
    text = t(lang, d1 === leaveDir ? 'thenAgain' : 'then', { first: text, ...dirVars(d1, lang) });
    departPts = [...departPts, ...n1.pts.slice(1)];
    first++;
    // ("Walk towards the Changing Rooms, then left": its arrow is that left)
    turnDir = turnDir || d1;
  }
  const departLine = full(departPts);
  out.push({ kind: 'depart', dir: turnDir, text, dist: length(departLine), floor: floor.id, at: lead[0].at, focus: departLine, mark: towardId, markText: towardText });

  let said = null;   // the last turn said, so a second the same way says "again"
  // the landmark the last step named: twice running says nothing new ("walk towards Stairs 12", then "Turn left at
  // Stairs 12"), so the first turn counts the one you set off towards
  let named = towardEn;
  for (let k = first; k < runs.length; k++) {
    const r = runs[k];
    const a = Math.abs(r.turn), dir = side(r.turn);
    let mark = landmark(floor, r.at, ends, skip, stepFree);
    if (mark && mark.name('en') === named) mark = null;
    // (and one left unsaid stays the last named: "walk towards the Atrium Lobby", "Bear left", then "Bear left by the
    // Atrium Lobby" named it twice in three steps)
    if (mark) named = mark.name('en');
    let kind, key;
    if (a > BACK) { kind = 'around'; key = 'turnAround'; }
    else if (a <= BEAR) { kind = 'bear'; key = mark ? (mark.connector ? 'bearAt' : 'bearBy') : 'bear'; }
    else { kind = 'turn'; key = mark ? (mark.connector ? 'turnAt' : 'turnBy') : 'turn'; }
    // with nothing to name, the corridor itself: it ends a few steps on, so you turn
    if (key === 'turn' && endsAhead(floor, r.at, runs[k - 1].hdg)) key = outdoors(floor, r.at) ? 'turnEndPath' : 'turnEnd';
    else if ((key === 'turn' || key === 'bear') && said && said.kind === kind && said.dir === dir) key += 'Again';
    said = { kind, dir };
    let text = t(lang, key, { mark: mark && mark.name(lang), ...dirVars(dir, lang) });
    let focus = full(r.pts);
    // a second turn a few steps after the first is said with it: "…, then left again"; a turn
    // back the other way a little further on too ("Turn left at Stairs 7, then right"), where it
    // was two orders, sometimes by the same door
    const n2 = runs[k + 1];
    if (n2 && Math.abs(n2.turn) > BEAR && Math.abs(n2.turn) <= BACK && kind !== 'around'
        && r.len < (side(n2.turn) !== dir ? JOG : THEN)) {
      const d2 = side(n2.turn);
      text = t(lang, d2 === dir ? 'thenAgain' : 'then', { first: text, ...dirVars(d2, lang) });
      focus = full([...r.pts, ...n2.pts.slice(1)]);
      k++;
    }
    // the landmark it names, so the map can label it while you are on this step
    out.push({ kind, dir, text, dist: length(focus), floor: floor.id, at: r.at, focus, mark: mark ? mark.id : null, markText: mark ? mark.name(lang) : null });
  }

  if (end) out.push(arrival(end, pts, lang, runs[runs.length - 1].hdg, floor.id));
  return out;
}

// Arriving, and which side the door is on: the room against the way you were walking. A room
// behind that way (the last turn, into its door, goes unsaid) is judged by the last few metres;
// a room you walk into (a library, the canteen) is straight ahead as you reach its edge.
function arrival(end, pts, lang, hdg, floor) {
  if (hdg === undefined) {
    const a = pts[0], b = pts[pts.length - 1];
    hdg = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  const name = goalName(end, lang);
  let text = t(lang, 'arrive', { place: name }), dir = null, ahead = false;
  if (end.room) {
    const to = Math.atan2(end.room.ly - end.y, end.room.lx - end.x);
    let d = angle(to, hdg);
    if (Math.abs(d) > BACK) d = angle(to, approach(pts));
    if (Math.abs(d) < 30) { text = t(lang, 'arriveAhead', { place: name }); ahead = true; }
    else if (Math.abs(d) <= BACK) { dir = side(d); text = t(lang, 'arriveSide', { place: name, dir: t(lang, dir) }); }
  } else if (end.area && inside(end.area.ring, end.x, end.y) && pts.some(([x, y]) => !inside(end.area.ring, x, y))) {
    text = t(lang, 'arriveAhead', { place: name }); ahead = true;
  }
  // (ahead: the trip card says "Straight ahead" from it, in whatever language the text is in)
  return { kind: 'arrive', dir, ahead, text, dist: null, floor, at: [end.x, end.y], focus: [[end.x, end.y]] };
}

// Which way the last few metres of a walk go.
function approach(pts, metres = 3) {
  const z = pts[pts.length - 1];
  let k = pts.length - 1, run = 0;
  while (k > 0 && run < metres) { run += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); k--; }
  return Math.atan2(z[1] - pts[k][1], z[0] - pts[k][0]);
}

// A place's name in a sentence: "the Linkway Bridge", "the Black Box Theatre", "KB-305",
// "Stairs 8"; a name with alternatives or a note in brackets keeps only its first part.
export function refName(p, lang) {
  if (p.type === 'elevator') return t(lang, 'liftRef');
  if (p.type === 'bridge') return t(lang, walkway(p) ? 'walkwayRef' : 'bridgeRef');
  if (p.type === 'stair') return nameIn(p.label, lang) || p.id;
  if (p.code) return p.code;
  let n = lang === 'en' ? oneName(placeName(p, lang)) : shortName(placeName(p, lang));
  if (lang === 'en' && /^toilets?$/i.test(n)) return 'the toilets';
  // an office named after the job of whoever sits in it: "the Secondary Principal's office"
  if (lang === 'en' && jobOffice(p, n)) {
    n = n.replace(/^the\s+/i, '');
    n = /s$/i.test(n) ? `${n}' office` : `${n}'s office`;
  }
  // "the Secondary Library", "the Main Entrance", but "Maintenance", "Security": a name takes the
  // article when it ends in a word for a place
  if (lang === 'en' && !/^(pod|stairs|level|the)\b/i.test(n) && PLACE_NOUN.test(n)) n = 'the ' + n;
  return n;
}

// One name for a room that has two ("Transformer / Switch Room", "Chiller / Plant Room"): the
// first, with the noun they share ("Transformer Room").
function oneName(full) {
  const short = shortName(full);
  if (short === full || PLACE_NOUN.test(short)) return short;
  const noun = full.match(/\s(room|store|studio|office|lab)$/i);
  return noun ? `${short} ${noun[1]}` : short;
}

// The at-grade link between the wings (BRIDGE-1, "Covered Walkway") is walked, not crossed.
export function walkway(p) { return !!p && /walkway/i.test((p.label && p.label.en) || ''); }

// A seam: where two sheets of one level meet at grade with nothing built there, the road south of
// the pool deck from L1 onto Toh Tuck's (BRIDGE-11): a bridge with no deck or crossing of its own.
// Not a place, not a floor change you would notice: "Carry on to Toh Tuck Level 1".
export function seam(p) { return !!p && p.type === 'bridge' && !p.area; }

const PLACE_NOUN = /\b(house|library|office|room|rooms|theatre|theater|canteen|cafe|pool|gymnasium|gym|centre|center|lab|studio|hall|lobby|entrance|area|zone|park|bay|field|garden|court|deck|bridge|toilets?|lounge|space|kitchen|store|storage|workroom|wing|counter|desk|reception|clinic|gallery|platform|stage|playground|walkway|point|lots|department|courtyard|academy|makerspace|closet)$/i;

// The place a trip ends at, as its sign names it: "the Secondary Library (LKS-304)", "the Head of
// School's office (LKS-410)"; a plain classroom, a toilet or a stair by what refName says.
export function goalName(p, lang) {
  const n = nameIn(p.name, lang);
  if (!p.code || !n || /^classroom$/i.test(p.name.en || '')) return refName(p, lang);
  const named = refName({ ...p, code: '' }, lang);
  return t(lang, 'withCode', { name: named, code: p.code });
}

// A stair, lift or bridge step. A bridge crossing is the whole bridge, door to door (deck: the
// stretch of it a Toh Tuck floor draws); the covered walkway joins the two sheets where they meet,
// a metre or so, so its step gives no distance of its own.
function connectorStep(s, campus, lang, deck) {
  const from = campus.byId[s.fromFloor], to = campus.byId[s.toFloor];
  const p = from.portalById.get(s.id);
  const at = p ? [p.x, p.y] : null;
  // across the bridge the building changes: say which ("to Lakeside Level 2")
  const floor = from.building !== to.building && to.building !== 'tohtuck' ? `${buildingName(to.building, lang)} ${floorName(to, lang)}` : floorName(to, lang);
  const stair = nameIn(s.label, lang) || s.id;
  let kind, text, dist = null, focus = at ? [at] : [];
  if (s.type === 'bridge' && seam(p)) { kind = 'onward'; text = t(lang, 'seam', { floor }); }
  else if (s.type === 'bridge') {
    kind = 'bridge'; text = t(lang, walkway(s) ? 'walkway' : 'bridge', { floor });
    if (!walkway(s)) { dist = s.metres + (deck ? deck.metres : 0); if (deck) focus = [...focus, ...deck.pts]; }
  }
  else if (s.type === 'elevator') {
    kind = s.rise > 0 ? 'lift-up' : 'lift-down';
    text = t(lang, s.rise > 0 ? 'liftUp' : 'liftDown', { floor, lift: p ? liftName(p, from, lang) : t(lang, 'liftRef') });
  }
  else if (!s.flights) { kind = 'landing'; text = t(lang, 'landing', { stair, floor }); }
  else {
    const up = s.rise > 0;
    kind = up ? 'stairs-up' : 'stairs-down';
    text = s.flights > 1 ? t(lang, up ? 'stairsUpN' : 'stairsDownN', { stair, floor, n: s.flights })
                         : t(lang, up ? 'stairsUp' : 'stairsDown', { stair, floor });
  }
  return { kind, text, dist, floor: s.fromFloor, toFloor: s.toFloor, at, focus, connector: s.id, seam: s.type === 'bridge' && seam(p) };
}

// A lift by its own name when it has one ("the Main Lift"), else by the stair beside it, whose
// number is on the wall ("the lift by Stairs 14"): most floors have two passenger lifts.
function liftName(p, floor, lang) {
  const own = p.label && p.label.en;
  if (own && !/^(passenger )?lifts?$/i.test(own)) return t(lang, 'liftOwn', { name: lang === 'en' ? own : nameIn(p.label, lang) || own });
  const by = (list, lim) => list.map(q => [Math.hypot(q.x - p.x, q.y - p.y), q]).filter(([d]) => d <= lim).sort((a, b) => a[0] - b[0])[0];
  const near = by(floor.portals.filter(q => q.type === 'stair'), LIFT_STAIR)
    // no stair close by: a place with a name of its own ("Pod A")
    || by(floor.portals.filter(q => q.type === 'room' && !q.code && !q.entranceOf && q.name && q.name.en
          && q.name.en.length <= 24 && !/toilet/i.test(q.name.en)), LIFT_PLACE);
  return near ? t(lang, 'liftBy', { mark: refName(near[1], lang) }) : t(lang, 'liftRef');
}

// The thing to turn at: a stair or lift beats a room door; nothing further than a few metres,
// and never the door the walk starts from or is making for.
function landmark(floor, at, ends, skip, stepFree) {
  // a door or a stair at the turn; failing that, one a few steps further off (still in sight)
  // (out of doors things stand further apart: twice the reach)
  const far = outdoors(floor, at) ? 2 : 1;
  return mark(floor, at, ends, skip, far, stepFree) || mark(floor, at, ends, skip, 1.5 * far, stepFree);
}

function mark(floor, [x, y], ends, skip, reach, stepFree) {
  let best = null, bs = Infinity;
  // the rooms you start and end in are no landmark either, by any of their doors ("Turn left by TK-603", then "Arrive
  // at TK-603": its second door, TK-603-D2, is a portal of its own)
  const own = new Set(skip.filter(Boolean).map(q => roomOf(q.id)));
  for (const p of floor.portals) {
    if (skip.includes(p) || own.has(roomOf(p.id)) || p.entranceOf || ends.has(`${floor.id}:${p.id}`) || seam(p)) continue;
    // a room inside another (LKS-405-B, BT-206-2) has its door in that room, not on the corridor
    if (p.code && SUB_ROOM.test(p.code)) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    const conn = p.type !== 'room';
    const lim = (conn ? MARK_CONNECTOR : p.code ? MARK_ROOM : MARK_PLACE) * reach;
    if (d > lim) continue;
    // a room without a code is a landmark only if it is a place people know by name (a pod, the
    // canteen, the toilets), not an office called after the job of whoever sits in it
    // (the north gate's guard house too: a little building everyone walks past)
    if (p.type === 'room' && !p.code && (!(p.name && p.name.en && p.name.en.length <= 24)
        || (p.room && !['toilet', 'hall', 'food'].includes(p.room.kind) && !/^guard house$/i.test(p.name.en)))) continue;
    const score = d + (conn ? 0 : p.code ? 2 : 3);
    if (score < bs) { bs = score; best = p; }
  }
  if (!best) return null;
  const p = best;
  // a stair on a step-free route is somewhere you pass: "by Stairs 7", not "at" it
  return { connector: p.type !== 'room' && !(stepFree && p.type === 'stair'), name: lang => markName(p, lang), id: p.id };
}

const SUB_ROOM = /^[A-Z]+-\d+-\w+$/i;
// a room's second (third, ...) door is <ROOM>-D2: the room either way
const roomOf = id => String(id).replace(/-D\d+$/, '');
// names that say nothing a door's code does not: such a room is a landmark by its code
const PLAIN = /^(classroom|store|store ?room|storage|office|work ?room|room|toilets?|supply|locker|m&e\b.*)$/i;

// A room as a landmark: by the name people know it by and the code on its door, when it has such
// a name ("the Transformer Room (KB-101)", which the map labels right there), else by the code
// ("KB-305" for a classroom, a store, "LS", an office named after the job of whoever sits in it).
function markName(p, lang) {
  if (p.type !== 'room' || !p.code) return refName(p, lang);
  const full = ((p.name && p.name.en) || '').replace(/\s*[（(][^）)]*[）)]\s*$/, '');
  let en = oneName(full);
  if (en !== full && !PLACE_NOUN.test(en)) en = '';   // "Costumes / Props": no one name for it
  if (!en || PLAIN.test(en) || /^[A-Z.&]{1,5}$/.test(en) || en.length > 26 || jobOffice(p, en)) return p.code;
  // (in another language, its own name for the room; with none, the English one)
  const own = lang === 'en' ? '' : nameIn(p.name, lang);
  const name = lang === 'en' ? refName({ ...p, code: '', name: { en } }, lang)
    : (shortName(own !== p.name.en ? own : '') || en);
  return t(lang, 'withCode', { name, code: p.code });
}

// An office named after the job of whoever sits in it ("Head of Admissions"), not what it is.
const jobOffice = (p, n) => !!(p.room && p.room.kind === 'office')
  && !/office|room|centre|center|department|reception|lounge|area|suite|counter|desk|hub|studio|clinic|admissions|services|team/i.test(n);

// Whether the floor runs out a few metres on along the heading you came in on: a turn at the end of
// a corridor (or of a pod) needs no other landmark.
// Out of doors: on a path, a road, a deck or a crossing the map draws (the north site, 1 Nov 2026),
// where "the end of the corridor" read oddly by the pool.
const OUTSIDE = new Set(['walkway', 'road', 'deck', 'crossing', 'court', 'ramp', 'parking', 'floor-marking']);
function outdoors(floor, [x, y]) {
  return (floor.features || []).some(ft => OUTSIDE.has(ft.kind) && ft.ring && inside(ft.ring, x, y));
}

function endsAhead(floor, [x, y], hdg) {
  if (!floor.walkable) return false;
  const dx = Math.cos(hdg), dy = Math.sin(hdg);
  return [2, 3.5].some(d => !floor.walkable(x + dx * d, y + dy * d));
}

// Signed angle from heading b to heading a, in degrees, positive clockwise on screen (y down):
// positive is a turn to the RIGHT.
function angle(a, b) {
  let d = (a - b) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

const side = d => (d > 0 ? 'right' : 'left');
const dirVars = (dir, lang) => ({ dir: t(lang, dir), dirTurn: t(lang, dir + 'Turn') });

export function rdp(pts, tol) {
  if (pts.length <= 2) return pts.slice();
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

// Why a route goes the long way, when one of the school's rules sends it (the owner's zones,
// data/zones_evac.json): round the gym or an office that is not a through route, a staff-only
// area, a library or the bus bay, or the other school's corridors. Said only for a real detour:
// against the same trip with every rule lifted, 20 s more and a third longer. The note names the
// rule; the time shown is still the walk's own (a toll never shows in it). A string key for t().
export function detourNote(router, r, areas, stepFree) {
  const g = router.g;
  const free = router.route(r.from, r.to, { stepFree, sections: false, tolls: false, open: g.gates.map((_, i) => i) });
  if (!free.ok || r.seconds - free.seconds < 20 || r.seconds < 1.3 * free.seconds) return null;
  // walked by the free route and (mostly) not by this one
  const gone = k => (free.zones[k] || 0) > 5 && (r.zones[k] || 0) < free.zones[k] / 2;
  const gate = g.gates.find(gt => gone(`gate:${gt.id}`));
  if (gate) {
    const a = areas.find(z => z.id === gate.id);
    return /^GYM-/.test(gate.id) ? 'noteGym' : /^POOL-DECK/.test(gate.id) ? 'notePool' : /^POOL-LOBBIES/.test(gate.id) ? 'noteLobby'
      : a && a.staffOnly ? 'noteStaff' : 'noteOffice';
  }
  // a toll is a price on its edges, with no name: which area the free route crosses says
  const toll = areas.find(a => !a.gate && enters(free, a) && !enters(r, a));
  if (toll) return /^LIBRARY/.test(toll.id) ? 'noteLibrary' : /^BUS/.test(toll.id) ? 'noteBusBay' : /^NORTH-ROADS/.test(toll.id) ? 'noteRoads' : null;
  const sec = r.rules && r.rules.avoidSection;
  if (sec && gone(`section:${sec}`)) return sec === 'primary' ? 'notePrimary' : 'noteSecondary';
  return null;
}

// The zones a detour note can name (gates and tolls), as rings in sheet px like a route's legs.
export function ruleAreasOf(doc, campus = null) {
  return ((doc && doc.areas) || []).filter(a => a.toll || a.gate).map(a => {
    const rings = [...(a.boxes || []).map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), ...(a.polygons || [])];
    // (and where the map draws them, for a floor routed on the map's own floor: Floor.routePoint)
    const f = campus && campus.byId[a.floor];
    return { id: a.id, floor: a.floor, gate: !!a.gate, staffOnly: !!a.staffOnly, rings, f, onMap: f ? rings.map(rg => f.mapRing(rg)) : null };
  });
}

// Whether a route walks into an area: its legs sampled every 8 px or 0.6 m (a leg is simplified, so a
// straight stretch can cross a corner of the area between two points).
function enters(route, a) {
  return route.legs.some(L => {
    if (L.floor !== a.floor) return false;
    const onMap = a.f && a.f.routeT, P = onMap ? L.points.map(([x, y]) => a.f.routePoint(x, y)) : L.points;
    const rings = onMap ? a.onMap : a.rings, step = onMap ? 0.6 : 8;
    return P.some((p, i) => {
      const q = P[i - 1] || p, n = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / step));
      for (let k = 0; k <= n; k++) {
        const x = q[0] + (p[0] - q[0]) * k / n, y = q[1] + (p[1] - q[1]) * k / n;
        if (rings.some(rg => inside(rg, x, y))) return true;
      }
      return false;
    });
  });
}
