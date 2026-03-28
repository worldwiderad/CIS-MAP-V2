// ============================================================================
//  CIS Indoor Navigation — Offline Path Baker
// ============================================================================
//  Reads  : ../data/navmesh_data.json   (polygon + portals)
//  Writes : ../data/baked_paths.json    (smoothed paths for every portal pair)
//
//  Pipeline:
//    1. Parse the walkable polygon and portal list.
//    2. Build a distance-field grid over the polygon interior.
//       Each cell knows how far it is from the nearest wall.
//    3. Run A* on the grid for every portal pair, with cell costs
//       inversely proportional to wall distance. This forces paths
//       through corridor centers, not along walls.
//    4. Smooth the grid-aligned path with constrained Laplacian
//       relaxation (same safety guarantees as before).
//    5. Export as nested JSON.
// ============================================================================

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cmath>
#include <limits>
#include <queue>
#include <algorithm>
#include <iomanip>
#include <unordered_map>

#include <nlohmann/json.hpp>

using json = nlohmann::json;

// ────────────────────────────────────────────────────────────────────────────
//  2D Vector
// ────────────────────────────────────────────────────────────────────────────

struct Vec2 {
    double x, y;
    Vec2() : x(0), y(0) {}
    Vec2(double x, double y) : x(x), y(y) {}
    Vec2 operator+(const Vec2& o) const { return {x + o.x, y + o.y}; }
    Vec2 operator-(const Vec2& o) const { return {x - o.x, y - o.y}; }
    Vec2 operator*(double s)      const { return {x * s, y * s}; }
    double dot(const Vec2& o)     const { return x * o.x + y * o.y; }
    double cross(const Vec2& o)   const { return x * o.y - y * o.x; }
    double length()               const { return std::sqrt(x * x + y * y); }
    double lengthSq()             const { return x * x + y * y; }
    double distTo(const Vec2& o)  const { return (*this - o).length(); }
    Vec2 normalized() const {
        double len = length();
        if (len < 1e-12) return {0, 0};
        return {x / len, y / len};
    }
};

// ────────────────────────────────────────────────────────────────────────────
//  Geometry Primitives
// ────────────────────────────────────────────────────────────────────────────

static constexpr double EPS = 1e-9;

bool segmentsProperlyIntersect(const Vec2& a1, const Vec2& a2,
                               const Vec2& b1, const Vec2& b2) {
    auto orient = [](const Vec2& p, const Vec2& q, const Vec2& r) -> int {
        double val = (q - p).cross(r - p);
        if (std::abs(val) < EPS) return 0;
        return (val > 0) ? 2 : 1;
    };
    int d1 = orient(a1, a2, b1), d2 = orient(a1, a2, b2);
    int d3 = orient(b1, b2, a1), d4 = orient(b1, b2, a2);
    if (d1 != d2 && d3 != d4) {
        Vec2 da = a2 - a1, db = b2 - b1;
        double denom = da.cross(db);
        if (std::abs(denom) < EPS) return false;
        double t = (b1 - a1).cross(db) / denom;
        double u = (b1 - a1).cross(da) / denom;
        if (t > EPS && t < 1.0 - EPS && u > EPS && u < 1.0 - EPS) return true;
    }
    return false;
}

double signedArea(const std::vector<Vec2>& poly) {
    double area = 0;
    int n = (int)poly.size();
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return area / 2.0;
}

void ensureCCW(std::vector<Vec2>& poly) {
    if (signedArea(poly) < 0) std::reverse(poly.begin(), poly.end());
}

