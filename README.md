# CIS-MAP

## Project Overview

CIS-MAP is a bilingual indoor navigation system for the Canadian International School (CIS) campus. It gives anyone — new students, ELL intake, parents, event delegates, visitors — instant walking directions between any two points in the building. No app store download, no login, no cost to the school.

The system relies on an **Offline Baking Architecture**. All pathfinding is pre-computed by a custom C++ program using A* search, Laplacian relaxation smoothing, and Ramer-Douglas-Peucker simplification. The results are exported as a static JSON lookup table. A lightweight, bilingual, mobile-web frontend reads this table to provide instant, offline-capable routing for students scanning QR codes in the hallways.

A supplementary **3D navigator** built with Three.js provides an immersive flythrough visualisation of the campus corridors for demonstration and presentation purposes.

### Current State

A fully functional prototype covering Level 4 of the campus. Includes all 53 locations (classrooms, staircases, elevators, pods, offices) with over 2,700 pre-computed routes covering every origin-to-destination pair. The mobile interface supports pan, zoom, bilingual toggle (English / Simplified Chinese), and QR deep-linking. The 3D demo generates a procedural corridor environment from the same polygon data and supports cinematic flythrough + interactive route display.

### What Is Needed Next

Floor plan images or architectural drawings for the remaining floors. The system is floor-agnostic — adding a new floor takes 1–2 hours of mapping work and ~30 seconds of computation.

### Broader Vision

- **Parents and visitors** — QR codes in the lobby for PTA meetings, open days, parent-teacher conferences.
- **CISMUN and events** — Delegates find committee rooms via QR codes on lanyards.
- **Multilingual expansion** — Architecture supports additional language packs (Korean, Japanese, Tamil). Content task, not a technical rebuild.
- **Cross-floor routing** — Link floors at shared staircases and elevators for directions like "take Stair 2 down to Level 3, then walk to Room 302."
- **End goal: map.cis.edu.sg** — A school-maintained resource with documentation, admin tooling, and a handoff that doesn't depend on any individual student.

## System Architecture

The project is divided into four operational domains:

### 1. The Mapping Tools (`/tools`)
* **Purpose:** Web-based authoring tool to digitize physical floor plans into the vector-map geometry the whole pipeline consumes.
* **Tech Stack:** HTML5 Canvas via Paper.js (CDN), vanilla JavaScript.
* **Layers & modes (v2):**
  * `walkable` — the single CCW corridor polygon (baker routes inside this)
  * `blocked` — visible-but-non-routable regions (e.g. the gym; rendered on the map but the baker must not path through)
  * `rooms` — room footprints (rendered dimmed in the viewer; each may cross-reference a portal ID as its entry point)
  * `portals` — named POIs snapped to the walkable boundary, with type, bilingual label, and optional cross-floor link metadata
* **Editing:** vertex drag to move, click-on-edge to insert, Alt-click to delete; undo/redo stack (50 deep); pan (middle-mouse or Space-drag) and wheel-zoom with zoom-compensated handle sizes; validation panel flags CCW, self-intersection, duplicate portal IDs, orphan room→portal references; localStorage auto-save survives refresh.
* **Custom-map authoring:** background image has an opacity slider and a hide toggle. When hidden, the mapper previews what the viewer will render without the raw floor-plan photo — walkable fill, blocked fills, dimmed rooms, portal markers.
* **Output:** `navmesh_data.json` — schema v2, backward-compatible with v1. Top-level keys: `schemaVersion`, `metadata` (floor, building, timestamps), `image`/`imageWidth`/`imageHeight`, `style`, `polygon` (walkable CCW, unchanged from v1), `portals` (now with `type`, bilingual `label`, optional cross-floor `link`), plus new `blocked` and `rooms` arrays. The baker and 3D navigator read only `polygon` + `portals.{id,x,y}` — extra fields are ignored, so schema expansion is invisible to them.

### 2. The Offline Baker (`/engine_cpp`)
* **Purpose:** A C++ executable that reads `navmesh_data.json` and computes the optimal path between every pair of portals.
* **Tech Stack:** C++17. `nlohmann/json` for JSON I/O (auto-fetched via CMake `FetchContent`).
* **Algorithm pipeline:**
  1. Build a distance-field grid (18px cells) over the polygon interior
  2. A* pathfinding with wall-distance cost weighting (`K_CENTERING = 25.0`) — naturally centres routes in corridors
  3. Laplacian relaxation smoothing (30 iterations, constrained to polygon interior)
  4. Ramer-Douglas-Peucker simplification (epsilon = 8px)
  5. Perpendicular re-centering pass (nudge waypoints toward corridor midline)
  6. Backtrack removal (negative dot product detection)
