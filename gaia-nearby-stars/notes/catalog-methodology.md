# Gaia 100-Light-Year Star Catalog Project

## Goal

This project creates a local, Sun-centered 3D star catalog for known Gaia DR3 sources within roughly **100 light-years** of the Sun.

The first dataset contains Gaia sources selected by parallax:

```sql
parallax >= 32.616
```

This corresponds to approximately 100 light-years:

```text
100 light-years ≈ 30.66 parsecs
parallax_mas = 1000 / distance_pc
1000 / 30.66 ≈ 32.616 mas
```

A quality filter was also used:

```sql
parallax_over_error >= 10
```

This keeps sources with relatively reliable parallax measurements.

The first count query returned:

```text
10,017 sources
```

## Data Source

The data comes from **Gaia DR3**, queried through the Gaia@AIP SQL/ADQL interface:

```text
https://gaia.aip.de/query/
```

Main source table:

```sql
gaiadr3.gaia_source
```

## Export Query Used

The full query should produce a table named something like:

```text
gaia_100ly_v1
```

```sql
SELECT
    source_id,

    ra,
    dec,
    parallax,
    parallax_error,
    parallax_over_error,

    pmra,
    pmdec,
    radial_velocity,

    phot_g_mean_mag,
    phot_bp_mean_mag,
    phot_rp_mean_mag,
    bp_rp,

    1000.0 / parallax AS distance_pc,
    (1000.0 / parallax) * 3.26156 AS distance_ly,

    ((1000.0 / parallax) * 3.26156)
        * COS(RADIANS(dec))
        * COS(RADIANS(ra)) AS x_ly,

    ((1000.0 / parallax) * 3.26156)
        * COS(RADIANS(dec))
        * SIN(RADIANS(ra)) AS y_ly,

    ((1000.0 / parallax) * 3.26156)
        * SIN(RADIANS(dec)) AS z_ly

FROM gaiadr3.gaia_source
WHERE parallax >= 32.616
  AND parallax_over_error >= 10
ORDER BY distance_ly ASC;
```

## What the Columns Mean

| Column | Meaning |
|---|---|
| `source_id` | Unique Gaia DR3 source identifier |
| `ra` | Right ascension, sky longitude, in degrees |
| `dec` | Declination, sky latitude, in degrees |
| `parallax` | Apparent annual parallax in milliarcseconds; used for distance |
| `parallax_error` | Error/uncertainty of the parallax measurement |
| `parallax_over_error` | Signal-to-noise ratio of the parallax measurement |
| `pmra` | Proper motion in right ascension |
| `pmdec` | Proper motion in declination |
| `radial_velocity` | Motion toward/away from the Sun, when available |
| `phot_g_mean_mag` | Gaia G-band apparent magnitude |
| `phot_bp_mean_mag` | Gaia blue photometer magnitude |
| `phot_rp_mean_mag` | Gaia red photometer magnitude |
| `bp_rp` | Gaia color index; useful for rough temperature/star-type estimates |
| `distance_pc` | Distance from the Sun in parsecs |
| `distance_ly` | Distance from the Sun in light-years |
| `x_ly`, `y_ly`, `z_ly` | Sun-centered Cartesian 3D coordinates in light-years |

## Are Star Types Included?

Not directly.

Gaia DR3 gives positions, parallaxes, motion, brightness, and color. It does **not** automatically label every object as a red dwarf, orange dwarf, yellow dwarf, white dwarf, giant, etc. Those types have to be inferred.

A rough classification can be created using:

```text
bp_rp color index + absolute G magnitude
```

Important examples:

- Red and faint → likely **M dwarf / red dwarf**
- Orange and moderately faint → likely **K dwarf / orange dwarf**
- Yellow and Sun-like brightness → likely **G dwarf**
- Blue/white and faint → likely **white dwarf**
- Red and very bright → likely **giant or subgiant**

This classification is approximate. For scientific-quality spectral types, the catalog should later be cross-matched with sources such as SIMBAD or other spectral-type catalogs.