bool pointInPolygon(const Vec2& p, const std::vector<Vec2>& poly) {
    int n = (int)poly.size();
    bool inside = false;
    for (int i = 0, j = n - 1; i < n; j = i++) {
        const Vec2& vi = poly[i];
        const Vec2& vj = poly[j];
        Vec2 edge = vj - vi, toP = p - vi;
        double cr = edge.cross(toP), dt = toP.dot(edge), ls = edge.dot(edge);
        if (std::abs(cr) < EPS && dt >= -EPS && dt <= ls + EPS) return true;
        if ((vi.y > p.y) != (vj.y > p.y)) {
            double xInt = vi.x + (p.y - vi.y) / (vj.y - vi.y) * (vj.x - vi.x);
            if (p.x < xInt) inside = !inside;
        }
    }
    return inside;
}

Vec2 nearestPointOnSegment(const Vec2& p, const Vec2& a, const Vec2& b) {
    Vec2 ab = b - a;
    double lenSq = ab.lengthSq();
    if (lenSq < EPS * EPS) return a;
    double t = std::max(0.0, std::min(1.0, (p - a).dot(ab) / lenSq));
    return a + ab * t;
}

double distToPolygonBoundary(const Vec2& p, const std::vector<Vec2>& poly) {
    double best = std::numeric_limits<double>::infinity();
    int n = (int)poly.size();
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        double d = p.distTo(nearestPointOnSegment(p, poly[i], poly[j]));
        if (d < best) best = d;
    }
    return best;
}

bool segmentCrossesPolygon(const Vec2& a, const Vec2& b,
                           const std::vector<Vec2>& poly) {
    int n = (int)poly.size();
    for (int i = 0; i < n; i++) {
        int j = (i + 1) % n;
        if (segmentsProperlyIntersect(a, b, poly[i], poly[j])) return true;
    }
    return false;
}

bool isMoveValid(const Vec2& newPos, const Vec2& prev, const Vec2& next,
                 const std::vector<Vec2>& poly) {
    return pointInPolygon(newPos, poly);
}

// ────────────────────────────────────────────────────────────────────────────
//  Grid & Distance Field
// ────────────────────────────────────────────────────────────────────────────
//
//  We overlay a regular grid on the polygon bounding box. Each cell that
//  falls inside the polygon gets a "wall distance" value — how many pixels
//  from the cell center to the nearest polygon edge.
//
//  Cells near corridor centers have HIGH wall distance → LOW traversal cost.
//  Cells near walls have LOW wall distance → HIGH traversal cost.
//  This makes A* naturally prefer corridor-centered routes.

struct NavGrid {
    int cols, rows;
    int cellSize;
    double originX, originY;  // world-coordinate top-left of the grid
    std::vector<bool> inside;       // flat array: inside[row * cols + col]
    std::vector<double> wallDist;   // distance to nearest wall in pixels

    int idx(int r, int c) const { return r * cols + c; }

    Vec2 cellCenter(int r, int c) const {
        return {originX + (c + 0.5) * cellSize,
                originY + (r + 0.5) * cellSize};
    }

    // Find the grid cell closest to a world point that's inside the polygon
    std::pair<int,int> snap(const Vec2& p) const {
        int c = (int)((p.x - originX) / cellSize);
        int r = (int)((p.y - originY) / cellSize);
        c = std::max(0, std::min(cols - 1, c));
        r = std::max(0, std::min(rows - 1, r));

        if (inside[idx(r, c)]) return {r, c};

        // Search outward in a spiral for nearest inside cell
        double bestDist = 1e18;
        int bestR = r, bestC = c;
        int searchRadius = std::max(cols, rows);
        for (int dr = -searchRadius; dr <= searchRadius; dr++) {
            for (int dc = -searchRadius; dc <= searchRadius; dc++) {
                int nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                if (!inside[idx(nr, nc)]) continue;
                Vec2 cc = cellCenter(nr, nc);
                double d = p.distTo(cc);
                if (d < bestDist) {
                    bestDist = d;
                    bestR = nr;
                    bestC = nc;
                }
            }
        }
        return {bestR, bestC};
    }
};

