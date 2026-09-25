# Astronomical Datasets (0 to 150 Light-Years)

> ⚠️ **CRITICAL DATA DIRECTORY — DO NOT DELETE OR OVERWRITE WITHOUT USER INSTRUCTION**
> Real survey observations from ESA Gaia DR3 (plus Hipparcos-2 for bright stars Gaia misses).

150 ly is the **only** dataset. The former 100 ly dataset (`gaia_100ly_v1.csv`, `star_catalog_100ly_v1.csv`, `gaia_stars_100ly.json`) has been dropped.

**Frame:** all CSVs are equatorial ICRS. `ra`/`dec` in degrees at the Gaia DR3 reference epoch (J2016.0); `x_ly`, `y_ly`, `z_ly` are Sun-centred Cartesian coordinates in light-years (x toward RA=0/Dec=0, z toward the north celestial pole). The ecliptic rotation happens only in the viz JSON (see below).

---

## Files

| File | Rows | Description |
| :--- | ---: | :--- |
| `gaia_150ly_v1.csv` | 37,270 | Raw ADQL export (before GCNS cleaning) from `gaiadr3.gaia_source` (`parallax >= 21.744`, i.e. $d \le 150\text{ ly}$, and `parallax_over_error >= 10`). Kept unchanged. |
| `gaia_150ly_v2.csv` | 31,301 | Clean input: v1 joined to the Gaia Catalogue of Nearby Stars (`external.gaiaedr3_gcns_main_1`) on `source_id` via ESA Gaia archive async TAP. Strict subset of v1, sorted by distance, adds `ruwe`; 21,768 rows have `radial_velocity`. Column `source_id` is lowercase. |
| `star_catalog_150ly_v2.csv` | 31,301 | Built from v2 by `scripts/build_star_catalog.py`. Adds `absolute_g_mag`, `rough_star_type` (HR-diagram class), `catalog_label`, `star_name` (302 named). |
| `star_names_simbad.csv` | 383 | The only name source, built by `scripts/resolve_star_names.py`; every row verified against SIMBAD. Columns: `simbad_ident`, `display_name`, `simbad_main_id`, `gaia_dr3_source_id`, `hip`, `name_type`, `fame_tier`. See [Star names](#star-names). |
| `hipparcos_bright_150ly.csv` | 5,366 | Raw VizieR `I/311/hip2` export (Hipparcos new reduction; `plx >= 21.744` mas, `plx/e_plx >= 10`). `gaia_source_id` is a positional match: Gaia propagated to epoch 1991.25, 10″ radius, with 14 matches dropped where the Gaia source was >1.5 mag fainter (a companion, e.g. Sirius A had matched Sirius B). 4,823 matched (all in v2, `gaia_in_v2`), 543 unmatched. |
| `hipparcos_missing_150ly.csv` | 122 | Built by `scripts/prepare_hipparcos_missing.py`: `gaia_in_v2 == False` and `hp_mag < 6`, positions propagated from epoch 1991.25 to J2016, `bp_rp_est` from the B−V → BP−RP median mapping (see [Classes](#classes)), `rough_star_type`, names from `star_names_simbad.csv` (81 named), tagged `source=Hipparcos`. 120 go into the point cloud; α Cen A/B are flagged `drawn_by_alpha_cen_group`. Replaces the old hand-typed list of 16 stars (`MISSING_BRIGHT_STARS`). |

### Contents of `star_catalog_150ly_v2.csv` (`rough_star_type`)

| Class | Count |
| :--- | ---: |
| White Dwarf | 1,658 |
| Other stars (Red/Orange/Yellow Dwarf, F, A, Hot Blue, Giant/Subgiant, Unclassified; rule and counts in [Classes](#classes)) | 29,643 |
| Brown dwarfs | not separately classified; they fall in Red Dwarf. A rough photometric cut (absolute G > 16 and BP−RP ≥ 2.5) flags about 823 candidates, which likely includes late M dwarfs. |

Named stars come only from SIMBAD (no hand-typed IDs). Earlier wrong labels were fixed: Menkent, Rasalhague, Merak, Phecda, Mizar A, Dubhe, p Eri A/B, a duplicate Van Maanen, Keid (now on 40 Eri B), Cor Caroli (now on alpha2 CVn).

### Star names

`star_names_simbad.csv` has 383 rows (plus header). `hipparcos_simbad_names.csv` has been retired and deleted; this table covers all of its names.

- `name_type`: 218 `iau`, 132 `bayer`, 15 `flamsteed`, 18 `catalog`. IAU names come from the live IAU WGSN list (via exopla.net, 640 names as of 2026-09-22). Barnard's Star is typed `iau`.
- `fame_tier`: `0` famous (34 stars), `1` bright, i.e. `hp_mag` < 4 or Gaia G when not in Hipparcos (98), `2` other (251).
- Keys: 302 rows by `gaia_dr3_source_id`, 81 by `hip` only. The HIP-only rows are the Hipparcos supplement: 81 of the 122 stars in `hipparcos_missing_150ly.csv` are named; the other 41 are fainter than Hp 4.5. Rasalhague and Phecda are keyed by HIP because their curated Gaia ids are not in `gaia_150ly_v2`.
- 36 Oph A has `display_name` "Guniibuu (36 Ophiuchi A)".
- Not within 150 ly, so never labelled: Deneb, Polaris, Canopus, Rigel, Betelgeuse, Antares, Spica.

---

## Pipeline

1. **`scripts/resolve_star_names.py`** → `star_names_simbad.csv` (needs network access to SIMBAD).
2. **`scripts/build_star_catalog.py`**: reads `gaia_150ly_v2.csv` + `star_names_simbad.csv`, computes absolute G magnitude and HR classes → `star_catalog_150ly_v2.csv`.
3. **`scripts/prepare_hipparcos_missing.py`**: reads `hipparcos_bright_150ly.csv` (+ `gaia_150ly_v2.csv` for the B−V → BP−RP mapping, `star_names_simbad.csv` for names) → `hipparcos_missing_150ly.csv`.
4. **`viewer/scripts/build_gaia_stars.py`**: reads `star_catalog_150ly_v2.csv` + `hipparcos_missing_150ly.csv` → `viewer/public/gaia_stars_150ly.json`: 31,420 points in the cloud (31,300 Gaia DR3 + 120 Hipparcos), 380 names, 9 classes. α Cen A, α Cen B and Proxima are drawn separately by the Alpha Centauri group.

### Runtime JSON format (`gaia_stars_150ly.json`)

- `count`, `sources`: `[["Gaia DR3", 0, nGaia], ["Hipparcos", nGaia, count]]` (Gaia points first, then Hipparcos).
- `pos`: flat xyz in **light-years**, rounded to 0.001, in the **ecliptic scene frame** `[x, z_ecl, y_ecl]` (y up = ecliptic north; obliquity 23.4392811°; x toward the vernal equinox, shared with ICRS).
- `col`: flat RGB (0–255) interpolated from `bp_rp` (Hipparcos rows use an estimated `bp_rp`).
- `bin`: brightness bin 0..5 from absolute magnitude (G for Gaia, Hp for Hipparcos); drives point size/opacity (`GAIA_BINS` in `viewer/src/data.ts`):

  | Bin | Absolute mag | Point size | Points |
  | :-: | :--- | :--- | ---: |
  | 0 | < 2.0 (brightest) | 7.5 px | 270 |
  | 1 | 2.0 – 4.0 | 5.8 px | 979 |
  | 2 | 4.0 – 6.5 | 4.6 px | 2,902 |
  | 3 | 6.5 – 9.0 | 3.6 px | 4,336 |
  | 4 | 9.0 – 11.5 (also rows with no magnitude) | 2.7 px | 11,234 |
  | 5 | ≥ 11.5 (faintest) | 2.0 px | 11,699 |

- `cls`: per-point class index into `classes`.
- `classes`: `[{id, key, label, count}]`, one entry per class (see [Classes](#classes)).
- `names`: `[index, name, fame_tier]`, sorted by tier, then by apparent brightness. 380 entries (tiers 0/1/2: 31 / 98 / 251); α Cen A, α Cen B and Proxima are not listed because the Alpha Centauri group draws them. Every named star is a fly-to target (380 plus the Alpha Cen group).

### Classes

One rule, in `scripts/star_classes.py`, shared by `build_star_catalog.py` (Gaia, `rough_star_type` in `star_catalog_150ly_v2.csv`) and `prepare_hipparcos_missing.py` (Hipparcos). M is absolute magnitude: G for Gaia, Hp for Hipparcos (whose BP−RP is estimated from B−V, see below). Tests in order:

1. White dwarf: M > 10 and BP−RP < 1.5.
2. Giant/subgiant: BP−RP ≥ 0.8 and M < 3.5 + 2·(BP−RP − 0.8), i.e. roughly ≥ 1.5 mag above the main sequence.
3. Otherwise by colour: BP−RP < 0 hot blue; 0–0.3 A; 0.3–0.6 F; 0.6–1.0 Sun-like; 1.0–1.8 orange dwarf; ≥ 1.8 red dwarf (brown-dwarf candidates stay here).

The rule has no gaps: unclassified only means missing photometry (596 points without BP−RP, 1 without M).

B−V → BP−RP is the median BP−RP per 0.1 mag B−V bin over 4,777 matched stars, linearly interpolated. B−V == 0.000 is excluded because the export uses it as a missing-value sentinel (51 rows). This replaced a cubic fit that had put Sirius and Vega at BP−RP ≈ 0.8.

**Class counts (JSON `classes`, order = `id`; the single place to update):**

| id | key | Label | Points |
| :-: | :--- | :--- | ---: |
| 0 | `red_dwarf` | Red dwarf | 23,016 |
| 1 | `orange_dwarf` | Orange dwarf | 3,272 |
| 2 | `yellow_dwarf` | Sun-like | 2,183 |
| 3 | `f_type` | F-type | 357 |
| 4 | `a_type` | A-type | 107 |
| 5 | `hot_blue` | Hot blue | 14 |
| 6 | `giant` | Giant | 216 |
| 7 | `white_dwarf` | White dwarf | 1,658 |
| 8 | `unclassified` | Unclassified | 597 |
| | | **Total** | **31,420** |

Proxima (and alpha Cen A/B, which have no Gaia DR3 entry) are excluded from the point cloud; `main.ts` draws them in a dedicated Alpha Centauri group on their Kepler orbit.
