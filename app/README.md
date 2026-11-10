# The app (`app/`)

The new CIS Map: walking directions between any two places on the campus, on a phone, in
sixteen languages (English and Simplified Chinese built in; fourteen more, each in its own file). It replaces the first prototype's viewer, archived in
`archive/prototype/`. Project status: `APP_STATUS.md` on the development branch.

The site's root address opens a homepage (`index.html`, since 10 Nov 2026; the first prototype that was there is in
`archive/prototype/`): what the map is, "Open the map", a code to scan on a computer, and
Level 3 as a model with a route on it (`model.js`, which the slideshow's title uses too; its names go
only on floor the raised walls leave showing, through `map.js`'s `labelSpot` and `labelClear`, and on a
phone the plan is turned so the route runs down the screen). It loads the app's
`app.css`, `i18n.js` (its four lines are in the string table, so every language has them), `qr.js` and `model.js`,
and shares the app's saved language (`cismap.lang`).

Static files and nothing else. No build step, no framework, no server code, no accounts, no
tracking. It reads the map (`data/<F>_evac/navmesh_data.json`), the floors index
(`data/floors_evac.json`) and the walking network (`data/routing/graph_evac.json`), and works
every route out on the phone with `routing/engine.mjs` (about half a millisecond a route).

## Running it

Serve the **repo root** (the app reaches `../data`, `../routing` and `../assets`) and open `app/`:

    tools/serve.sh                     # then http://127.0.0.1:8000/app/
    python3 -m http.server 8000        # the same, without the restart loop

On a phone on the same Wi-Fi, bind to every interface (`python3 -m http.server 8000 --bind
0.0.0.0`) and open `http://<this computer's address>:8000/app/`. Offline mode needs HTTPS (or
localhost), so it is off on a plain `http://192.168…` address; everything else works.

Publishing is copying the repo as it is: `app/` next to `data/`, `routing/` and `assets/`.
Serve it compressed: the first visit fetches about 2.1 MB, most of it the routing network
(`data/routing/graph_evac.json`, 1.4 MB, 296 KB gzipped), and people open it on mobile data by a
door label. Any production server's gzip or brotli for `.json`, `.js` and `.css` does it;
`python3 -m http.server` does not compress.

**Routes on the map's own floor** (3 Nov: routes were cutting through walls). On the floors the CAD's
corrections move (L1-L5) the routing network is built on the floor as the map draws it (tools/routing/README.md,
step 0), so its points are already on the map: `useRouting(campus, graph)` (floors.js; main.js, the tools and the
door-label sheet call it) gives each such floor `routeT`, and `Floor.routePoint` / `mapLine` only turn the points
into campus metres. Directions, the detour note's areas (`ruleAreasOf(doc, campus)`) and the checks read route
points through `routePoint`. What follows applies to a network built on the sheet's own pixels (L6 and Toh Tuck
have no corrections, so it is moot there now).