NavGrid buildGrid(const std::vector<Vec2>& poly, int cellSize) {
    NavGrid g;
    g.cellSize = cellSize;

    // Bounding box
    double minX = 1e18, minY = 1e18, maxX = -1e18, maxY = -1e18;
    for (auto& v : poly) {
        minX = std::min(minX, v.x); minY = std::min(minY, v.y);
        maxX = std::max(maxX, v.x); maxY = std::max(maxY, v.y);
    }
    // Pad slightly
    g.originX = minX - cellSize;
    g.originY = minY - cellSize;
    g.cols = (int)std::ceil((maxX - g.originX) / cellSize) + 2;
    g.rows = (int)std::ceil((maxY - g.originY) / cellSize) + 2;

    int total = g.cols * g.rows;
    g.inside.resize(total, false);
    g.wallDist.resize(total, 0.0);

    // Mark inside cells and compute exact wall distance
    int insideCount = 0;
    for (int r = 0; r < g.rows; r++) {
        for (int c = 0; c < g.cols; c++) {
            Vec2 center = g.cellCenter(r, c);
            if (pointInPolygon(center, poly)) {
                g.inside[g.idx(r, c)] = true;
                g.wallDist[g.idx(r, c)] = distToPolygonBoundary(center, poly);
                insideCount++;
            }
        }
    }

    std::cout << "[Baker] Grid: " << g.cols << "x" << g.rows
              << " (" << insideCount << " interior cells, "
              << cellSize << "px/cell)\n";

    return g;
}

// ────────────────────────────────────────────────────────────────────────────
//  A* on the Grid with Wall-Distance Cost Weighting
// ────────────────────────────────────────────────────────────────────────────
//
//  Cost to enter a cell = cellSize / (1 + K * wallDist / cellSize)
//
//  When wallDist is large (corridor center): cost is low → preferred
//  When wallDist is small (near wall): cost is high → avoided
//
//  K controls how strongly the path prefers corridor centers.
//  K=0 gives shortest-distance paths (wall-hugging).
//  K=10 gives strongly centered paths.

static constexpr double K_CENTERING = 25.0;

// 8-connected neighbors: {dr, dc, distance_factor}
static const int DR[8] = {-1, -1, -1,  0, 0,  1, 1, 1};
static const int DC[8] = {-1,  0,  1, -1, 1, -1, 0, 1};
static const double DCOST[8] = {1.414, 1.0, 1.414, 1.0, 1.0, 1.414, 1.0, 1.414};

