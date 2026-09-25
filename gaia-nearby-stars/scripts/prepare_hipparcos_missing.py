"""Select naked-eye Hipparcos-2 stars within 150 ly that are missing from the Gaia v2 list.

Input:  data/hipparcos_bright_150ly.csv   raw VizieR I/311/hip2 export (plx >= 21.744 mas,
                                          plx/e_plx >= 10), with a positional Gaia match and
                                          the gaia_in_v2 flag (unchanged by this script)
        data/gaia_150ly_v2.csv            GCNS-clean Gaia list (used only to fit B-V to BP-RP)
        data/star_names_simbad.csv        the only name source (display_name, name_type,
                                          fame_tier), joined on the `hip` column
Output: data/hipparcos_missing_150ly.csv  source=Hipparcos rows for viewer/scripts/build_gaia_stars.py

Selection: gaia_in_v2 == False and hp_mag < 6 (naked eye). Proxima (HIP 70890) is matched to
Gaia and is never selected. alpha Cen A/B (HIP 71683, 71681) are kept in the CSV but flagged
drawn_by_alpha_cen_group=True, because the viz draws them in its own Alpha Centauri group.

Positions: Hipparcos ICRS at epoch 1991.25 are propagated with pm_ra (mu_alpha*cos dec) and
pm_de to J2016.0 to match Gaia DR3; x/y/z_ly are equatorial ICRS (x to RA=0/Dec=0, z north).
"""

import math
import re
from pathlib import Path

import numpy as np
import pandas as pd

from star_classes import classify  # same rule as build_star_catalog.py

DATA = Path(__file__).resolve().parent.parent / "data"
RAW = DATA / "hipparcos_bright_150ly.csv"
V2 = DATA / "gaia_150ly_v2.csv"
NAMES = DATA / "star_names_simbad.csv"
OUT = DATA / "hipparcos_missing_150ly.csv"

NAKED_EYE_HP = 6.0
ALPHA_CEN_AB = {71683, 71681}
PROXIMA_HIP = 70890
REQUIRED = {71683: "alpha Cen A", 71681: "alpha Cen B", 68933: "Menkent", 54061: "Dubhe",
            58001: "Phecda", 86032: "Rasalhague", 32349: "Sirius A"}
LY_PER_PC = 3.261563777
DT_YR = 2016.0 - 1991.25


def hip_int(v):
    m = re.match(r"\s*(\d+)", str(v))
    return int(m.group(1)) if m else None


def main():
    raw = pd.read_csv(RAW, dtype={"gaia_source_id": str})
    assert raw.gaia_in_v2.dtype == bool, "gaia_in_v2 must be True/False"

    # B-V -> BP-RP relation from Hipparcos stars matched to a v2 Gaia source: medians in
    # 0.1 mag B-V bins (>= 5 stars, B-V <= 1.7), linearly interpolated. b_v == 0.000 exactly is how the
    # export encodes a missing B-V (51 rows, mostly faint M dwarfs), so those are left out.
    v2 = pd.read_csv(V2, usecols=["source_id", "bp_rp"])
    m = raw[raw.gaia_in_v2].copy()
    m["gid"] = m.gaia_source_id.astype("int64")
    m = m.merge(v2, left_on="gid", right_on="source_id").dropna(subset=["b_v", "bp_rp"])
    m = m[m.b_v != 0.0]
    med = m.groupby((m.b_v / 0.1).round() * 0.1).bp_rp.agg(["median", "count"])
    med = med[(med["count"] >= 5) & (med.index <= 1.7)]  # sparse, non-monotonic above 1.7
    bv_knots, bprp_knots = med.index.to_numpy(), med["median"].to_numpy()
    assert (np.diff(bprp_knots) > 0).all(), "B-V -> BP-RP medians must be monotonic"

    names = pd.read_csv(NAMES, dtype=str)
    names["hip_i"] = names.hip.map(hip_int)
    name_by_hip = {}
    for h, n, nt, ft in zip(names.hip_i, names.display_name, names.name_type, names.fame_tier):
        if h is not None and h not in name_by_hip:
            name_by_hip[h] = (n, nt, ft)

    sel = raw[(~raw.gaia_in_v2) & (raw.hp_mag < NAKED_EYE_HP) & (raw.hip != PROXIMA_HIP)].copy()

    dec0 = np.radians(sel.dec)
    ra = sel.ra + sel.pm_ra / np.cos(dec0) * DT_YR / 3.6e6
    dec = sel.dec + sel.pm_de * DT_YR / 3.6e6
    ra_r, dec_r = np.radians(ra), np.radians(dec)
    d_ly = 1000.0 / sel.plx * LY_PER_PC

    out = pd.DataFrame({
        "hip": sel.hip.values,
        "star_name": [name_by_hip.get(int(h), ("", "", ""))[0] for h in sel.hip],
        "name_type": [name_by_hip.get(int(h), ("", "", ""))[1] for h in sel.hip],
        "fame_tier": [name_by_hip.get(int(h), ("", "", ""))[2] for h in sel.hip],
        "source": "Hipparcos",
        "ra_j2016": ra.round(7).values,
        "dec_j2016": dec.round(7).values,
        "plx": sel.plx.values,
        "e_plx": sel.e_plx.values,
        "hp_mag": sel.hp_mag.values,
        "b_v": sel.b_v.values,
        "bp_rp_est": np.interp(sel.b_v, bv_knots, bprp_knots).round(3),
        "absolute_hp_mag": (sel.hp_mag + 5 * np.log10(sel.plx / 100.0)).round(3).values,
        "distance_ly": d_ly.round(4).values,
        "x_ly": (d_ly * np.cos(dec_r) * np.cos(ra_r)).round(4).values,
        "y_ly": (d_ly * np.cos(dec_r) * np.sin(ra_r)).round(4).values,
        "z_ly": (d_ly * np.sin(dec_r)).round(4).values,
        "drawn_by_alpha_cen_group": sel.hip.isin(ALPHA_CEN_AB).values,
    }).sort_values("distance_ly")
    out.insert(3, "rough_star_type", [classify(float(b), float(m)) for b, m in zip(out.bp_rp_est, out.absolute_hp_mag)])

    assert not (sel.b_v == 0.0).any(), "a selected star has the missing-B-V code 0.000"
    missing = [f"{n} (HIP {h})" for h, n in REQUIRED.items() if h not in set(out.hip)]
    assert not missing, f"required stars missing: {missing}"
    assert out.hip.is_unique
    assert (out.distance_ly <= 150.0 + 1e-6).all()

    out.to_csv(OUT, index=False)
    print(f"B-V -> BP-RP from {len(m):,} matched stars, {len(bv_knots)} knots "
          f"B-V {bv_knots.min():.1f}..{bv_knots.max():.1f}")
    print(f"{len(out)} Hipparcos rows (gaia_in_v2 False, Hp < {NAKED_EYE_HP}) -> {OUT}")
    print(f"  named: {(out.star_name != '').sum()}, drawn by Alpha Cen group: {out.drawn_by_alpha_cen_group.sum()}")
    print("  classes:", out.rough_star_type.value_counts().to_dict())


if __name__ == "__main__":
    main()
