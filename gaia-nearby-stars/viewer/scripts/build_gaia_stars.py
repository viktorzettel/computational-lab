#!/usr/bin/env python3
"""Convert the 150 ly catalog into a compact JSON for the 3D visualization.

Inputs:
  data/star_catalog_150ly_v2.csv      Gaia DR3 rows (built by scripts/build_star_catalog.py
                                      from the GCNS-cleaned data/gaia_150ly_v2.csv)
  data/hipparcos_missing_150ly.csv    naked-eye Hipparcos-2 stars missing from Gaia v2
                                      (built by scripts/prepare_hipparcos_missing.py;
                                      positions ICRS propagated to J2016)
  data/star_names_simbad.csv          fame_tier per Gaia source_id (Hipparcos rows carry theirs)
Output: viewer/public/gaia_stars_150ly.json

JSON fields: count, sources [[catalog, start, end)], pos (flat xyz ly), col (flat rgb),
bin (absolute-magnitude bin 0..5), cls (class id per point, see `classes`),
classes [{id, key, label, count}] in legend order, names [[index, name, fame_tier]] sorted
by fame_tier then apparent magnitude (so the order is the label/target priority).
Classes are the `rough_star_type` HR-diagram cuts from scripts/build_star_catalog.py;
Hipparcos rows use the same cuts on B-V-fitted BP-RP and absolute Hp. Brown dwarfs are not
separable from late M dwarfs by photometry and fall under red dwarf (or unclassified when
BP/RP is missing).

Frames: the CSVs are equatorial ICRS (x to RA=0/Dec=0, z to the north celestial pole);
the JSON is the ecliptic scene frame (scene = x, z_ecl, y_ecl; y up = ecliptic north).
Gaia points come first, then Hipparcos points; `sources` gives the index ranges.
"""

import csv
import json
import math
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
INPUT = ROOT_DIR / "data" / "star_catalog_150ly_v2.csv"
HIP_INPUT = ROOT_DIR / "data" / "hipparcos_missing_150ly.csv"

OUTPUT_150 = Path(__file__).resolve().parent.parent / "public" / "gaia_stars_150ly.json"

NAMES_INPUT = ROOT_DIR / "data" / "star_names_simbad.csv"
PROXIMA_SOURCE_ID = "5853498713190525696"

# Legend order: cool to hot, then giants, white dwarfs, unclassified
CLASSES = [
    ("red_dwarf", "Red dwarf", "Red Dwarf"),
    ("orange_dwarf", "Orange dwarf", "Orange Dwarf"),
    ("yellow_dwarf", "Sun-like", "Yellow Dwarf"),
    ("f_type", "F-type", "F-type Star"),
    ("a_type", "A-type", "A-type Star"),
    ("hot_blue", "Hot blue", "Hot Blue Star"),
    ("giant", "Giant", "Giant / Subgiant"),
    ("white_dwarf", "White dwarf", "White Dwarf"),
    ("unclassified", "Unclassified", "Unclassified Star"),
]
CLASS_ID = {src: i for i, (_, _, src) in enumerate(CLASSES)}
OBLIQUITY = math.radians(23.4392811)

# bp_rp -> hex color stops (approximate stellar colors)
COLOR_STOPS = [
    (-0.5, (0x9B, 0xB0, 0xFF)),
    (0.4, (0xCA, 0xD7, 0xFF)),
    (0.8, (0xF8, 0xF7, 0xFF)),
    (1.2, (0xFF, 0xF4, 0xEA)),
    (1.6, (0xFF, 0xD2, 0xA1)),
    (2.5, (0xFF, 0xB0, 0x66)),
    (3.5, (0xFF, 0x88, 0x50)),
    (4.5, (0xFF, 0x6A, 0x3D)),
]
DEFAULT_COLOR = (0xD8, 0xD0, 0xC8)  # missing bp_rp


def bp_rp_to_rgb(bp_rp: float | None) -> tuple[int, int, int]:
    if bp_rp is None:
        return DEFAULT_COLOR
    if bp_rp <= COLOR_STOPS[0][0]:
        return COLOR_STOPS[0][1]
    for (x0, c0), (x1, c1) in zip(COLOR_STOPS, COLOR_STOPS[1:]):
        if bp_rp <= x1:
            t = (bp_rp - x0) / (x1 - x0)
            return tuple(round(a + (b - a) * t) for a, b in zip(c0, c1))
    return COLOR_STOPS[-1][1]


# Six luminosity classes from absolute G magnitude
SIZE_BIN_EDGES = [2.0, 4.0, 6.5, 9.0, 11.5]  # bins 0..5


def size_bin(abs_mag: float | None) -> int:
    if abs_mag is None:
        return 4
    for i, edge in enumerate(SIZE_BIN_EDGES):
        if abs_mag < edge:
            return i
    return len(SIZE_BIN_EDGES)