std::vector<Vec2> gridAStar(const NavGrid& grid, const Vec2& start, const Vec2& goal) {
    auto startCell = grid.snap(start);
    auto goalCell  = grid.snap(goal);
    int sr = startCell.first, sc = startCell.second;
    int gr = goalCell.first,  gc = goalCell.second;

    if (sr == gr && sc == gc) {
        // Same cell — direct line
        return {start, goal};
    }

    int total = grid.cols * grid.rows;
    std::vector<double> gCost(total, 1e18);
    std::vector<int> cameFrom(total, -1);

    int startIdx = grid.idx(sr, sc);
    int goalIdx  = grid.idx(gr, gc);
    gCost[startIdx] = 0;

    // Heuristic: Euclidean distance in cells
    auto heuristic = [&](int r, int c) {
        double dr = r - gr, dc = c - gc;
        return std::sqrt(dr * dr + dc * dc) * grid.cellSize;
    };

    // Priority queue: {f_cost, flat_index}
    using PII = std::pair<double, int>;
    std::priority_queue<PII, std::vector<PII>, std::greater<PII>> pq;
    pq.push({heuristic(sr, sc), startIdx});

    while (!pq.empty()) {
        double f = pq.top().first;
        int curIdx = pq.top().second;
        pq.pop();
        int cr = curIdx / grid.cols;
        int cc = curIdx % grid.cols;

        if (curIdx == goalIdx) break;
        if (f > gCost[curIdx] + heuristic(cr, cc) + 1.0) continue;  // stale

        for (int d = 0; d < 8; d++) {
            int nr = cr + DR[d], nc = cc + DC[d];
            if (nr < 0 || nr >= grid.rows || nc < 0 || nc >= grid.cols) continue;
            int nIdx = grid.idx(nr, nc);
            if (!grid.inside[nIdx]) continue;

            // Cost to enter neighbor cell — inversely proportional to wall distance
            double wd = grid.wallDist[nIdx];
            double enterCost = grid.cellSize / (1.0 + K_CENTERING * wd / grid.cellSize);
            double moveCost = DCOST[d] * enterCost;

            double newG = gCost[curIdx] + moveCost;
            if (newG < gCost[nIdx] - EPS) {
                gCost[nIdx] = newG;
                cameFrom[nIdx] = curIdx;
                pq.push({newG + heuristic(nr, nc), nIdx});
            }
        }
    }

    // Reconstruct path
    std::vector<Vec2> path;
    if (cameFrom[goalIdx] == -1 && goalIdx != startIdx) {
        return path;  // no path found
    }

    std::vector<int> indices;
    for (int cur = goalIdx; cur != -1; cur = cameFrom[cur])
        indices.push_back(cur);
    std::reverse(indices.begin(), indices.end());

    // Convert to world coordinates, using exact start/goal for endpoints
    path.push_back(start);
    for (size_t i = 1; i + 1 < indices.size(); i++) {
        int r = indices[i] / grid.cols;
        int c = indices[i] % grid.cols;
        path.push_back(grid.cellCenter(r, c));
    }
    path.push_back(goal);

    return path;
}

// ────────────────────────────────────────────────────────────────────────────
//  Ramer-Douglas-Peucker simplification
// ────────────────────────────────────────────────────────────────────────────

void rdpRecurse(const std::vector<Vec2>& pts, int lo, int hi,
                double epsilon, std::vector<bool>& keep) {
    if (hi - lo < 2) return;
    Vec2 seg = pts[hi] - pts[lo];
    double segLen = seg.length();

    double maxDist = 0;
    int maxIdx = lo;
    for (int i = lo + 1; i < hi; i++) {
        double d = (segLen < 0.01)
            ? pts[i].distTo(pts[lo])
            : std::abs(seg.cross(pts[i] - pts[lo])) / segLen;
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }

    if (maxDist > epsilon) {
        keep[maxIdx] = true;
        rdpRecurse(pts, lo, maxIdx, epsilon, keep);
        rdpRecurse(pts, maxIdx, hi, epsilon, keep);
    }
}

std::vector<Vec2> rdpSimplify(const std::vector<Vec2>& pts, double epsilon) {
    if (pts.size() <= 2) return pts;
    std::vector<bool> keep(pts.size(), false);
    keep.front() = true;
    keep.back() = true;
    rdpRecurse(pts, 0, (int)pts.size() - 1, epsilon, keep);

    std::vector<Vec2> out;
    for (size_t i = 0; i < pts.size(); i++) {
        if (keep[i]) out.push_back(pts[i]);
    }
    return out;
}

// ────────────────────────────────────────────────────────────────────────────
//  Path Smoothing — Constrained Laplacian Relaxation
// ────────────────────────────────────────────────────────────────────────────
//
//  The grid A* produces a corridor-centered but grid-aliased path.
//  Laplacian smoothing removes the staircase artifacts while keeping
//  the path safely inside the polygon.

std::vector<Vec2> subdivide(const std::vector<Vec2>& path, double maxSegLen) {
    std::vector<Vec2> out;
    out.push_back(path[0]);
    for (size_t i = 1; i < path.size(); i++) {
        double d = path[i - 1].distTo(path[i]);
        int steps = std::max(1, (int)std::ceil(d / maxSegLen));
        for (int s = 1; s <= steps; s++) {
            double t = (double)s / steps;
            out.push_back(path[i - 1] + (path[i] - path[i - 1]) * t);
        }
    }
    return out;
}

