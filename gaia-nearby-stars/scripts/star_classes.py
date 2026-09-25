"""Colour-magnitude classes for the 150 ly catalog (shared by build_star_catalog.py and
prepare_hipparcos_missing.py, so Gaia and Hipparcos rows follow one rule).

Inputs: BP-RP colour (Gaia; B-V-fitted for Hipparcos) and absolute magnitude (G; Hp for
Hipparcos). The rule is gap-free: every point with both values gets a class, and
"Unclassified Star" means BP-RP or the absolute magnitude is missing.

Order of tests:
  1. White Dwarf       M > 10 and BP-RP < 1.5 (well below the main sequence)
  2. Giant / Subgiant  BP-RP >= 0.8 and M < 3.5 + 2 * (BP-RP - 0.8)
                       (at least ~1.5 mag above the main sequence for G/K/M colours)
  3. Otherwise by colour alone (main-sequence and bright hot stars):
       BP-RP <  0.0          Hot Blue Star (B/O)
       0.0 <= BP-RP < 0.3    A-type Star
       0.3 <= BP-RP < 0.6    F-type Star
       0.6 <= BP-RP < 1.0    Yellow Dwarf (G, Sun-like)
       1.0 <= BP-RP < 1.8    Orange Dwarf (K)
       BP-RP >= 1.8          Red Dwarf (M; includes brown dwarf candidates, which
                             photometry cannot separate from late M dwarfs)
"""

import math


def classify(bp_rp, abs_mag):
    if bp_rp is None or abs_mag is None or math.isnan(bp_rp) or math.isnan(abs_mag):
        return "Unclassified Star"
    if abs_mag > 10 and bp_rp < 1.5:
        return "White Dwarf"
    if bp_rp >= 0.8 and abs_mag < 3.5 + 2.0 * (bp_rp - 0.8):
        return "Giant / Subgiant"
    if bp_rp < 0.0:
        return "Hot Blue Star"
    if bp_rp < 0.3:
        return "A-type Star"
    if bp_rp < 0.6:
        return "F-type Star"
    if bp_rp < 1.0:
        return "Yellow Dwarf"
    if bp_rp < 1.8:
        return "Orange Dwarf"
    return "Red Dwarf"
