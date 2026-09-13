# Gaia Nearby Stars

A Sun-centered 3D visualization of Gaia DR3 sources within roughly **100 light-years**.

## What this project does

The project builds a local stellar catalogue from Gaia DR3, converts parallax measurements into distances and Sun-centered Cartesian coordinates, adds a rough HR-diagram-based stellar classification, and renders the resulting neighbourhood as an interactive Three.js map.

The first catalogue query returned roughly **10,000 sources** using:

```sql
parallax >= 32.616
AND parallax_over_error >= 10
```

The distance threshold corresponds to approximately 100 light-years.

## Pipeline

```text
Gaia DR3 query
      ↓
parallax / photometry / motion data
      ↓
distance + Cartesian coordinate calculation
      ↓
rough stellar classification
      ↓
local CSV catalogue
      ↓
interactive 3D visualization
```

## Public files

- `scripts/build_star_catalog.py` — catalogue processing and rough classification
- `notes/catalog-methodology.md` — query and methodology notes
- `viewer/` — interactive Three.js visualization

## Caveats

The stellar-type labels are approximate visual classifications based mainly on Gaia color and absolute magnitude. They are useful for exploration, not a substitute for spectroscopic classification.

Data source: Gaia DR3.