std::vector<Vec2> smoothPath(const std::vector<Vec2>& raw,
                             const std::vector<Vec2>& poly) {
    if (raw.size() <= 2) return raw;

    // Subdivide into ~15px segments for smooth curves
    std::vector<Vec2> pts = subdivide(raw, 15.0);

    // Laplacian relaxation — 30 iterations to clean up grid staircase
    const int iterations = 30;
    const double strength = 0.45;

    for (int iter = 0; iter < iterations; iter++) {
        std::vector<Vec2> next = pts;
        for (size_t i = 1; i + 1 < pts.size(); i++) {
            Vec2 avg = (pts[i - 1] + pts[i + 1]) * 0.5;
            Vec2 candidate = pts[i] + (avg - pts[i]) * strength;

            if (isMoveValid(candidate, pts[i - 1], pts[i + 1], poly)) {
                next[i] = candidate;
            } else {
                // Binary fallback — try smaller moves
                for (double frac = 0.5; frac >= 0.05; frac *= 0.5) {
                    Vec2 reduced = pts[i] + (avg - pts[i]) * (strength * frac);
                    if (isMoveValid(reduced, pts[i - 1], pts[i + 1], poly)) {
                        next[i] = reduced;
                        break;
                    }
                }
            }
        }
        pts = std::move(next);
    }

    // Simplify — Ramer-Douglas-Peucker to reduce to clean waypoints
    // The viewer applies corner-rounding arcs, so we want few points
    // with clear directional changes rather than many nearly-collinear ones.
    std::vector<Vec2> simplified = rdpSimplify(pts, 8.0);

    // Re-center each interior waypoint toward the corridor midline.
    // RDP connects distant points with straight lines that can drift
    // off-center, so we nudge each point perpendicular to its path
    // direction toward the position with maximum wall clearance.
    for (size_t i = 1; i + 1 < simplified.size(); i++) {
        Vec2 dir = simplified[i + 1] - simplified[i - 1];
        double len = dir.length();
        if (len < 0.1) continue;
        // Perpendicular to path direction
        Vec2 perp = {-dir.y / len, dir.x / len};

        // Sample wall distance at offsets along the perpendicular
        Vec2 best = simplified[i];
        double bestDist = distToPolygonBoundary(best, poly);
        for (double offset = -40; offset <= 40; offset += 4) {
            Vec2 candidate = simplified[i] + perp * offset;
            if (!pointInPolygon(candidate, poly)) continue;
            double d = distToPolygonBoundary(candidate, poly);
            if (d > bestDist) {
                bestDist = d;
                best = candidate;
            }
        }
        simplified[i] = best;
    }

    // Second RDP pass — centering can introduce zigzags when adjacent
    // points get nudged in opposite directions.
    simplified = rdpSimplify(simplified, 8.0);

    // Remove backtracking — if consecutive segments reverse direction
    // (negative dot product), the middle point is a zigzag artifact.
    bool changed = true;
    while (changed) {
        changed = false;
        for (size_t i = 1; i + 1 < simplified.size(); i++) {
            Vec2 d1 = simplified[i] - simplified[i - 1];
            Vec2 d2 = simplified[i + 1] - simplified[i];
            double dot = d1.x * d2.x + d1.y * d2.y;
            if (dot < 0) {
                simplified.erase(simplified.begin() + i);
                changed = true;
                break;
            }
        }
    }

    return simplified;
}

// ────────────────────────────────────────────────────────────────────────────
//  Rounding
// ────────────────────────────────────────────────────────────────────────────

double roundTo(double v, int decimals = 1) {
    double factor = std::pow(10.0, decimals);
    return std::round(v * factor) / factor;
}

// ============================================================================
//  main()
// ============================================================================

