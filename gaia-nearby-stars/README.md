# Gaia Nearby Stars (0 to 150 Light-Years)

An interactive 3D map of the stellar neighbourhood within 150 light-years of the Sun, built from ESA Gaia DR3 with a Hipparcos-2 supplement for bright stars that Gaia misses. The viewer is a TypeScript, Vite 8 and Three.js 0.184 app. It shows the Sun, Earth and the Alpha Centauri system at true scale and lets you fly a relativistic rocket to any named star.

## What the map contains

31,423 objects:

- **31,300 Gaia DR3 stars** from the Gaia Catalogue of Nearby Stars (GCNS)-joined list, including white dwarfs and brown dwarfs.
- **120 bright Hipparcos stars** (Hp < 6) that are missing from the Gaia list.
- **α Centauri A, α Centauri B and Proxima Centauri**, drawn separately on their Kepler orbit by a dedicated Alpha Centauri group rather than as points in the cloud.

**380 named stars** are labelled in three fame tiers (31 / 98 / 251). The names come from a table of 383 name rows, each checked against SIMBAD. α Cen A, α Cen B and Proxima are the other three rows and are handled by the Alpha Centauri group. Every named star is a fly-to target.

### Star classes

Each point gets one of 9 rough classes from colour (BP−RP) and absolute magnitude. The same rule is applied to Gaia and Hipparcos stars (`scripts/star_classes.py`).

| Class | Points |
| :--- | ---: |
| Red dwarf | 23,016 |
| Orange dwarf | 3,272 |
| Sun-like | 2,183 |
| F-type | 357 |
| A-type | 107 |
| Hot blue | 14 |
| Giant/subgiant | 216 |
| White dwarf | 1,658 |
| Unclassified (no photometry) | 597 |
| **Total** | **31,420** |

Brown dwarfs can't be told apart from late M dwarfs by photometry alone, so they are counted as red dwarfs. "Unclassified" only means missing photometry (596 points have no BP−RP and 1 has no absolute magnitude).

## Viewer features

- True-scale Alpha Centauri system (A, B and Proxima) together with the Sun and Earth.
- The 150 ly point cloud, coloured by BP−RP, with 6 brightness bins by absolute magnitude.
- Relativistic rocket flight at a constant 1.5 g. The ship flips 180° at the midpoint and decelerates, and the travel panel shows speed, the Lorentz factor γ, ship (proper) time and Earth time.
- 3-2-1 countdown before ignition. Esc cancels the countdown, and Esc during a flight returns to Free Orbit.
- Mouse look-around during the flight.
- 4 camera modes: Chase, Cockpit, Free Orbit and Cinematic.
- A searchable fly-to list with every named star.
- A collapsible star-class legend.

## Run the viewer

Requires Node.js and npm.

```bash
cd viewer
npm install
npm run dev
```

Then open http://localhost:5173.

`npm run build` type-checks with `tsc` and writes a production build to `viewer/dist/`. `npm run preview` serves that build at http://localhost:4173.

## Folder layout

```
gaia-nearby-stars/
├── data/                         Catalogue CSVs and data documentation
│   ├── README.md                 Files, columns, pipeline, JSON format, class rule
│   ├── gaia_150ly_v1.csv         Raw Gaia DR3 export (37,270 rows)
│   ├── gaia_150ly_v2.csv         v1 joined to GCNS (31,301 rows)
│   ├── star_catalog_150ly_v2.csv Processed catalogue with classes and names
│   ├── star_names_simbad.csv     SIMBAD-verified names (383 rows)
│   ├── hipparcos_bright_150ly.csv   Hipparcos-2 export (5,366 stars)
│   └── hipparcos_missing_150ly.csv  Bright Hipparcos stars missing from Gaia (122 rows)
├── scripts/                      Python data pipeline
│   ├── star_classes.py
│   ├── build_star_catalog.py
│   ├── prepare_hipparcos_missing.py
│   └── resolve_star_names.py
├── viewer/                       TypeScript + Vite + Three.js app
│   ├── index.html
│   ├── src/                      main.ts (app logic), data.ts (constants, orbits), style.css
│   ├── public/gaia_stars_150ly.json   Runtime star data
│   └── scripts/build_gaia_stars.py    Builds the runtime JSON
└── notes/
    └── catalog-methodology.md    Selection, cross-matching and caveats
```

## Data pipeline

All catalogue CSVs are equatorial ICRS: `ra`/`dec` at the Gaia DR3 epoch J2016.0, and Sun-centred `x_ly`, `y_ly`, `z_ly` in light-years. The runtime JSON is rotated into an ecliptic scene frame.

```
data/gaia_150ly_v1.csv          raw Gaia DR3 export: parallax >= 21.744 mas, parallax_over_error >= 10 (37,270 rows)
      ↓  join to GCNS (external.gaiaedr3_gcns_main_1) on source_id, ESA Gaia archive
data/gaia_150ly_v2.csv          31,301 rows, adds ruwe
      ↓  python3 scripts/build_star_catalog.py   (names from data/star_names_simbad.csv)
data/star_catalog_150ly_v2.csv  absolute G magnitude, star class, catalogue label, star name
      ↓  python3 viewer/scripts/build_gaia_stars.py   (+ data/hipparcos_missing_150ly.csv)
viewer/public/gaia_stars_150ly.json   31,420 points, 9 classes, 380 names
```

Hipparcos branch:

```
data/hipparcos_bright_150ly.csv   VizieR I/311/hip2: plx >= 21.744 mas, plx/e_plx >= 10; positional match to Gaia
      ↓  python3 scripts/prepare_hipparcos_missing.py
data/hipparcos_missing_150ly.csv  not in Gaia v2 and Hp < 6, propagated from epoch 1991.25 to J2016 (122 rows, 120 in the cloud)
```

`scripts/resolve_star_names.py` rebuilds `data/star_names_simbad.csv` and needs network access to SIMBAD. The other scripts run offline. Run them from this folder (`gaia-nearby-stars/`). They need Python 3 with `pandas` and `numpy`, and `resolve_star_names.py` also needs `requests`. Script paths are resolved relative to each script file. Note that the scripts overwrite the files in `data/` and `viewer/public/`.

More detail on each file, the name table, the brightness bins and the class rule is in [`data/README.md`](data/README.md).

## Caveats

- The star classes are rough photometric (HR-diagram) classes, not spectral types.
- There is no RUWE filter, so some Gaia sources may be unresolved binaries or have poor single-star fits.
- The Hipparcos supplement only adds stars brighter than Hp 6. 421 fainter Hipparcos stars that are missing from the Gaia list are left out; most of them lie near the 150 ly edge.
- Hipparcos stars have no Gaia BP−RP. Their colour is estimated from B−V with a median mapping over 4,777 stars that appear in both catalogues.
- Radial velocities are available for only part of the sample (21,768 of the 31,301 Gaia v2 rows).

## Attribution

- Data: ESA Gaia DR3, the Gaia Catalogue of Nearby Stars, Hipparcos new reduction (van Leeuwen 2007, VizieR I/311), and SIMBAD (CDS, Strasbourg). IAU star names come from the IAU WGSN list.
- Research and visualization: Viktor Zettel.