def eq_to_scene(x: float, y_eq: float, z_eq: float) -> tuple[float, float, float]:
    y_ecl = math.cos(OBLIQUITY) * y_eq + math.sin(OBLIQUITY) * z_eq
    z_ecl = -math.sin(OBLIQUITY) * y_eq + math.cos(OBLIQUITY) * z_eq
    return (x, z_ecl, y_ecl)  # scene: y up = ecliptic north


def display_name(raw: str) -> str:
    """'Ran (Epsilon Eridani)' -> 'Ran'. A/B suffixes are kept so both stars stay targets."""
    return raw.split("(")[0].strip()


def main() -> None:
    pos: list[float] = []
    col: list[int] = []
    bins: list[int] = []
    cls: list[int] = []
    named: list[tuple[int, int, float, str]] = []  # (tier, index, apparent mag, name)

    tier_by_gaia = {}
    with NAMES_INPUT.open() as f:
        for r in csv.DictReader(f):
            if r["gaia_dr3_source_id"].strip():
                tier_by_gaia[r["gaia_dr3_source_id"].strip()] = int(r["fame_tier"])

    with INPUT.open() as f:
        rows = [r for r in csv.DictReader(f) if r["source_id"] != PROXIMA_SOURCE_ID]

    for i, r in enumerate(rows):
        x, y_eq, z_eq = float(r["x_ly"]), float(r["y_ly"]), float(r["z_ly"])
        sx, sy, sz = eq_to_scene(x, y_eq, z_eq)
        pos += [round(sx, 3), round(sy, 3), round(sz, 3)]

        bp_rp = float(r["bp_rp"]) if r["bp_rp"].strip() else None
        col += bp_rp_to_rgb(bp_rp)

        abs_mag = float(r["absolute_g_mag"]) if r["absolute_g_mag"].strip() else None
        bins.append(size_bin(abs_mag))

        cls.append(CLASS_ID[r["rough_star_type"]])
        name = display_name(r["star_name"]) if (r.get("star_name") or "").strip() else ""
        if name:
            tier = tier_by_gaia[r["source_id"]]
            named.append((tier, i, float(r["phot_g_mean_mag"] or 99), name))

    n_gaia = len(rows)
    with HIP_INPUT.open() as f:
        # alpha Cen A/B are drawn by the Alpha Centauri group in main.ts, like Proxima
        hip_rows = [r for r in csv.DictReader(f) if r["drawn_by_alpha_cen_group"] != "True"]
    for j, r in enumerate(hip_rows):
        assert r["source"] == "Hipparcos"
        i = n_gaia + j
        sx, sy, sz = eq_to_scene(float(r["x_ly"]), float(r["y_ly"]), float(r["z_ly"]))
        pos += [round(sx, 3), round(sy, 3), round(sz, 3)]
        bp_rp = float(r["bp_rp_est"]) if r["bp_rp_est"].strip() else None
        col += bp_rp_to_rgb(bp_rp)
        bins.append(size_bin(float(r["absolute_hp_mag"])))  # Hp ~ G for bright stars
        cls.append(CLASS_ID[r["rough_star_type"]])
        name = display_name(r["star_name"]) if r["star_name"].strip() else ""
        if name:
            named.append((int(r["fame_tier"]), i, float(r["hp_mag"]), name))

    named.sort(key=lambda e: (e[0], e[2]))  # fame tier, then apparent magnitude
    all_names = [n for *_, n in named]
    dups = sorted({n for n in all_names if all_names.count(n) > 1})
    assert not dups, f"duplicate display names: {dups}"
    tier0 = {n for t_, _, _, n in named if t_ == 0}
    for must in ("Sirius", "Vega", "Arcturus", "Menkent", "Dubhe", "Phecda", "Rasalhague"):
        assert any(n.startswith(must) for n in tier0 | set(all_names)), f"{must} missing"
    classes = [
        {"id": k, "key": key, "label": label, "count": cls.count(k)}
        for k, (key, label, _) in enumerate(CLASSES)
    ]

    OUTPUT_150.parent.mkdir(exist_ok=True)
    payload = {
        "count": len(pos) // 3,
        "sources": [["Gaia DR3", 0, n_gaia], ["Hipparcos", n_gaia, n_gaia + len(hip_rows)]],
        "pos": pos,
        "col": col,
        "bin": bins,
        "cls": cls,
        "classes": classes,
        "names": [[i, n, tier] for tier, i, _, n in named],
    }

    with OUTPUT_150.open("w") as f:
        json.dump(payload, f, separators=(",", ":"))

    print(
        f"{payload['count']:,} objects ({n_gaia:,} Gaia DR3 + {len(hip_rows)} Hipparcos), "
        f"{len(named)} named -> {OUTPUT_150} ({OUTPUT_150.stat().st_size / 1024:.0f} KB)"
    )
    print("bin counts:", [bins.count(b) for b in range(len(SIZE_BIN_EDGES) + 1)])
    print("names by tier:", {k: sum(1 for t_, *_ in named if t_ == k) for k in (0, 1, 2)})
    print("classes:", [(c["label"], c["count"]) for c in classes])
    print("tier 0:", ", ".join(n for t_, _, _, n in named if t_ == 0))


if __name__ == "__main__":
    main()
