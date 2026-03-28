# CLAUDE.md

## Coding Conventions

### General
- Keep code simple and direct. Avoid premature abstraction.
- No build tools or bundlers for the web components — plain HTML/CSS/JS served as static files.
- All paths in JSON data files use image-pixel coordinates, not screen coordinates.
- Comments should explain *why*, not *what*.

### JavaScript (Viewer & Tools)
- Vanilla JS unless a library provides clear value (e.g., UI dropdowns, canvas helpers).
- Use `const` by default, `let` when reassignment is needed, never `var`.
- DOM queries: `document.querySelector` / `querySelectorAll`.
- Mobile-first: all UI must work on phones. Test with iOS Safari assumptions (dvh units, no hover states).

### C++ (Engine)
- C++17 minimum. Use standard library containers and algorithms.
- `nlohmann/json` for JSON I/O.
- Single-file builds are acceptable for simplicity; CMake preferred for anything multi-file.
- All geometry calculations use `double` precision.

### CSS
- Mobile-first, viewport-locked layouts using `dvh` units.
- Flexbox for layout. No CSS Grid unless clearly warranted.
- No media queries for desktop — this is a mobile-only app.

## Bilingual UI
- The Mobile Viewer supports English and Simplified Chinese (zh-CN).
- All user-facing strings must have both language variants.
- Language toggle must be accessible without scrolling.

## Data Pipeline
```
Floor plan image
    → /tools/navmesh_mapper.html (developer digitizes geometry)
    → /data/navmesh_data.json (polygon + portals)
    → /engine_cpp (C++ baker computes all paths)
    → /data/baked_paths.json (pre-baked route coordinates)
    → index.html + js/app.js (viewer looks up and draws paths)
```

## Key Constraints
- The viewer does **zero** pathfinding at runtime. It only indexes into `baked_paths.json`.
- `baked_paths.json` may be large (~several MB). The viewer must handle this gracefully (lazy load, cache, etc.).
- QR codes link directly to `index.html` with query params for the starting portal. The app must parse these on load.