**A route on a corrected floor** (`Floor.mapLine` in floors.js, 2-3 Nov). The engine's points are sheet pixels;
the map moves them through the CAD corrections. Drawn corner to corner, a run from an unmoved corner to a moved one
cut straight across whatever lay between (Stairs 13's treads on L5 and L4). So each leg is cut into half-metre
pieces before it is moved, and bends with the floor. Where a correction shears the floor (moves a corridor metres
further than the rooms beside it), that bend came out as a hook: down the corridor too far, back up, then on
(3 Nov, by L4's KB toilets and in several other places). `unspur` takes those out: a stretch that comes back on
the map to within 2.5 m of where it left, while the sheet's route there only turns, is drawn straight across. A jog
at a seam (one side offset, not doubling back) stays, so no shortcut crosses a room. Where a correction's move
changes within one piece (its edge) and that piece, drawn straight, would leave the floor, the piece is halved
until each half is half a metre on the map or stays on the floor, so the line bends with the floor's outline
(L1, lakeside-west's edge: one straight 3 m step ran across the wall beside it); a step that stays on the floor
is left a straight slant.

**The route-line test** (`node tools/app/routelines.mjs`, 3 Nov: a test for
backtracking and squiggles). About 2,000 trips over all ten floors, each line drawn as the app draws it
(the engine, `Floor.mapLine`, `smoothLine`), in about 6 s; `tools/app/check.mjs` runs it as its last check. It fails
on any line that doubles back (out half a metre or more and back, with open floor across: a hook, a spike, a poke
into a room and out), jogs (two sharp bends that step the line sideways 0.1-1 m and carry on), or zig-zags (three
sharp bends within 4 m), and on any piece of `mapLine`'s line that cuts through a room or crosses a wall or void;
each finding is put down to the engine's line, the corrections or the smoothing. `--app DIR` checks another copy
of app/ (an older commit, say), which is how the table was made. Run it after any change to how a route is drawn.
On the same 2,000 trips:

| the drawing as it was | backtracks | jogs | zig-zags | cuts |
|---|---|---|---|---|
| the night of 2 Nov | 137 | 780 | 26 | 3 |
| the morning of 3 Nov (`unspur` in) | 10 | 565 | 13 | 0 |
| now | 0 | 0 | 0 | 0 |

The first two rows also had 10-20 findings at the library edge on L2/L3, which the test then listed as known; since
the network is built on the map's own floor (below) there are none, and the test has no known list. Of the morning's
565 jogs, 564 were the smoothing's (92 places); of its 10 backtracks, 9 were the engine's own (doors joined to the
corridor's network behind the way out).

**Loading, a level at a time** (2 Nov: the 1st floor loads first). `loadFloors(root, { first,
onLevel })` fetches the first level on its own -- a Lakeside floor and its Toh Tuck partner (L1 + TT_L1),
or a link's from-floor's -- and the map draws as soon as it and the staff-only zones are in; the rest
follow, the to-floor's level first, then those between, then outward, each built as it comes. The graph is
asked for at once (low priority). Search, routes and the place card wait for everything (`campus` still
means "all in"); until then From/To say "Loading the campus…", a tap on a level still loading is
remembered, and a tap on the map does nothing. Measured cold in a headless phone: Fast 3G 16.4 s -> 7.2 s
to the map, school Wi-Fi at lunch 7.8 s -> 3.5 s. `loadFloors(ROOT)` alone still returns the whole campus
(check.mjs, qr.html and tools/i18n use it so).
Moving the app to the site root later means changing `ROOT` in `main.js` and `qrsheet.js`, the
`../` paths in `index.html`, `qr.html` and `sw.js`, and the engine import in `main.js` and
`qrsheet.js`.

## Links (and QR codes)

    app/?here=L4:KB-405                a code by a door: "you are here" (what the labels print)
    app/?from=L4:KB-405                the same start, without "you are here"
    app/?from=KB-405&to=BT-508         a whole trip; an id on one floor only needs no floor
    app/?to=L1:MAIN-ENTRANCE           a destination; the app asks where you are
    app/?from=L1:MAIN-ENTRANCE&to=L2:LKS-206,L3:KB-305
                                       several stops, visited in order ("Next stop" moves on)
    &stepfree=1                        lifts and ramps only
    &lang=zh   &lang=en   &lang=ko …   language (otherwise the phone's, then the last one chosen):
                                       en fr zh zh-Hant ko ja es pt-BR hi ta ms id vi th de tl

The QR button beside the swap button shows the current link as a QR code (from a kiosk or a
laptop to a phone), with "Copy link" and, where the browser has one, the share sheet.

`start` (as `here`) and `dest` (as `to`) are read too: the first prototype's names. A link to a
place that is not on the map says so rather than guessing. The address bar follows the trip,
writing `from=`, so a reloaded or shared link does not claim "you are here" somewhere else.

## Files

| file | what it does |
|---|---|
| `index.html`, `app.css` | the page: red bar, map, sheet (phone) or panel (900 px and wider), place picker |
| `main.js` | loads everything, keeps the trip, ties the screen together |
| `floors.js` | each floor's shapes in metres, room kinds, label positions, doors |
| `map.js` | draws a floor and the route; pan, pinch, wheel, tap |
| `search.js` | finding a place from what is typed |
| `directions.js` | turn-by-turn steps from the engine's route |
| `i18n.js` | every word in English and Chinese; the languages; names in any language (`nameIn`) |
| `lang/<id>.json` | each other language's words, place names and search words, fetched when chosen (written by `tools/i18n`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | offline, and "add to home screen" |
| `qr.html`, `qrsheet.js`, `qr.js` | door labels to print: a QR code per place, each read back before printing |

Data the app reads besides the floors and the routing network: `data/directory_evac.json` (other
names per place, empty until the school fills it), `data/toilets_evac.json` (what each toilet
block holds, below) and `data/footprints_evac.json` (the walls and floor as drawn, from
`tools/app/footprints.py`).

`tools/app/check.mjs` checks the logic in Node (floors stack, search, directions on the sample
trips and 600 random ones): `node tools/app/check.mjs` (`-v` prints the sample directions).
`tools/app/icons.py` redraws the icons.

## How the map is drawn

**In metres, not sheet pixels.** The evacuation sheets are drawn 10–47% wider than tall
(`metres.pxPerMetre` in the floors index), so the pixels would stretch every room; L1's round
atrium comes out round only in metres. Lakeside floors go through `metres.toCampus` into one
campus frame, so the six stack (the same stair is within 2–3 m of itself floor to floor) and
switching floor keeps the view over the same spot. Toh Tuck's four go into the same frame, turned
about 25 degrees as on the ground (`tools/evacpipe/metres.py` fits each Toh Tuck sheet on points
both it and the CAD show: stair cores, lift lobbies, the bridge door, corners;
`tools/evacpipe/tt_campus_pairs.json`; 0.5–1.5 m rms). L1 and L3 are placed by their stairs.

**Corrected where the CAD says the sheet is wrong.** The sheets are an artistic depiction (1 Nov
2026); one linear placement per floor cannot undo their local distortions. `data/floors_evac.json`
`corrections` (written by `metres.py` from `tools/evacpipe/corrections.json`) move points inside a
region (campus metres, judged where the sheet puts the point) by `dx`/`dy`, each piecewise linear in
y: `lakeside-west` takes Lakeside's west side 8–16 m south, where the CAD has its stairs, lift and
atrium (north-south only, so rooms stay square); `lakeside-southwest` takes the south-west wing 6.7 m
east onto the CAD's facade; `block-south-L2`/`-L3`/`-L4` add to the first inside the block south of the
atrium, fitted to the CAD's walls, so its corridor meets the pods' corridor in line (the sheets squeeze
that block, and with `lakeside-west` alone the jog closed the corridor). Corrections add up. A region's edge runs on wall lines between rooms; where a corridor or open
floor runs along it the move fades in across it (the edge's `band`), so a route slants rather than
jumps. `floors.js` `view()` applies them (`fixWeight`; `mapRing` cuts long edges in a moved area into
metre lengths so an x move that varies along y bends them, as a curved front), and
`tools/routing/build.mjs` measures lengths after them (`correctedXY`). A change to a region must keep
every room whole (not cut by a fade, not slanted) and every door moving with its room. Where the CAD
puts a room where the sheet has nothing, or in another shape, the labels place it from campus metres
(converted through the corrections): `roomPoly` re-outlines a detected block (`roomPolyWalk` for a
walk-through room, L1's Reception, left walkable), `stairBox` with `stairBoxExact` keeps a stair the
CAD's whole box even outside the sheet's outline (Stairs 1 on L1-L3), and `extraWalkable`/`noWalk`
add the floor and walls. A region's edge must not leave a point the CAD needs without a sheet position
(L1's north edge west of x 40.6 sits at 106.85 for the CAD's north wall); near a hard edge two sheet
positions can map to one campus point, so pin such a door in sheet px.

**A level is drawn whole.** A Lakeside floor and the Toh Tuck floor on its level (the floors
index's `sameLevel`) are each other's `partners` (`floors.js`); the map draws both, the current
floor on top, and a tap on the other one, or a pan that leaves the middle of the view over it,
makes it the current floor without moving the view. Each Toh Tuck bridge deck is carried on, straight,
to its Lakeside partner's door (`joinBridges`), and a route's bridge step is drawn as a line from
door to door (`links` in the route the map is given). TT_L1's sheet also draws Lakeside's corner and
the road narrowed; its `metres.clip` (made by `metres.py` from a polygon in campus metres) keeps
the map to what is its own, and the road between the wings is drawn on L1 (`ROAD-EAST`,
`CROSSING-WALKWAY` in its labels), past that sheet's east edge.

**No picture behind it**. In order:

1. the walls: the floor's footprint filled in the wall colour, then every outline stroked 0.5 m wide
   (the building's own edge, a little thicker than a wall inside it). The footprint is every shape the
   floor has merged, with the gaps and holes under 5 m closed: on a plan those are walls and structure,
   and left as nothing they showed as stray light lines and spots between the wall bands. Every wall is
   one thickness (4 Nov 2026: wall thickness only varies for a good reason):
   each room and stair is drawn grown into the gap round it, up to 0.9 m, so it reaches its wall
   (`footprints.py` `rooms_grown`, the `rooms` of `data/footprints_evac.json`; `floors.js` puts them in
   `r.block`, and a room's doors are cut in that outline). The wall is then a band inside each room's
   edge and the same band outside each edge of the walkable area (0.18 m each: 0.36 m between two rooms
   and between a room and a corridor), not round a hole drawn as floor. Before, the footprint showed in
   every gap the tracing left, and walls ran from 0.2 m to 1.6 m thick, with notches where a trace stepped.
   A staff-only zone's boxes are moved onto the map edge by edge (`mapRing`), as the walls are: moved by
   their corners alone, a box crossing a CAD correction drew its edge as a slant across the floor;
2. the floor (white), then features you walk on (decks, courts, gardens, seating). The floor drawn
   is the walkable area cleaned: the traced outline has slivers (L2: one 0.3 m wide and 13 m long),
   nicks, steps and rounded-off corners from the sheets' colour tracing, which showed in the walls as
   white lines, notches and slanted slivers. Cleaned on a 0.1 m grid (slivers and nicks under 0.6 m
   go, thin walls are kept), simplified to 0.25 m, edges within 12 degrees of the sheet's axes made
   square (unless their run strays more than 0.3 m from the line it would become: a curve or a real
   slant, like the bottom of the library's curved front), and a slant under 2 m between square edges
   made a corner. A real curve the labels name (`outlineArcs`: the two libraries' glass fronts, fitted to
   the CAD's glazing) is put back as its arc after all of that, to a 1 mm chord; the tracing had made it
   chords metres long, and on L2 a straight wall. Routing and `walkable()` keep
   the traced outline: this is drawing only. Both come from `tools/app/footprints.py`
   (`data/footprints_evac.json`; run it again after the floors change). On a floor the corrections move
   (`frame: "campus"`) all of it is worked out where the map draws it, in campus metres: the floor filled on
   the sheet (holes and all), moved cell by cell, then cleaned and squared there; `floors.js` takes those
   rings as they are (`drawnRing`). Squared on the sheet, a wall straight on the map but curved on the sheet
   across a fade drew as a squiggle. All four layers are filled nonzero: outlines run one way round, holes the
   other (`orient`), so pieces a correction moves over each other join (even-odd drew them as holes). An area marked "not a
   through route" (L1's atrium, L4's gym) is floor, with no wall round it, and so is the hole under
   a thing that stands on the floor with no walls (the atrium's curved stairs, a planter);
3. rooms, coloured by what they are for (`roomKind` in `floors.js` reads it from the name): the
   places people look for carry a colour (food orange, care a cool pink for the nurse and counselling,
   toilets teal, halls blue, the pool a deeper blue, the library lavender, labs and studios gold,
   offices slate) while plain classrooms, the bulk of every floor, stay a quiet stone so the rest
   stand out (care was a warm rose until 6 Nov, delta E 3.6 from the destination's tint: the nurse's room
   beside a route read as where it went; `#F8D9EA` is 8 from it and 7.5 from the library); stores and plant grey, stairs slate. A lift is one clean block over its shaft (the
   CAD's shaft is a ragged hole a little bigger than the lift);
4. features you cannot walk on (voids and light wells hatched, shafts, planters, counters). Roads
   are asphalt grey, a zebra crossing striped. Floor that is staff only (`staffOnly` areas in
   `data/zones_evac.json`: L4's admin wing, the Black Box's back corridor) is tinted and hatched
   red under the rooms, and named "Staff only"; a place whose door is in one says so on its card;
5. the route, then labels and markers, in screen pixels so text never scales.

A hole in the floor that nothing fills (L3's open middle) is left open: on this map, that is
outside. A door is a metre-wide gap in its room's outline where the room's portal meets it (a
portal more than 2.5 m from its room gets none).

A place drawn as a walkable area (a library, the canteen, a gym: a walkable feature of a room-like
kind holding the place's point, `AREA_KINDS` in `floors.js`) is a room you walk through: a tap
anywhere in it picks it, and it is tinted and outlined like a room when it is a trip's end.

The drawn floor (step 2) drops strips under 0.6 m as tracing noise, except a strip that is a way
through (the floor left joins its ends only the long way round: `ways_through` in
`footprints.py`), and it never fills over a hand-drawn wall (the labels' `noWalk`: cut only where the
cleaning made floor, since on the map moved floor can lie over a cut that was beside it on the sheet).

Labels sit inside their room when they fit: the room code (shrunk to 9 px before it is dropped),
and the name above it when there is room. A plain classroom shows its code only. Open spaces
(the canteen, a pod, the bus bay) are labelled at their portal; named features in grey italics.
A feature's name may run a little past the feature onto open floor, never onto a room or a stair
(tested on their outlines, not their boxes, which for a slanted room take in the road beside it).
No name goes under the route's pin or the card beside it.

## How the route's line is drawn (`map.js`)

The engine's line wanders a little between its waypoints. The map draws it straightened and
rounded: a straight stretch replaces a run of points when it stays within 1.6 m of them and keeps
0.7 m of open floor on both sides (`Floor.walkable`, so it neither cuts a wall nor grazes one, and
never takes another way than the directions say; the last 1.5 m at a door or a stair are let off),
then each straight stretch moves to the middle of its corridor (the engine's line keeps to the
inside of corners, so down a corridor it runs along one wall: across the stretch the open floor is
measured either side, and where both walls are within 3.5 m the stretch shifts by half the
difference, unless that takes it off the floor), then every corner becomes a circular arc of up to
3 m. Guards, from the route-line test (3 Nov). A stretch that doubles back across open floor (within
2 m) is drawn straight across first (`unhook`: the engine's network leaves some doors the wrong way and
turns back, as L2's BT-210 does). A room is not floor to any of this, except one the routes walk through,
with walkable floor under 80% of it or more (`room.through`: L1's Reception, the way into the admin suite;
the next room on the campus is 26%). Across Reception the line was the engine's own, kinked (10 Nov). A stretch that strays at most 0.4 m from straight is straightened where
that comes no nearer a wall than the line did (or than 0.3 m), not only where 0.7 m clears both sides: the
engine's line zig-zags round tight corners. A last look at each zig-zag on its own catches the ones whose
furthest point the splitting kept. Every arc stays on the floor: where a full one would clip a wall's
corner it is drawn tighter, down to a plain corner (fewer, longer stretches make bigger arcs). Where two
moved stretches meet nearly straight on, one point halfway between joins them. Before, a step across joined
them, which the arcs turned into an S-shaped kink: 92 places over the campus. A move that would send a
piece back against its own stretch is not made. A long straight run of the engine's line down a corridor
(6 m or more, both walls within 3.5 m and parallel to it) was straightened on into the bends either side and
tilted with them, so the whole line leaned against the walls: 0.85 m over 29 m down the east side of L4's gym,
1.1 m over 36 m past L3's Makerspace (6 Nov). So `straighten` can also keep such a run's two ends wherever one
straight line would tilt it by more than 0.25 m (`keepRuns`), and `smoothLine` draws the leg both ways and keeps
the one whose long stretches lean less in their corridors (`leanOf`): on 3,501 legs, 390 lean less and none
more, and the rest are drawn as before. That doubles the work on a leg that has such a run: about 0.7 ms a floor
leg (worst 10 ms), once per route. Before it, about 0.4 ms (worst 2 ms): `Floor.walkable`
counts a ray's crossings only over the outline's edges in the point's metre band (a corrected floor's
outline has 1,000-1,400 corners; tried one by one each test took 15-30 us, and a route 16 ms a leg). The line
is about a metre wide close up and 3.5–6 px whatever the zoom, so it stays inside a corridor drawn small. Step by step, the step's stretch is the line and
the rest of the route fades back; the stretch is the part of the same line between where the
step's start and end fall on it, so it follows the curves and stops at the turn. Where the route
crosses no part of the plan (the bridge on Toh Tuck's side, which the plan does not draw) a
walkway is drawn under it.

## How a route becomes directions (`directions.js`)

Per floor, the engine's line is simplified (1.5 m, so a wobble across a corridor is not a
turn) and cut where it bends by 40° or more over at least 3 m. A bend of 40–65° is "bear", up
to 150° "turn", beyond that "turn around"; two bends the same way within 8 m are one turn.
Turns in the last 5 m before the door you are making for go unsaid, and a second turn within
6 m of the first is said with it ("turn left at Stairs 11, then left again"), as is a turn a few
steps out of a door or a stair. A jog (a turn one way and, under 8 m on, back the other) is one
bend, said as its net turn, or not at all under 40°. A turn is named after a stair, lift, room code
or named place within 6 m (a pod, the canteen, the toilets; never an office named after a job),
then within 9 m; failing both, "at the end of the corridor" when the floor runs out a few metres
on (`Floor.walkable`); a second turn the same way says "again". The one the step before named is no news,
so the next one in reach is named instead, unless the corridor ends there (6 Nov: "walk towards Meeting
Room 2", then a bare "Bear right" beside Meeting Room 3; 1,252 of 19,948 test trips gained a landmark).
A merged jog is said where its bigger bend is. Leaving a room, left and right
are judged against the way you face coming out of its door, square to the door's own wall (`Floor.doors`
`ix, iy`; from the room's middle to its door, as it was, ran along the wall for a door by a corner: 10 Nov),
and a start that turns carries the turn (`dir`) for its arrow; arriving, the side the room is on against the
way you were walking (a room behind that way, or a walk whose last metres turn more than 60° from its main
heading, by the last 3 m instead), straight ahead for a room
you walk into (a library, the canteen), and the place by its sign ("the Secondary Library
(LKS-304)"; "the" only before a word for a place, so "Maintenance"). A floor walked nearly
straight to its goal (the path under 1.25 times the straight line) is one step: "head for
Stairs 8". Each step's stretch and distance are the drawn route's own points, so the steps add up
to the route's total.

Since the Chrome reviews (31 October): a turn back the other way within 12 m is said with the
first ("Turn left at Stairs 7, then right"). A room with a name people know is a landmark by name
and code ("the Transformer Room (KB-101)"; two names for one room give the first with their shared
noun), a classroom, store, initials or a job-title office by its code, and a room inside another
(`LKS-405-B`) never. A lift is told by its own name ("the Main Lift") or the stair beside it
within 12 m ("the lift by Stairs 14"), else a named place within 20 m. A start with no facing to
judge "straight on" by (a stair, the entrance) walks towards its first landmark. On a step-free
route a stair is passed "by", not turned "at". The Toh Tuck sheets draw most of the Linkway
Bridge, so the stretch of a walk on a floor's `bridge-deck` (cut where the walk steps off it) is
moved onto the crossing: the bridge step is the whole bridge, door to door; the covered walkway,
which only joins two sheets, gives no distance. `detourNote()` says why a route goes the long way:
it routes the trip again with every rule lifted (`sections: false, tolls: false`, every gate
open); if that is 20 s and a third faster, the zone the free route walks and this one does not
names the reason (a gate by its id, a toll by which area of `data/zones_evac.json` the free route
enters, else the section avoided). The time shown is still the walk's own.

Since the north site (1 November): out of doors (on a path, road, deck or crossing the map draws)
a turn names a landmark from twice as far, and where the way runs out it is "the end of the path",
not the corridor; the guard house is a landmark; the same landmark is not named twice running. That
counts the one a start walks towards, and a landmark left unsaid stays the last one named; the rooms a
trip starts and ends in are never its landmarks, by any of their doors (`TK-603-D2` is TK-603). A
**seam** (`seam()`: a bridge with no deck or crossing, BRIDGE-11 where L1's pool site meets TT_L1's
fire road) is no place to search for, no marker and no floor change in the list: its step says
"Carry on", the walk on from it starts with no "From …", and nothing heads for
it. The pool deck, the changing block's lobbies and the north driveways have their own detour notes.

## Search (`search.js`)

Room codes however typed (`kb305`, `KB 305`, `305`, `room 305`), the whole id a door label
prints (`L4:KB-405`), and names. Each word typed scores 3 for a whole word of a name (or its
plural, or a synonym: clinic → nurse, exit → entrance, 诊所 → 校医, 前台 → 接待), 2 for the start of
one, 1 for a typo (same first letter; one edit, two for long words); every word must match, and a
back room ("Library Workroom", "Canteen Kitchen") comes after the place. Chinese matches the whole
name, then a name ending with what was typed (中学图书馆), then one starting with it; Traditional
characters are read as Simplified (圖書館). A search that is only a kind (`toilet`, `wc`, `lift`,
`洗手间`, `电梯`, `食堂`) is that kind's chip, nearest first. A second door of one place
(`entranceOf`) is not listed on its own; a place with no code is told apart by the room it is
near (and the next, or a number, when two share it). A number with no room (`exactOnly` on a labels openSpace: L3
TK-306 and L2 TK-206, the bridge landings where their cells were; 3 Nov) is in the floor's `portalById` but
not its `portals`, so it is never drawn, tapped, named in directions or used to tell places apart, and in
`Places.exactOnly`, not `list`: only its whole code or number finds it (`306`, `TK-306`, `L3:TK-306`; not `30`).
A kind with other words is the kind near a place ("toilet near library", "library toilet"), unless the
whole of what was typed is a place's own name (`ask`: "main office", "red dot cafe", "canteen kitchen" are
those places; 10 Nov). Toilets, stairs and lifts keep their lists ("gym toilet" is the toilets nearest the
gym), and the place a list is near comes first when it is of that kind ("stairs 8"). Other names for a place (a subject, a teacher, a club) come from
`data/directory_evac.json` when the school fills it (`"aliases": {"L3:KB-305": ["Biology",
"Mr Chen"]}`); it is empty for now, and the map and routing never read it. With the other end of the trip known, each result shows its walking
time, distance and floor change ("1 min · 45 m · ↓1"; "via L5" for a place on your own floor that
the route reaches by another), the kind chips (Toilets, Lifts…) list the nearest first, ranked by
time so a flight of stairs counts, and typed results that match as well come nearer first. Before
anything is typed: recent places, or popular ones; for a start, the entrances and drop-off points
after the recent ones.

Since the Chrome reviews: synonyms for subjects by the rooms they are taught in (chemistry → science,
band → music, design → makerspace and STEAM, PE → gymnasium), the IB programmes (PYP → primary,
MYP/DP → secondary), the kindergarten (→ JK, SK, Pre-K, nursery), and their Chinese (化学, 音乐,
幼儿园…). Phrases that are one word (`PHRASES`: "sick bay", "car park", "senior kindergarten",
"college counselling"); a word with a slip in it takes a synonym key one edit away of nearly its
length ("cafteria" → cafeteria; "nurse" is not a slip for nursery). A room inside another
(`LKS-304-1`) comes after every room numbered as typed. `ask()` reads a kind of place somewhere:
a kind word or its Chinese, whose toilet (girls, boys, women, men, adults, accessible), a floor
("level 3", "L2", "tt 2", "3rd floor", "3楼", "三楼") and other words for a place to be near; the
list is that kind's chip on that floor, or nearest the best match for the other words ("Toilets near
Primary Library"); words with no kind are searched on that floor ("music room L3"). `findOn()` finds
an id that several floors have (a link's `STAIR-9`): the floor asked for, else the lowest.

**In the other languages** (2 Nov): `Places.setLang` puts each place's name in the language beside its
English and Chinese, and a search matches it too (`ownScore`), accents and case set aside (`fold`:
"bibliotheque" is the Bibliothèque): word by word for a language with spaces (a word inside a longer one
counts for Korean and Tamil, which join words; a slip for a Latin script), as the Chinese is matched
for Japanese, Thai and Traditional Chinese. `canon` first reads the language's words for a kind of
place, for whose toilet and for a level as the English ones and drops its small words ("les toilettes
du niveau 3" is "toilet level 3", "3階のトイレ" "level 3 toilet"), so `kindOf` and `ask` work unchanged;
its `synonyms` map words people type to the words its names use. English and room codes always match,
whatever the language.

**Toilets.** `data/toilets_evac.json` says what each toilet block holds, read off the door signs in
the school's virtual tour (31 October; four readers, one floor group each, zooming into every sign
near each block, with the photo and the confidence recorded per block). The signs: girls' and boys'
toilets say "Students only"; men's, women's and all-gender ones "Adults only"; older plates show
only a woman or a man. 27 of the 45 toilet-kind places are settled; 18 are listed as unknown (no
photo in sight of them) and stay "Toilet". Who a toilet is for is said with the sex first, then
students or adults, so the word for each sex stays the same (since 10 Nov 2026; "Girls", "Women" and
"Female" side by side read as a mistake): Female students, Male students, Female adults, Male adults,
All-gender adults, and plain Female or Male for a plate with no age. The keys stay `girls`, `boys`,
`women`, `men`, `adults`, `female`, `male`. A plain "Toilet" is named for what it holds ("Toilets
(Female students, Female adults)", "Female Students' Toilet"); one with a name of its own keeps it. The
Toilets chip gets a row of its own: Female students, Male students, Female adults, Male adults,
All-gender adults, Accessible. Each lists only the blocks that serve it (an adult may use an all-gender
adults' toilet; a plate with no age serves either), nearest first, each named for what was asked
("Nearest for female students"). "girls toilet", "female students toilet", "staff toilet", "女厕"
find them too. The map draws a block's figures for who it is for (a girls' block shows the woman's
figure alone) and, room permitting and wholly on the screen, its caption ("Female students · Female
adults"); the door labels name it the same way.

## Door labels (`qr.html`)

`app/qr.html` prints a label for every place on a floor, twelve to an A4 page (62 × 68 mm, three
across and four down), laid out after the brand guide's door plate: a red bar, the room number
first and big (Hanken ExtraBold; a place with no number has its name there instead, smaller, on
up to two lines), its English and Chinese names, the floor in both languages, the room it is near
when another label on the floor would read the same; then a 30 mm QR code opening
`app/?here=<floor>:<id>`, "Scan for directions" in both languages and the CIS | MAP lockup, its
baseline on the code's bottom edge and the words' top on its top (the side column is padded by the
code's own white margin, `--quiet`, which shrinks as a longer link makes a bigger code). Its id
is in the code's link, not printed. Every name prints whole: the number on one line and the
names on two, shrunk to fit, and a label that still cannot hold its name is outlined and
counted. The red bar prints without the browser's "background graphics" option. A search box finds one label to reprint; the page is in English and Chinese. The first box takes the address the app is published at, and remembers
it. `qr.js` is a QR encoder written for this (byte mode, level M, the mask picked by the
standard's penalty rules); the page reads every code back with the browser's barcode reader
(Chrome has one) and outlines in red any that does not come back as its link. All 599 labels
across the ten floors read back (1 Nov).

## Offline (`sw.js`)

Once loaded, the app works with no connection. Each request goes to the network first, so a
new map shows at once; only when the network fails does the last copy answer. Every
request asks the server whether the file changed (`cache: 'no-cache'`, a 304 when not): left
to the browser's own cache, a new `main.js` once arrived beside an old `search.js` and the app
would not start. The service worker controls `app/` only: the shipped app at the root is
untouched. Change `CACHE` in `sw.js` to throw every old copy away (its own copies only, `cismap-*`: the
site's other pages on worldwiderad.github.io share the origin's caches). An error from the server (a 503,
a filter's block page) counts as a failed request: the copy answers if there is one (the final bug check,
6 Nov).

A network that answers but crawls: the app's own page waits `PAGE_WAIT` (4 s) and then opens from
the saved copy, and that page's `resultingClientId` goes in `fromCopy`, so everything it loads after
comes from the same copy (and the late answer is not stored). The page decides once for all its
files; a single file never races the network on its own (that once mixed versions). Browsers that do
not give `resultingClientId` wait for the network as before. Tested against a server answering the
page in 10 s: open after 4.0 s, with only the page and `sw.js` asked of the server.

## The screen (`main.js`, `app.css`)

* **The language page.** A first visit opens on it: the languages the app speaks, each by its own
  name, the phone's own language (`navigator.languages`) highlighted, else English. One tap opens
  the map in that language, or, if the map is still loading, a wait in it. The choice is kept
  (`localStorage`), and later visits go straight to the map; a link's `lang=` decides without the
  page. The bar's 文A button opens the page again over the map (the buttons alone; Back closes
  it, and the search or a step it interrupted comes back). Sixteen languages, two to a row, each row
  a pair (English and French, the two Chinese, Korean and Japanese, Spanish and Portuguese, Hindi and
  Tamil, Malay and Indonesian, Vietnamese and Thai, German and Tagalog, the last two added after). Its heading is the sign for languages, the 文A
  of the header's button, drawn large (2 Nov: simpler than words in one language), on a first
  visit and from the header alike; a screen reader hears it in the phone's language (or the current
  one). On a short phone (an SE) the sign and rows tighten so all sixteen are in sight. Opened from the header by a key, the
  keyboard lands on the current language; by a tap, on the page itself (Safari drew the focus ring after a
  tap too, and the scrolling box clipped it at the screen's edge: the box has 6px of room for a ring now). Contrast meets
  WCAG 2.1 AA (3 Nov), the look kept: white on the CIS red 4.9:1; a language button a 6% white tint,
  its white text 4.56:1 (the 14% tint it was gave 4.1:1); hover brightens the edge, not the fill; the
  chosen one red on white, 4.87:1. (A dark fill passed with more to spare but looked like a high-contrast
  mode, so it was dropped.)

* **Languages** (`i18n.js` `LANGUAGES`; 2 Nov). English and Simplified Chinese are in `i18n.js`;
  each other language is `lang/<id>.json`, fetched when it is chosen (before the first screen on a
  later visit, waiting up to 1.5 s for it, else English until it comes) and kept offline by `sw.js`.
  A file holds the language's `strings`, its `names` (the map's English names -> its own, a number
  as `#`: "Science Lab #"; `nameIn` reads them, the map's own Chinese first) and its `search` words.
  Fonts per script (`fontFor`, and `:lang()` in app.css): the script's own font on the phone first,
  so Japanese kanji are Japanese; Vietnamese all in the phone's font (the bundled Hanken lacks its
  letters with two marks). The lockup's MAP is the language's own two characters where it has them
  (地图, 地圖, 地図, 지도). Thai on the map breaks between words (`Intl.Segmenter`), Japanese as
  Chinese. To add a language: its entry in `LANGUAGES` (with its heading and button name, so the
  language page needs no file) and its file from `tools/i18n` (README there). Anything a file lacks
  is said in English.

* **Back** closes what is open before it leaves the app: the search, the share card and step by
  step each open on a history entry of their own (one at a time); one opened while a Back is on
  its way waits for it. A route on the map has an entry too, under those: Back from it takes the
  destination away (the start stays, the door you scanned, say) before it leaves. In a frame (the
  slideshow's three phones, which share the tab's history) the entries are kept in the page (`hist`),
  so one phone's Back cannot land in another's (10 Nov).
* **On a wide screen** a clicked step shows its stretch of the route; Escape, or a second click on it,
  goes back to the whole route (there is no step bar there).
* **A wide screen with no trip yet** shows the kinds of place and the popular places in the
  panel, a click from being the destination.
* **A short phone** (640 px tall or less): the open sheet scrolls as one, so the steps get the
  screen rather than what the trip card and the buttons leave them. **A very narrow one** (300 px
  or less: a phone with its text at 200%): the sheet scrolls in every state but its line, and the
  "MAP" wordmark gives way to the language button.
* **A phone held sideways** pads its notch side (`--safe-l`, `--safe-r`: the bar, the panel, the
  floor buttons, the search).
* **More contrast** (`prefers-contrast: more`, iOS Increase Contrast and the like): the map's walls,
  outlines and ground darker (`MORE_LIGHT`, `MORE_DARK` in `map.js`: walls 3.6:1 and more on the corridors)
  and the interface's greys and hairlines too. Since 3 Nov everyone's walls are 3:1 on the corridors (WCAG AA for a
  graphic; they were 1.6:1 light, 1.4:1 dark), the stairs kept two steps from them (`stair`, `stairIcon`: dark with
  white treads in light, light with a dark icon in dark).
* **Why a route goes the long way** shows as a line under the summary (`#route-note`, from
  `detourNote()` in `directions.js`), hidden in step mode.
* **Step mode's first time** says under the first step that the map does not track you: tap › for
  the next (`stepsSeen` in `localStorage` once › is tapped).
* **Arriving**: drop-off zones are kind `drop` (a car), the bus bay `bus` (a bus), the Main Entrance
  `entrance` (a door with an arrow), in lists and on cards; they were `outdoor` (a tree), which is
  now gardens, fields, courts and play areas. The map's fills for them are unchanged.
* **The brand font** comes from the school website's font host as a stylesheet that does not hold
  up the first paint (`media="print"` swapped on load; its faces are `font-display: swap`, and the
  map redraws when they arrive). The directory, toilet and zone files are asked for with the floors.
* **The map's names keep clear of the floor buttons**: a name that would run under them moves to
  the part of its room still in sight, or waits until the room is.
* **The phone's sheet** has three states: a line, the trip, the trip with every step. It follows
  the finger and, let go, glides to the nearest state or, flicked, the next (its height eased in
  CSS from wherever it is; each state's height measured, not guessed). Step by step shows only
  the step (with Done at the door).
* **Share** on a phone is the phone's own share sheet (else the link copied); on a wide screen it
  is the QR card, to carry the trip from a laptop or a lobby screen to a phone.
* **Dialogs** keep Tab inside them; behind them the map, the sheet and the home link are inert
  (the language button stays live for the search).
* **The floor column** is one button per level, 6 to 1 (31 Oct: the Lakeside/Toh Tuck
  switch went, since a level's two wings are drawn together and the floor you are on follows the
  view). A level picked by hand shows the route on it, else the whole level (both wings); its floor
  is the route's, else the wing you are in, else Lakeside's. The column folds into one floor button
  when it would not fit beside the sheet, and while stepping; the button opens the whole list and
  the sheet steps down to make room. There is no separate floor name on the map (the floor buttons
  say it); it is kept for screen readers.
* **A bridge is an area**, not a portal: `floors.js` gives each bridge's deck (the covered
  walkway's zebra crossing) its portal's id, middle and axis (`areaOf`), and both doors `area`. The
  map draws the bridge's marker mid-deck with the name along the deck when it fits; a tap anywhere
  on the deck picks the bridge, which is tinted and outlined like a room; the directions still say
  "Cross the Linkway Bridge".
* **The trip's ×** ("Directions ×" over the trip, whenever a start or a destination is set) clears
  both and shows the plain map, taking the trip's history entry with it; a start scanned from a
  door stays as "You are here" until a second × (round 7).
* **A chip where the route changes floor** sits clear of the lift or stair it marks: above it,
  below, beside (right, then left), whichever covers nothing it should not.
* **A phone held sideways** gets the wide layout (`WIDE` in `main.js`, the same query in
  `app.css`). The grid rows are `minmax(0, 1fr)`: a plain `1fr` let a long list of steps grow the
  map past a short screen.
* **"You are here"** comes only from `here=` (a door label). The address bar writes `from=`, so a
  link passed on never claims it, and this tab remembers it (`sessionStorage`) so a reload does.
  **Step-free** is remembered on the device; a link's `stepfree=` wins.
* Under the search or the share card the map and sheet are `inert` and hidden from screen
  readers; the red bar stays live. The search box is a combobox over a listbox.
* **Dark mode** follows the phone: CSS tokens, and two palettes for the map (`LIGHT`, `DARK` in
  `map.js`), swapped live.
* **Since the brand guide (31 Oct night)**: a tapped place's card replaces the route sheet (its back
  arrow returns). Review round 7's fixes: step by step, the chips of floor changes already made
  are not drawn (`map.setPassed`, each connector step being one of the route's changes), nor a chip
  whose stair is off the screen; a level's first view frames both wings (`map.levelBox`); a phone
  held sideways (`SHORT`) steps like a phone, the trip card giving way and the panel scrolling with
  the step bar held at its top; an upright iPad (768 px and wider) gets the wide layout with a 340 px
  panel; the trip's × keeps a scanned door as "You are here" (a second × clears it); a destination
  waiting for its start has its own Back step; a room's name drawn outside its room sits on a card.
* **The step list is the guide's train line** (1 Nov, after the six-shot comparison): one
  3 px red line through the steps, dashed from a stair or lift to the first step on the floor it
  reaches (`climb`, `climbed`); turns are 30 px ringed stops with the arrow in ink, emboldened by a
  stroke, so a bear and a turn tell apart at a glance; changes of level and the arrival are solid
  red stops with bold text; the start is the blue dot with its halo, as in the From field. A floor is its level,
  "Level 2" and "L2" short, in every wing: until 10 Nov the TT rooms' floors said "Level 2 · Toh Tuck",
  a building of their own as the evacuation plans had it (the owner: "a relic from the evac plans"). A
  level is headed once in the step list, the bridge and the covered walkway name no floor ("Cross the
  Linkway Bridge"), and the door-label sheet offers one choice a level (`qrsheet.js`).
* **Shapes know which way they run** (1 Nov): `frameOf` (floors.js) is each
  shape's smallest rectangle (rotating calipers on its hull), snapped to its floor's own axes within
  12 degrees; `MapView.inFrame` draws treads, a zebra's bars and a court's lines in it, so the upper
  field and Toh Tuck's gym and stairs are marked the way they run. A lift's block is the lift's own
  frame round its shaft holes, and a hole that is another room's is not its shaft.
* **A wall inside every room's edge** (`WALL_IN`, 0.18 m, map.js): stroked once per floor along
  `roomEdges`, clipped to the rooms, so two rooms side by side get 0.36 m of wall where the sheet
  left no gap (the theatre's practice rooms had only a hairline). Doors cut it from the room's side
  (`d.ix`, `d.iy`: into the room).
* **The visual pass (1 Nov)**: walls are stroked with mitred corners (`miterLimit` 2); room
  hairlines draw only while `WALL_IN` is under 1.5 px; `footprints.py` writes `pockets` (gaps in the
  footprint a 1.6 m disc fits, grown back to 0.5 m short of the shapes) and the map fills them
  `C.blank` over the walls; a hole under a round void or a round room (`isRound`) is floor, the
  round thing on top; `arcOf` (outer side of a curved flight fitted to a circle) gives radial
  treads; `tiers` features (seating banks) rule along their length; `joinBridges` leaves a
  `bridgeMouths` opening on both floors, painted with the door ways (`MapView.doorWays`, one cached
  path, also tinted and hatched in a staff-only zone); the bridge deck is edged in its own colour.
* **The phone sheet open reaches just under the bar** (`.sheet.open` max-height); a sheet brought
  up closes the floor list; the open list hides the pill; while open, the trip head's corner is
  `#btn-down` ("Show the map", to the trip card) in place of `#btn-end` (clears the trip).
* **The north site's car park bays** are features of kind `parking` (the road's grey, a shade deeper);
  the North Entrance is offered among the ways in when choosing a start.

* **The second pass (1 Nov)**: a bridge deck is painted again after both wings of its level
  (`MapView.drawDecks`), so the other wing's walls never cover its end, and `joinBridges` lays its end
  along the corridor edge it comes in through; gaps among the site's outdoor features are open ground
  (`footprints.py` `ground`, drawn `C.ground`, 0.3 m of wall only against the building), indoor ones
  stay `pockets`; a room reached through another (L3's practice rooms) gets its door from the labels'
  `doorAt` (the build copies it to the portal as `door`), cut through both rooms' walls (`d.via`,
  `d.gap`; such a door has no way out to a corridor in `doorWays`).
* **Second doors (3 Nov)**: a room's second door (a classroom's back door, from the CAD: tools/audit/doorpins.mjs) is a
  labels openSpace `<ROOM>-D2` with `entranceOf` the room; `Floor.doors` cuts it in the room's wall too
  (`p.room || roomById.get(p.entranceOf)`), search lists the room once, and a route to or from it takes the nearer door.
  Directions name it by its room at both ends ("Leave KB-305", never "KB-305-D2"; directions.js routeSteps, 4 Nov),
  keeping the door's place for which way you face; check.mjs fails a trip that prints a door's id.
* **The CAD merge (1 Nov, evening)**: `corrections` (see "How the map is drawn"); the atrium void is a
  true circle in campus metres (7.3 m, the CAD's centre) on L2-L4, Stairs 5 the CAD's two flights.
* **The TK wing's south end (2 Nov)**: `corrections.json` `tk-south` (L2-L4, one profile from the CAD's walls) and
  `tk-south-L5`; L5's and L1's Stairs 13/14 are `stairBoxExact` boxes at the CAD's cores (L1's also cut from the floor
  by `noWalk`, as nothing else does off their tiles), and every floor's lift by Stairs 14 (`ELEV-2`, an `extraRooms`
  box) is on the CAD's shaft, all computed through `campus.to_px` so they land after the corrections.
* **Outlines that fold (2 Nov)**: `mapRing` skips the points a move along an edge's own line jumps back over (a stub
  past the corner, the Secondary Library's south side); `check.mjs` fails on any room or area outline that crosses
  itself as drawn.
* **The status bar on iOS (2 Nov)**: Safari 26 tints it from the page's first paint and keeps it (`theme-color` is
  ignored), so `#gate` (the red language page, also the loading screen) starts `hidden` in index.html and `showGate()`
  reveals it: painted first, it left the bar red over the white header.
* **Start points (2 Nov)**: a labels openSpace with `entranceOf` and `side` ({en, zh}, the build copies it to the
  portal, floors.js keeps it) is a side of a big place: `Places` gives the place `sides` and each side `sideOf`.
  `main.js setFrom()` asks which side when a start has two or more: the card takes the whole sheet (`.sheet.carding
  .siding`, `#card-sides`), `map.setSides` numbers pins, the place's room or area is framed; a link to a side starts
  there. As a destination a side is its place (`asDest`: swap, links), and `tools/routing/build.mjs` gives such a
  place only its sides as doors, so a trip ends at the nearer side. `directions.js`: a start at a side says `leaveBy*` ("Leave the
  Secondary Library by the atrium side"); a trip to the place arrives at it by name (`end` merged with its main).
  `qrsheet.js` labels each side, not the place. Sides: L2 LKS-207 and L3 LKS-304 (ATRIUM, STAIRS2), L4 GYMNASIUM
  (N, S). Since 6 Nov `compute()` asks too whenever a trip's start is the place itself (a link naming no side, an old
  label, a swap): it had started at whichever side was nearer the destination. `nextStop()` starts the next walk at
  the side the last one ended at (`arrivedBy`: the side whose door is nearest the route's last point).
* **2 Nov (morning)**: `mapRing` keeps the jump where an edge crosses a hard region edge (a step; left
  straight, the canteen's north side drew a 3 m wedge); `footprints.py` works in campus metres on corrected
  floors and every layer fills nonzero (see "How the map is drawn"); the `block-south` corrections; Stairs 8's
  door on its north side (L1-L3, L5); `KITCHEN-PASSAGE-L1`/`-L2` in `data/zones_evac.json` (gated, staff only).
* **2 Nov**: `mapRing` also cuts up an edge whose two ends a correction weights differently (quarter metres;
  then left straight where the cuts jumped, at a hard edge: since 2 Nov morning the jump is kept), so an outline bends through a fade instead of one slant
  (the 20-30 m wedges north of the theatre block on L2-L4); a numbered stair's flights (`stair-flight`,
  `STAIR-n-...`) are labelled with the stair icon and number; a `divider` is one dashed line along its frame
  (L4's gym curtain); the staff-only tint and hatch go over door cuts only where they pass the floor (twice,
  they made dark patches); open corners between a bridge and a building are `open-air` features (TT_L2/TT_L3).
* **The front from the CAD (1 Nov, late)**: L1's curved band of rooms, its corridor and the Reception
  arm, the lobby's entrance wall and the Drop-off outside it; the library's north side on L2 and L3
  (the glazed bay, the rooms east of it, the corridor to Stairs 2); L3's curved auditorium back wall
  and the library aisle beside it; Stairs 1 at the CAD's stair on L1-L3. Placed through the labels as
  above.

## Browsers

Safari 14.1 and Chrome 87 or later (iOS 14.5, Android from 2020): `inset`, flex `gap` and `||=`
set the floor. Checked by reading, not on old devices. Two newer things crept in and were taken out on
10 November: a regular expression with a lookbehind in map.js (iOS before 16.4 cannot parse it, and then
nothing starts) and `Object.hasOwn` in search.js (Safari before 15.4). The door-label page (qrsheet.js)
uses a top-level `await`, so it needs Safari 15; it is for whoever prints the labels, on a computer.

## Known limits

* The two wings meet where two schematic sheets meet: the bridge's Lakeside end flares a little
  on L3 to take in a door the sheets place a metre apart, and TT_L1's sheet draws the road and its
  west edge more narrowly than they are.
* Directions name turns after rooms, stairs and corridor ends; about one turn in nine still has
  nothing to name. Nothing yet after what you see (a sign, a colour, a view); the school's photo
  tour (`tools/tourkit`) could supply that.
* No search by teacher: there is no timetable data. Subjects find the rooms they are taught in
  only by synonym (chemistry → the science labs), not by who teaches what where.
* Text sizes are set in px: the phone's own text-size setting changes little (page zoom works).
* "Lakeside" and "Toh Tuck" stay in English in the Chinese text.
