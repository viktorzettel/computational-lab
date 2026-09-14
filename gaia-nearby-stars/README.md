# Gaia Nearby Stars (100 Light-Year 3D Map)

A Sun-centered, interactive 3D map of Gaia DR3 stellar sources within ~100 light-years (~30.66 parsecs), featuring real astronomical coordinates, observational photometry, and heuristic Hertzsprung–Russell diagram stellar classification.

---

## Overview

This project builds a local stellar neighborhood catalog directly from European Space Agency (ESA) Gaia DR3 data. It transforms raw astrometric and photometric measurements into 3D Cartesian space centered on the Sun, infers approximate stellar classifications from color index and absolute magnitude, and visualizes over 10,000 stars in an interactive Three.js environment.

```
       Gaia DR3 SQL / ADQL Query (gaia.aip.de)
                         ↓
           Raw Dataset (gaia_100ly_v1.csv)
                         ↓
    Processing Script (scripts/build_star_catalog.py)
   • Parallax to Distance (pc & ly)
   • 3D Cartesian Coordinates (x, y, z in ly)
   • Absolute Magnitude (M_G)
   • HR-Diagram Stellar Classification
                         ↓
      Processed Catalog (star_catalog_100ly_v1.csv)
                         ↓
       Interactive 3D Viewer (Three.js WebGL)
```

---

## Repository Structure

```
gaia-nearby-stars/
├── data/
│   ├── gaia_100ly_v1.csv            # Raw Gaia DR3 query output (~10,017 sources)
│   ├── star_catalog_100ly_v1.csv    # Fully processed 3D star catalog with classification
│   └── gaia_100_200ly_shell_v1.csv  # Supplementary outer-shell sample query
├── scripts/
│   └── build_star_catalog.py        # Python pipeline to transform raw Gaia data
├── viewer/
│   ├── index.html                   # 3D interactive viewer interface & HUD
│   ├── index.css                    # Modern sci-fi HUD styling & controls
│   ├── app.js                       # Three.js 3D rendering engine, shaders & search
│   └── data/
│       └── star_catalog_100ly_v1.csv# Pre-bundled catalog for the viewer
├── notes/
│   └── catalog-methodology.md       # Full SQL query & astrophysical documentation
└── README.md
```

---

## How to Replay & Reproduce

### 1. Replay the Catalog Generation

The raw dataset (`data/gaia_100ly_v1.csv`) is already included in this repository. To rebuild the processed catalog from scratch:

```bash
# 1. Install dependencies
pip install pandas numpy

# 2. Run the processing script
python scripts/build_star_catalog.py
```

The script will:
- Validate and calculate distance in parsecs and light-years from `parallax`.
- Compute 3D Sun-centered Cartesian coordinates (`x_ly`, `y_ly`, `z_ly`).
- Compute absolute magnitude:
  $$M_G = m_G - 5 \log_{10}(d_{\text{pc}}) + 5$$
- Categorize each star into approximate spectral candidates based on $(G_{\text{BP}} - G_{\text{RP}})$ color index and $M_G$.
- Export the ready-to-render catalog to `data/star_catalog_100ly_v1.csv`.

---

### 2. Launch the Interactive 3D Viewer

The viewer is a standalone client-side web application built with Three.js. Because it fetches CSV data via HTTP requests, run a local web server:

```bash
# Option A: Run from inside the viewer directory
cd viewer
python3 -m http.server 8080

# Option B: Or use Node.js
npx serve viewer
```

Then open **[http://localhost:8080](http://localhost:8080)** in your browser.

#### Viewer Features:
- **Interactive 3D Navigation:** Orbit, pan, and zoom through 10,000+ local stars.
- **Search & Highlighting:** Instantly search for nearby stars (e.g., Alpha Centauri, Sirius, Proxima, Barnard's Star).
- **Distance Filters:** Filter stars by distance radius up to 100 light-years.
- **Spectral Types:** Filter by stellar classifications (O/B/A/F/G/K/M dwarfs, giants, white dwarfs).
- **HUD & Info Panel:** Click any star to view parallax, coordinates, apparent & absolute magnitudes, color index, and estimated type.
- **Astronomical Overlays:** Concentric distance rings (10, 25, 50, 75, 100 ly), galactic plane grid, solar system reference, and Oort cloud boundary.

---

## Gaia DR3 Query Specification

For full reproducibility, the raw dataset was queried from the **Gaia DR3** archive (`gaiadr3.gaia_source`) via ADQL:

```sql
SELECT
    source_id,
    ra, dec,
    parallax, parallax_error, parallax_over_error,
    pmra, pmdec, radial_velocity,
    phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag,
    bp_rp,
    1000.0 / parallax AS distance_pc,
    (1000.0 / parallax) * 3.26156 AS distance_ly,
    ((1000.0 / parallax) * 3.26156) * COS(RADIANS(dec)) * COS(RADIANS(ra)) AS x_ly,
    ((1000.0 / parallax) * 3.26156) * COS(RADIANS(dec)) * SIN(RADIANS(ra)) AS y_ly,
    ((1000.0 / parallax) * 3.26156) * SIN(RADIANS(dec)) AS z_ly
FROM gaiadr3.gaia_source
WHERE parallax >= 32.616
  AND parallax_over_error >= 10
ORDER BY distance_ly ASC;
```

- **Distance boundary:** `parallax >= 32.616 mas` $\approx d \le 100\text{ ly}$.
- **Quality filter:** `parallax_over_error >= 10` ensures signal-to-noise ratio $\ge 10$ for high astrometric fidelity.

---

## Caveats & Limitations

- **Stellar Classifications:** Types assigned by this pipeline are heuristic visual classifications based on color index $(G_{\text{BP}} - G_{\text{RP}})$ and absolute magnitude $M_G$. They are intended for intuitive exploration and visual mapping, not rigorous spectroscopic confirmation.
- **Multi-star Systems:** Some Gaia sources represent unresolved binaries or blended light curves.
- **Faint Objects:** Ultracool dwarfs, brown dwarfs, and faint white dwarfs near the sensitivity limit may be underrepresented.

---

## License & Attribution

- Data source: **ESA Gaia DR3** (European Space Agency).
- Research & Visualization: **Viktor Zettel**.