## Next Processing Step

Run the following Python script on the downloaded CSV file.

Expected input file:

```text
gaia_100ly_v1.csv
```

Output file:

```text
star_catalog_100ly_v1.csv
```

The script adds:

- `distance_pc`, if missing
- `distance_ly`, if missing
- `absolute_g_mag`
- `rough_star_type`
- `catalog_label`

## Python Script

```python
import pandas as pd
import numpy as np

# Change this to your downloaded filename
input_file = "gaia_100ly_v1.csv"
output_file = "star_catalog_100ly_v1.csv"

df = pd.read_csv(input_file)

# Make sure distance_pc exists
if "distance_pc" not in df.columns:
    df["distance_pc"] = 1000.0 / df["parallax"]

if "distance_ly" not in df.columns:
    df["distance_ly"] = df["distance_pc"] * 3.26156

# Absolute Gaia G magnitude
df["absolute_g_mag"] = (
    df["phot_g_mean_mag"]
    - 5 * np.log10(df["distance_pc"])
    + 5
)

def classify_star(row):
    bp_rp = row.get("bp_rp")
    M_G = row.get("absolute_g_mag")

    if pd.isna(bp_rp) or pd.isna(M_G):
        return "unknown"

    # Very rough HR-diagram classification
    if M_G > 10 and bp_rp < 1.5:
        return "white dwarf candidate"

    if bp_rp >= 1.8 and M_G >= 7.5:
        return "M dwarf / red dwarf candidate"

    if 1.0 <= bp_rp < 1.8 and 5.0 <= M_G < 9.0:
        return "K dwarf / orange dwarf candidate"

    if 0.6 <= bp_rp < 1.0 and 3.8 <= M_G < 6.5:
        return "G dwarf / yellow dwarf candidate"

    if 0.3 <= bp_rp < 0.6 and 2.0 <= M_G < 5.0:
        return "F dwarf candidate"

    if 0.0 <= bp_rp < 0.3 and 0.5 <= M_G < 3.0:
        return "A-type star candidate"

    if bp_rp < 0.0 and M_G < 1.5:
        return "B-type / very hot star candidate"

    if bp_rp > 0.8 and M_G < 2.5:
        return "giant/subgiant candidate"

    return "unclassified / check HR diagram"

df["rough_star_type"] = df.apply(classify_star, axis=1)

# Optional: create a friendly catalog label
df["catalog_label"] = "Gaia DR3 " + df["source_id"].astype(str)

# Sort nearest first
df = df.sort_values("distance_ly")

df.to_csv(output_file, index=False)

print("Saved:", output_file)
print()
print(df["rough_star_type"].value_counts())
print()
print(df[[
    "catalog_label",
    "distance_ly",
    "absolute_g_mag",
    "bp_rp",
    "rough_star_type"
]].head(20))
```

## Suggested Project Structure

```text
gaia-100ly-star-map/
├── data/
│   ├── gaia_100ly_v1.csv
│   └── star_catalog_100ly_v1.csv
├── scripts/
│   └── build_star_catalog.py
├── README.md
└── notes/
    └── query_notes.md
```

## Recommended Next Steps

1. Put the downloaded Gaia table into `data/gaia_100ly_v1.csv`.
2. Save the Python script as `scripts/build_star_catalog.py`.
3. Run the script.
4. Inspect the generated `star_catalog_100ly_v1.csv`.
5. Make a 3D visualization using `x_ly`, `y_ly`, and `z_ly`.
6. Later, improve the catalog by cross-matching Gaia source IDs with named-star and spectral-type databases.

## Important Caveats

This is a real observational catalog, not a simulation, but it is not perfect.

Main limitations:

- Gaia sources are not always individual stars; some may be unresolved binaries or complicated systems.
- The rough star-type classification is approximate.
- Brown dwarfs and very faint companions may be missing or incomplete.
- Radial velocity is missing for many sources.
- The 100-light-year catalog is very good for a local map, but not a complete census of every physical object.
