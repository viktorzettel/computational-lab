#!/usr/bin/env python3
"""
Resolve landmark star names through SIMBAD instead of hand-typed Gaia IDs.

Each entry below is (SIMBAD identifier, display label). The script asks SIMBAD
for the object's main identifier, its Gaia DR3 source_id and its HIP number,
and writes data/star_names_simbad.csv. build_star_catalog.py reads that file,
so labels are always tied to whatever SIMBAD says the identifier is.

Rows whose object has no Gaia DR3 ID (e.g. Dubhe, Menkent, Rasalhague) keep
their HIP number, so Hipparcos-sourced rows can be labelled by HIP.

Usage:  python3 scripts/resolve_star_names.py
Needs network access to simbad.cds.unistra.fr (requests only).
"""

import csv
import sys
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent.parent
OUT = BASE_DIR / "data" / "star_names_simbad.csv"
SIMBAD_SCRIPT = "https://simbad.cds.unistra.fr/simbad/sim-script"

# (SIMBAD identifier, display label)
NAMES = [
    # Nearest neighbours (< 15 ly)
    ("Proxima Cen", "Proxima Centauri (Alpha Centauri C)"),
    ("alf Cen A", "Rigil Kentaurus (Alpha Centauri A)"),
    ("alf Cen B", "Toliman (Alpha Centauri B)"),
    ("Barnard's star", "Barnard's Star"),
    ("Wolf 359", "Wolf 359"),
    ("Lalande 21185", "Lalande 21185"),
    ("UV Cet", "UV Ceti (Luyten 726-8 B)"),
    ("Ross 154", "Ross 154"),
    ("Ross 248", "Ross 248"),
    ("eps Eri", "Ran (Epsilon Eridani)"),
    ("Lacaille 9352", "Lacaille 9352"),
    ("Ross 128", "Ross 128"),
    ("61 Cyg A", "61 Cygni A"),
    ("61 Cyg B", "61 Cygni B"),
    ("eps Ind", "Epsilon Indi A"),
    ("tau Cet", "Tau Ceti"),
    ("Kapteyn's star", "Kapteyn's Star"),
    ("AX Mic", "Lacaille 8760 (AX Microscopii)"),
    ("Wolf 28", "Van Maanen's Star"),
    ("GJ 1", "Gliese 1 (HD 225213)"),
    ("GJ 687", "Gliese 687"),
    ("GJ 674", "Gliese 674"),
    ("GJ 876", "Gliese 876"),
    # Mid neighbourhood (15-50 ly)
    ("omi02 Eri", "Keid (40 Eridani A)"),
    ("omi02 Eri B", "40 Eridani B (white dwarf)"),
    ("70 Oph A", "70 Ophiuchi A"),
    ("70 Oph B", "70 Ophiuchi B"),
    ("eta Cas A", "Achird A (Eta Cassiopeiae A)"),
    ("eta Cas B", "Achird B (Eta Cassiopeiae B)"),
    ("e Eri", "82 Eridani"),
    ("36 Oph A", "36 Ophiuchi A"),
    ("36 Oph B", "36 Ophiuchi B"),
    ("HD 10360", "p Eridani A"),
    ("HD 10361", "p Eridani B"),
    ("del Pav", "Delta Pavonis"),
    ("GJ 581", "Gliese 581"),
    ("GJ 667 C", "Gliese 667 C"),
    ("bet Hyi", "Beta Hydri"),
    ("TW PsA", "TW Piscis Austrini (Fomalhaut B)"),
    ("107 Psc", "107 Piscium (Gliese 75)"),
    ("bet CVn", "Chara (Beta Canum Venaticorum)"),
    ("iot Per", "Iota Persei"),
    ("gam Vir", "Porrima (Gamma Virginis)"),
    ("TRAPPIST-1", "TRAPPIST-1"),
    ("gam Cep", "Errai (Gamma Cephei)"),
    ("51 Peg", "Helvetios (51 Pegasi)"),
    ("mu. Ara", "Cervantes (Mu Arae)"),
    # Outer neighbourhood (50-150 ly)
    ("tet Cen", "Menkent (Theta Centauri)"),
    ("alf Phe", "Ankaa (Alpha Phoenicis)"),
    ("alf Oph", "Rasalhague (Alpha Ophiuchi)"),
    ("alf Ser", "Unukalhai (Alpha Serpentis)"),
    ("alf CrB", "Alphecca (Alpha Coronae Borealis)"),
    ("alf UMa", "Dubhe (Alpha Ursae Majoris)"),
    ("bet UMa", "Merak (Beta Ursae Majoris)"),
    ("gam UMa", "Phecda (Gamma Ursae Majoris)"),
    ("del UMa", "Megrez (Delta Ursae Majoris)"),
    ("zet01 UMa", "Mizar A (Zeta1 Ursae Majoris)"),
    ("zet02 UMa", "Mizar B (Zeta2 Ursae Majoris)"),
    ("eta Dra", "Athebyne (Eta Draconis)"),
    ("bet Oph", "Cebalrai (Beta Ophiuchi)"),
    ("alf02 CVn", "Cor Caroli (Alpha2 Canum Venaticorum)"),
    ("eps Vir", "Vindemiatrix (Epsilon Virginis)"),
]


def resolve(idents):
    lines = [
        "output console=off script=off",
        'format object "%OBJECT|%MAIN_ID|%IDLIST(Gaia DR3)|%IDLIST(HIP)"',
    ] + [f"query id {i}" for i in idents]
    r = requests.post(SIMBAD_SCRIPT, data={"script": "\n".join(lines)}, timeout=120)
    r.raise_for_status()
    out = {}
    errors = []
    for line in r.text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 4:
            continue  # SIMBAD console/error chatter; unresolved queries are caught below
        query, main_id, gaia, hip = (p.strip() for p in parts)
        out[query] = {
            "simbad_main_id": " ".join(main_id.split()),
            "gaia_dr3_source_id": gaia.replace("Gaia DR3", "").strip(),
            "hip": hip.replace("HIP", "").strip(),
        }
    return out, errors


def main():
    idents = [i for i, _ in NAMES]
    res, _ = resolve(idents)
    missing = [i for i in idents if i not in res]
    if missing:
        print("SIMBAD could not resolve:", missing, file=sys.stderr)
        sys.exit(1)
    seen_gaia = {}
    with OUT.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["simbad_ident", "display_name", "simbad_main_id", "gaia_dr3_source_id", "hip"])
        for ident, label in NAMES:
            row = res[ident]
            g = row["gaia_dr3_source_id"]
            if g and g in seen_gaia:
                print(f"Duplicate Gaia ID {g}: {seen_gaia[g]} and {ident}", file=sys.stderr)
                sys.exit(1)
            if g:
                seen_gaia[g] = ident
            w.writerow([ident, label, row["simbad_main_id"], g, row["hip"]])
    print(f"Wrote {len(NAMES)} names to {OUT}")


if __name__ == "__main__":
    main()
