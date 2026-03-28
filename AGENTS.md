# AGENTS.md

## Project Overview
This repository contains a two-part system for an indoor navigation tool designed for English Language Learner (ELL) students at the Canadian International School (CIS).

The system relies on an **Offline Baking Architecture**. Complex routing mathematics (Visibility Graphs, Dijkstra shortest paths, Catmull-Rom spline smoothing) are computed locally in C++ to generate perfectly smooth paths. These paths are exported as a static JSON package. A lightweight, bilingual, mobile-web frontend then reads this package to provide instant, offline-capable routing for students scanning QR codes in the hallways.

## System Architecture

The project is strictly divided into three distinct operational domains:

### 1. The Mapping Tools (`/tools`)
* **Purpose:** Web-based utilities for the developer to digitize physical floor plans into mathematical data.
* **Tech Stack:** HTML5 Canvas via Paper.js (CDN), JavaScript, CSS. External frameworks and libraries are **fully permitted and encouraged** to speed up development.
* **Current Output:** A single continuous polygon representing walkable hallway space, and edge-snapped "portals" representing classroom doors, exported as `navmesh_data.json`.

### 2. The Offline Baker (`/engine_cpp`)
* **Purpose:** A local C++ executable that reads the `navmesh_data.json`, builds a visibility graph of all portals and polygon vertices, runs Dijkstra's algorithm for the shortest interior path between every portal pair, and applies Catmull-Rom spline smoothing.
* **Tech Stack:** C++17. `nlohmann/json` for JSON parsing (fetched automatically via CMake `FetchContent`).
* **Build:** `cd engine_cpp && cmake -B build && cmake --build build --config Release`
* **Run:** `cd engine_cpp/build && ./baker` (reads `../../data/navmesh_data.json`, writes `../../data/baked_paths.json`)
* **Output:** Generates a comprehensive `baked_paths.json` file containing pre-calculated coordinate arrays for all portal-to-portal routes.

### 3. The Mobile Viewer (`/public` or root)
* **Purpose:** The production web app deployed via GitHub Pages for end-users. It must be blisteringly fast and execute instantly when triggered by a QR code.
* **Tech Stack:** HTML, CSS, JavaScript. External UI/Utility frameworks are permitted, provided they do not severely bloat the mobile load time.
* **Behavior:** This app is "dumb." It does absolutely no pathfinding math. It simply provides a bilingual (English/Simplified Chinese) UI, takes the user's Start/End inputs, looks up the corresponding coordinate array in `baked_paths.json`, and draws it on the scaled map canvas.
* **Constraints:** Must use dynamic viewport height (`dvh`) and strict flexbox layouts to prevent iOS/Safari virtual keyboards from breaking the layout.

## File Structure Conventions
* `AGENTS.md`: This file.
* `CLAUDE.md`: Agent coding guidelines and conventions.
* `/tools/navmesh_mapper.html`: The developer tool for digitizing the map (Paper.js).
* `/engine_cpp/main.cpp`: The C++ baking engine (visibility graph + Dijkstra + Catmull-Rom smoothing).
* `/engine_cpp/CMakeLists.txt`: CMake build instructions (auto-fetches nlohmann/json).
* `/data/navmesh_data.json`: Raw geometry data (Input for C++).
* `/data/baked_paths.json`: The compiled route package (Output from C++, Input for Web App).
* `/assets/img/lvl4map.jpg`: The floor plan background image.
* `index.html`: The main Mobile Viewer UI.
* `css/style.css`: Viewport-locked, mobile-first styling.
* `js/app.js`: Main application logic for the Viewer (handles inputs, language toggling, and canvas rendering).

## Data Flow
```
lvl4map.jpg
  → /tools/navmesh_mapper.html   (developer traces hallway polygon + places door portals)
  → /data/navmesh_data.json      (polygon vertices + portal IDs & positions)
  → /engine_cpp/baker             (visibility graph → Dijkstra → Catmull-Rom smooth)
  → /data/baked_paths.json        ({"Start_ID": {"Dest_ID": [{x,y},...]}})
  → index.html + js/app.js       (viewer looks up route by IDs, draws on canvas)
```