* **Build:** `cd engine_cpp && cmake -B build && cmake --build build --config Release`
* **Run:** `cd engine_cpp/build && ./baker ../../data/`
* **Output:** `baked_paths.json` (~944 KB) — pre-computed coordinate arrays for all portal-to-portal routes.

### 3. The 2D Mobile Viewer (`index.html` + `js/app.js`)
* **Purpose:** The production web app for end-users. Deployed via GitHub Pages, triggered by QR codes.
* **Tech Stack:** Vanilla HTML, CSS, JavaScript. No frameworks, no build tools.
* **Behaviour:** Zero runtime pathfinding. Takes the user's start/destination inputs, looks up the corresponding route in `baked_paths.json`, and draws it on a pan-zoomable canvas with smooth corner rounding (`ctx.arcTo`).
* **Features:** Bilingual UI (EN / 中文), QR deep-linking via query params (`?start=NW-412`), native autocomplete for portal names, glow + core line route rendering, start/end markers.
* **Constraints:** Mobile-first. Uses `dvh` units, `safe-area-inset`, pointer events. No desktop media queries. Designed for iOS Safari.

### 4. The 3D Navigator (`/3d`)
* **Purpose:** Supplementary immersive visualisation for demonstrations and presentations. Not for daily navigation use.
* **Tech Stack:** Three.js r128 (non-module, vendored in `/3d/lib/`), vanilla JavaScript.
* **Geometry:** Procedurally generated from the same `navmesh_data.json` — floor, walls, ceiling, portal markers, edge glow. No 3D models or external textures.
* **Camera modes:** Cinematic flythrough (auto-plays on load), smooth transition, interactive orbit.
* **Route display:** Flat ribbon mesh with straight line segments (no curve overshoot), runner dot, start/end markers. All rendered with `depthTest: false` to avoid clipping through transparent walls.
* **Post-processing:** UnrealBloomPass at half resolution for emissive glow effects.
* **Performance:** Optimised from 3fps → 60fps by removing 53 dynamic point lights, disabling shadows, downgrading materials, culling labels, reducing particles, and capping pixel ratio.

## File Structure

```
README.md                     — This file (project overview and architecture)
CLAUDE.md                     — Coding conventions and constraints
index.html                    — 2D Mobile Viewer entry point
css/style.css                 — Viewport-locked, mobile-first styling
js/app.js                     — 2D viewer logic (inputs, language, canvas rendering)
3d/index.html                 — 3D Navigator entry point
3d/main.js                    — 3D scene generation, cameras, animation, route display
3d/lib/                       — Vendored Three.js r128 (three.min.js, OrbitControls, bloom, CSS2D)
tools/navmesh_mapper.html     — Developer tool for digitizing floor plans (Paper.js)
engine_cpp/main.cpp           — C++ offline path baker
engine_cpp/CMakeLists.txt     — CMake build config (auto-fetches nlohmann/json)
data/navmesh_data.json        — Raw geometry: polygon vertices + portal positions (input)
data/baked_paths.json         — Pre-computed routes for all portal pairs (output)
assets/img/lvl4map.jpg        — Floor plan background image
```

## Data Pipeline

```
Floor plan image
  → /tools/navmesh_mapper.html    (developer traces corridor polygon + places portals)
  → /data/navmesh_data.json       (76 polygon vertices + 53 portal IDs & positions)
  → /engine_cpp/baker              (grid → A* → Laplacian → RDP → centering)
  → /data/baked_paths.json         (2,756 pre-computed routes, 944 KB)
  → index.html + js/app.js        (2D viewer: instant lookup, draws on canvas)
  → 3d/index.html + 3d/main.js    (3D viewer: procedural geometry + flythrough)
```

## Privacy

The app collects nothing. No user accounts, no cookies, no analytics, no server logs, no network requests after initial load.

## Adding New Floors

Each floor is independent. Adding one requires:
1. A floor plan image or architectural drawing
2. Running the mapping tool to trace corridors and mark locations (~1–2 hours)
3. Running the C++ baker to compute all routes (~30 seconds)

Cross-floor routing (linking floors at shared staircases/elevators) is a planned future expansion.
