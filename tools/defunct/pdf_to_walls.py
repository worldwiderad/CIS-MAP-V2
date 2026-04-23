#!/usr/bin/env python3.12
"""
Extract vector line segments from a CAD PDF as a compact JSON.

Usage:
  pdf_to_walls.py <input.pdf> [output.json] [--page N]

Output schema:
  {
    "source": "<pdf filename>",
    "page": <page index>,
    "viewBox": [0, 0, W, H],
    "layers": [
      { "id": "c_ff00ff", "color": "#ff00ff", "name": "magenta",
        "segmentCount": N, "segments": [[x1,y1,x2,y2], ...] },
      ...
    ]
  }

Colours are emitted as separate layers so the classifier UI can toggle them.
Only colours with >= MIN_SEGMENTS segments survive — throws out speckle.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import fitz  # PyMuPDF

MIN_SEGMENTS = 20          # drop colours with fewer segments than this
CUBIC_STEPS  = 8           # cubic bezier → N line segments


def rgb_to_hex(rgb):
    if rgb is None:
        return None
    r, g, b = rgb
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def flatten_item(item, acc):
    """Append line segments from a drawing item into `acc` as (x1,y1,x2,y2) tuples."""
    op = item[0]
    if op == "l":
        p1, p2 = item[1], item[2]
        acc.append((p1.x, p1.y, p2.x, p2.y))
    elif op == "c":
        p0, p1, p2, p3 = item[1], item[2], item[3], item[4]
        prev = (p0.x, p0.y)
        for i in range(1, CUBIC_STEPS + 1):
            t = i / CUBIC_STEPS
            u = 1 - t
            x = u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x
            y = u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y
            acc.append((prev[0], prev[1], x, y))
            prev = (x, y)
    elif op == "qu":
        # PyMuPDF Quad: 4 corners (ul, ur, ll, lr).
        q = item[1]
        ul, ur, ll, lr = q.ul, q.ur, q.ll, q.lr
        acc.append((ul.x, ul.y, ur.x, ur.y))
        acc.append((ur.x, ur.y, lr.x, lr.y))
        acc.append((lr.x, lr.y, ll.x, ll.y))
        acc.append((ll.x, ll.y, ul.x, ul.y))
    elif op == "re":
        r = item[1]
        x0, y0, x1, y1 = r.x0, r.y0, r.x1, r.y1
        acc.append((x0, y0, x1, y0))
        acc.append((x1, y0, x1, y1))
        acc.append((x1, y1, x0, y1))
        acc.append((x0, y1, x0, y0))


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    pdf_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else None
    page_idx = 0
    if "--page" in sys.argv:
        page_idx = int(sys.argv[sys.argv.index("--page") + 1])

    if out_path is None:
        out_path = pdf_path.with_suffix(".walls.json")

    doc = fitz.open(pdf_path)
    page = doc[page_idx]
    rect = page.rect

    drawings = page.get_drawings()
    by_color = defaultdict(list)
    for d in drawings:
        col = d.get("color") or d.get("stroke")
        hex_ = rgb_to_hex(col)
        if hex_ is None:
            continue
        for item in d.get("items", []):
            flatten_item(item, by_color[hex_])

    layers = []
    for hex_, segs in by_color.items():
        if len(segs) < MIN_SEGMENTS:
            continue
        # Round to 2 decimals to shrink JSON without losing visible fidelity.
        rounded = [[round(a, 2), round(b, 2), round(c, 2), round(d, 2)] for a, b, c, d in segs]
        layers.append({
            "id": f"c_{hex_[1:]}",
            "color": hex_,
            "name": color_nickname(hex_),
            "segmentCount": len(rounded),
            "segments": rounded,
        })

    layers.sort(key=lambda L: -L["segmentCount"])

    out = {
        "source": pdf_path.name,
        "page": page_idx,
        "viewBox": [0, 0, round(rect.width, 2), round(rect.height, 2)],
        "layers": layers,
    }

    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    total = sum(L["segmentCount"] for L in layers)
    print(f"{pdf_path.name}  →  {out_path.name}")
    print(f"  page size: {rect.width:.0f} × {rect.height:.0f}")
    print(f"  {len(layers)} colour layers, {total:,} segments")
    for L in layers:
        print(f"    {L['color']}  ({L['name']:12}) {L['segmentCount']:>6,}")
    print(f"  wrote {out_path.stat().st_size // 1024} KB")


def color_nickname(hex_):
    table = {
        "#ff00ff": "walls",
        "#000000": "black",
        "#00ffff": "cyan",
        "#808080": "grey",
        "#00bfff": "lightblue",
        "#ff0000": "red",
        "#00a5dd": "blue",
        "#ff3f00": "orange",
        "#3f00ff": "indigo",
        "#ff7f00": "orange2",
    }
    return table.get(hex_.lower(), hex_)


if __name__ == "__main__":
    main()