int main(int argc, char* argv[]) {
    std::string dataDir = "../data/";
    if (argc > 1) dataDir = std::string(argv[1]) + "/";

    std::string inPath  = dataDir + "navmesh_data.json";
    std::string outPath = dataDir + "baked_paths.json";

    // ── 1. Read input ──
    std::ifstream inFile(inPath);
    if (!inFile.is_open()) {
        std::cerr << "ERROR: Cannot open " << inPath << "\n";
        return 1;
    }
    json inJson;
    inFile >> inJson;
    inFile.close();
    std::cout << "[Baker] Loaded " << inPath << "\n";

    // ── 2. Parse polygon ──
    std::vector<Vec2> polygon;
    for (auto& v : inJson["polygon"])
        polygon.emplace_back(v["x"].get<double>(), v["y"].get<double>());
    ensureCCW(polygon);
    std::cout << "[Baker] Polygon: " << polygon.size() << " vertices\n";

    // ── 3. Parse portals ──
    struct Portal { std::string id; Vec2 pos; };
    std::vector<Portal> portals;
    for (auto& p : inJson["portals"])
        portals.push_back({p["id"].get<std::string>(),
                           Vec2(p["x"].get<double>(), p["y"].get<double>())});
    std::cout << "[Baker] Portals: " << portals.size() << "\n";

    if (portals.size() < 2) {
        std::cerr << "ERROR: Need at least 2 portals.\n";
        return 1;
    }

    // ── 4. Build the navigation grid with wall-distance field ──
    // 25px cells: good balance of accuracy and speed for a ~5700x4300 image
    NavGrid grid = buildGrid(polygon, 18);

    // ── 5. Bake all portal pairs ──
    int nPortals = (int)portals.size();
    long totalPairs = (long)nPortals * (nPortals - 1);
    std::cout << "[Baker] Baking " << totalPairs << " paths...\n";

    json output = json::object();
    int baked = 0, failed = 0;

    for (int i = 0; i < nPortals; i++) {
        json destMap = json::object();
        for (int j = 0; j < nPortals; j++) {
            if (i == j) continue;

            // A* on the grid — path naturally goes through corridor centers
            std::vector<Vec2> rawPath = gridAStar(grid, portals[i].pos, portals[j].pos);

            if (rawPath.size() < 2) {
                std::cerr << "  WARNING: No path " << portals[i].id
                          << " -> " << portals[j].id << "\n";
                destMap[portals[j].id] = json::array();
                failed++;
                continue;
            }

            // Smooth to remove grid staircase artifacts
            std::vector<Vec2> smoothed = smoothPath(rawPath, polygon);

            // The grid A* path is inherently corridor-centered and the
            // Laplacian smoother only accepts moves to interior points.
            // Portal endpoints intentionally sit on the polygon boundary
            // (classroom doors), so we don't validate those.

            json coords = json::array();
            for (auto& pt : smoothed)
                coords.push_back({{"x", roundTo(pt.x)}, {"y", roundTo(pt.y)}});
            destMap[portals[j].id] = coords;
            baked++;
        }
        output[portals[i].id] = destMap;

        // Progress indicator every 10 portals
        if ((i + 1) % 10 == 0 || i == nPortals - 1)
            std::cout << "  [" << (i + 1) << "/" << nPortals << "] portals done\n";
    }

    std::cout << "[Baker] Baked: " << baked
              << "  Failed: " << failed
              << "\n";

    // ── 6. Write output ──
    std::ofstream outFile(outPath);
    if (!outFile.is_open()) {
        std::cerr << "ERROR: Cannot write " << outPath << "\n";
        return 1;
    }
    outFile << output.dump();
    outFile.close();

    std::ifstream measure(outPath, std::ios::ate);
    double sizeMB = (double)measure.tellg() / (1024.0 * 1024.0);
    measure.close();
    std::cout << "[Baker] Wrote " << outPath
              << " (" << std::fixed << std::setprecision(2) << sizeMB << " MB)\n";
    std::cout << "[Baker] Done.\n";
    return 0;
}
