# Catalogue methodology (0 to 150 light-years)

This note describes how the 150 ly catalogue in `data/` was selected, cleaned, supplemented and classified. File-level details (columns, row counts, JSON format) are in [`../data/README.md`](../data/README.md).

## 1. Gaia DR3 selection

The raw export `data/gaia_150ly_v1.csv` (37,270 rows) comes from `gaiadr3.gaia_source` with:

```sql
WHERE parallax >= 21.744            -- d <= 150 ly
  AND parallax_over_error >= 10     -- parallax signal-to-noise >= 10
```

150 ly = 45.99 pc, so the parallax limit is 1000 / 45.99 ≈ 21.744 mas.

Columns: `source_id`, `ra`, `dec`, `parallax`, `parallax_error`, `parallax_over_error`, `pmra`, `pmdec`, `radial_velocity`, `phot_g_mean_mag`, `phot_bp_mean_mag`, `phot_rp_mean_mag`, `bp_rp`, and the derived `distance_pc` (1000 / parallax), `distance_ly` (distance_pc × 3.26156) and Sun-centred Cartesian `x_ly`, `y_ly`, `z_ly`:

```
x = d · cos(dec) · cos(ra)
y = d · cos(dec) · sin(ra)
z = d · sin(dec)
```

These are equatorial ICRS coordinates at the Gaia DR3 epoch J2016.0 (x toward RA = 0, Dec = 0; z toward the north celestial pole).

## 2. Cleaning with the Gaia Catalogue of Nearby Stars

`data/gaia_150ly_v2.csv` (31,301 rows) keeps only sources that also appear in the Gaia Catalogue of Nearby Stars (`external.gaiaedr3_gcns_main_1`), joined on `source_id` with an async TAP query in the ESA Gaia archive. v2 is a strict subset of v1 and adds `ruwe`. No RUWE cut is applied.

## 3. Processed catalogue

`scripts/build_star_catalog.py` reads v2 and writes `data/star_catalog_150ly_v2.csv`, adding:

- `absolute_g_mag`: M_G = G − 5·log10(d_pc) + 5
- `rough_star_type`: HR-diagram class (section 5)
- `catalog_label`: "Gaia DR3 <source_id>"
- `star_name`: from `data/star_names_simbad.csv` (302 named Gaia rows)

## 4. Hipparcos supplement

Gaia saturates on the brightest stars, so some well-known naked-eye stars are missing from the Gaia list. `data/hipparcos_bright_150ly.csv` is a VizieR export of the Hipparcos new reduction (`I/311/hip2`) with `plx >= 21.744` mas and `plx/e_plx >= 10` (5,366 stars). Each star is matched by position to Gaia (Gaia propagated to epoch 1991.25, 10″ radius). 14 matches were dropped where the Gaia source was more than 1.5 mag fainter, meaning it was a companion (for example Sirius B instead of Sirius A). 4,823 stars match a Gaia v2 source; 543 do not.

`scripts/prepare_hipparcos_missing.py` keeps the unmatched stars with Hp < 6 (122 stars, 81 of them named), propagates their positions from epoch 1991.25 to J2016, and writes `data/hipparcos_missing_150ly.csv`. α Cen A and B are among them but are drawn by the viewer's Alpha Centauri group, so 120 enter the point cloud. The 421 fainter unmatched stars are left out; most lie near the 150 ly edge.

Hipparcos has no BP−RP. It is estimated from B−V as the median BP−RP per 0.1 mag B−V bin over 4,777 matched stars, linearly interpolated. B−V = 0.000 is a missing-value sentinel in the export and is excluded (51 rows).

## 5. Star classes

One rule (`scripts/star_classes.py`) is used for both Gaia and Hipparcos stars. M is absolute G for Gaia and absolute Hp for Hipparcos. The tests are applied in order:

1. White dwarf: M > 10 and BP−RP < 1.5.
2. Giant/subgiant: BP−RP ≥ 0.8 and M < 3.5 + 2·(BP−RP − 0.8), i.e. roughly 1.5 mag or more above the main sequence.
3. Otherwise by colour: BP−RP < 0 hot blue; 0–0.3 A-type; 0.3–0.6 F-type; 0.6–1.0 Sun-like; 1.0–1.8 orange dwarf; ≥ 1.8 red dwarf.

The rule has no gaps, so "unclassified" only means missing photometry. Brown dwarfs are not separated from late M dwarfs and fall under red dwarf. A rough cut (absolute G > 16 and BP−RP ≥ 2.5) flags about 823 candidates, which likely include late M dwarfs.

Point counts in the viewer (31,420 points): red dwarf 23,016; orange dwarf 3,272; Sun-like 2,183; F-type 357; A-type 107; hot blue 14; giant/subgiant 216; white dwarf 1,658; unclassified 597.

## 6. Names

`scripts/resolve_star_names.py` queries SIMBAD for each identifier in a curated list and writes `data/star_names_simbad.csv` (383 rows) with the SIMBAD main identifier, Gaia DR3 `source_id` and HIP number. No Gaia IDs are hand-typed. 302 rows are keyed by Gaia DR3 id and 81 by HIP only (the named Hipparcos-supplement stars). Name types: 218 IAU (from the IAU WGSN list), 132 Bayer, 15 Flamsteed and 18 catalogue designations. Fame tiers: 0 famous, 1 bright (Hp < 4, or Gaia G when not in Hipparcos), 2 other.

## 7. Caveats

- Classes are photometric estimates, not spectral types.
- Some Gaia sources are unresolved binaries or multiple systems. There is no RUWE filter.
- Radial velocity is available for 21,768 of the 31,301 v2 rows.
- The Hipparcos supplement covers only stars brighter than Hp 6, and Hipparcos colours are estimated.
- The catalogue is a good basis for a local map, but it is not a complete census of every object within 150 ly.
