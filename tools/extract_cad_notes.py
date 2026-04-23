#!/usr/bin/env python3.12
"""
Pull text annotations out of the CAD PDFs and save them as a structured
JSON, so we have FFL elevations, stair rise/run, linkway gradients, scale,
and every room-label position per floor without re-opening the PDFs.

Output: floorplans/cad_notes.json

Coordinates are in PDF point space (Y-down), same coord system the mapper
uses — so room-label positions line up 1:1 with anything you draw.
"""

import fitz
import json
import re
from pathlib import Path

CAD_DIR  = Path("/Users/rg/CIS-MAP/floorplans/cad")
OUT_PATH = Path("/Users/rg/CIS-MAP/floorplans/cad_notes.json")

# Room-label patterns. Covers the known CAD naming schemes: KB/BT/TK/LKS-xxx.
ROOM_RE = re.compile(r"^(KB|BT|TK|LKS)[-_]?(\d{3,4}[A-Z]?)$")

RE_FFL       = re.compile(r"FFL\s*\+?\s*(\d+\.?\d*)")
RE_STAIR     = re.compile(r"UP\s*(\d+)R\b.*?R\s*=?\s*(\d+).*?T\s*=?\s*(\d+)", re.S)
RE_GRADIENT  = re.compile(r"GRADIENT\s*1\s*:\s*(\d+)")
RE_CLEAR     = re.compile(r"(\d+(?:\.\d+)?)\s*m?\s*CLEAR\s*WIDTH", re.I)

FLOOR_FROM_FILENAME = re.compile(r"FP-?(\d+)", re.I)


def floor_key(path: Path) -> str:
    m = FLOOR_FROM_FILENAME.search(path.name)
    return f"L{int(m.group(1))}" if m else path.stem


def extract_floor(pdf_path: Path) -> dict:
    doc = fitz.open(pdf_path)
    page = doc[0]
    rect = page.rect

    flat = re.sub(r"\s+", " ", "\n".join(p.get_text() for p in doc))
    ffls       = sorted(set(float(x) for x in RE_FFL.findall(flat)))
    gradients  = sorted(set(int(x) for x in RE_GRADIENT.findall(flat)))
    stairs     = list({(int(r), int(h), int(t)) for r, h, t in RE_STAIR.findall(flat)
                       if int(r) > 5 and int(h) > 100})
    clears     = sorted(set(float(x) for x in RE_CLEAR.findall(flat)))

    # Per-word text with positions. Gives us room labels anchored in PDF coords.
    words = page.get_text("words")
    room_labels = []
    named_zones = []
    # Named zones we care about — upper-case text strings that are NOT room codes.
    ZONE_KEYWORDS = (
        "GYMNASIUM", "THEATRE", "LIBRARY", "CANTEEN", "ATRIUM", "POOL",
        "LOBBY", "LOUNGE", "RECEPTION", "OFFICE", "STUDIO", "KITCHEN",
        "STAGE", "GALLERY", "CENTRE", "CENTER", "CONVENTION",
    )
    for w in words:
        x0, y0, x1, y1, txt = w[0], w[1], w[2], w[3], w[4].strip()
        m = ROOM_RE.match(txt.upper().replace("_", "-"))
        if m:
            room_labels.append({
                "label": f"{m.group(1)}-{m.group(2)}",
                "center": [round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)],
            })
            continue
        up = txt.upper()
        for kw in ZONE_KEYWORDS:
            if kw in up and len(txt) >= 4:
                named_zones.append({
                    "text": txt,
                    "center": [round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)],
                })
                break

    # Dedupe room labels (sometimes the same text appears multiple times).
    seen = set()
    unique_rooms = []
    for r in room_labels:
        key = (r["label"], r["center"][0] // 10, r["center"][1] // 10)
        if key in seen: continue
        seen.add(key)
        unique_rooms.append(r)

    return {
        "source": pdf_path.name,
        "pageWidth":  round(rect.width, 2),
        "pageHeight": round(rect.height, 2),
        "ffl":        ffls,
        "stairs":     [{"risers": r, "riseMM": h, "treadMM": t} for r, h, t in stairs],
        "gradients":  [f"1:{g}" for g in gradients],
        "clearWidths": clears,
        "rooms":      unique_rooms,
        "namedZones": named_zones,
    }


def main():
    out = {}
    for pdf in sorted(CAD_DIR.glob("*.pdf")):
        key = floor_key(pdf)
        out[key] = extract_floor(pdf)
        data = out[key]
        print(f"{key:4}  {pdf.name}")
        print(f"       rooms: {len(data['rooms'])}  zones: {len(data['namedZones'])}  "
              f"ffl: {len(data['ffl'])}  stairs: {len(data['stairs'])}")

    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {OUT_PATH.relative_to(Path('/Users/rg/CIS-MAP'))}  "
          f"({OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
