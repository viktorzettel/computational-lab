import os
import pandas as pd
import numpy as np

# Resolve directories
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_dir = os.path.join(base_dir, "data")
os.makedirs(data_dir, exist_ok=True)

# Determine input file path
input_path_in_data = os.path.join(data_dir, "gaia_100ly_v1.csv")
input_path_in_root = os.path.join(base_dir, "gaia_100ly_v1.csv")

if os.path.exists(input_path_in_data):
    input_file = input_path_in_data
    print(f"Found input file in data folder: {input_file}")
elif os.path.exists(input_path_in_root):
    input_file = input_path_in_root
    print(f"Found input file in root folder: {input_file}")
    # Move it to data/ for consistency if needed
    try:
        import shutil
        shutil.move(input_path_in_root, input_path_in_data)
        input_file = input_path_in_data
        print(f"Moved raw catalog file to: {input_file}")
    except Exception as e:
        print(f"Note: Could not move file to data folder due to: {e}. Using root file.")
else:
    raise FileNotFoundError("Could not find gaia_100ly_v1.csv in root or data folder!")

output_file = os.path.join(data_dir, "star_catalog_100ly_v1.csv")

print("Loading dataset...")
df = pd.read_csv(input_file)

# Ensure distance columns exist
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

    # HR-diagram classification
    if M_G > 10 and bp_rp < 1.5:
        return "White Dwarf"

    if bp_rp >= 1.8 and M_G >= 7.5:
        return "Red Dwarf"

    if 1.0 <= bp_rp < 1.8 and 5.0 <= M_G < 9.0:
        return "Orange Dwarf"

    if 0.6 <= bp_rp < 1.0 and 3.8 <= M_G < 6.5:
        return "Yellow Dwarf"

    if 0.3 <= bp_rp < 0.6 and 2.0 <= M_G < 5.0:
        return "F-type Star"

    if 0.0 <= bp_rp < 0.3 and 0.5 <= M_G < 3.0:
        return "A-type Star"

    if bp_rp < 0.0 and M_G < 1.5:
        return "Hot Blue Star"

    if bp_rp > 0.8 and M_G < 2.5:
        return "Giant / Subgiant"

    return "Unclassified Star"

# Classifying stars
print("Classifying stars...")
df["rough_star_type"] = df.apply(classify_star, axis=1)

# Friendly catalog label
df["catalog_label"] = "Gaia DR3 " + df["source_id"].astype(str)

# Add standard catalog names for very prominent star systems in the 100ly catalog
named_stars = {
    5853498713190525696: "Alpha Centauri C (Proxima Centauri)",
    4472832130942575872: "Barnard's Star",
    762815470562110464: "Lalande 21185",
    5164707970261890560: "Epsilon Eridani (Ran)",
    6553614253923452800: "Lacaille 9352",
    1872046609345556480: "61 Cygni A",
    1872046574983497216: "61 Cygni B",
    6412595290592307840: "Epsilon Indi A",
    2452378776434477184: "Tau Ceti",
    4810594479418041856: "Kapteyn's Star",
    6583272171336048640: "Lacaille 8760 (AX Microscopii)",
    2306965202564744064: "Van Maanen's Star",
    1637645127018395776: "Gliese 687",
    5951824121022278144: "Gliese 674",
    3195919528989223040: "Keid A (40 Eridani A)",
    4468557611984384512: "70 Ophiuchi A",
    4468557611977674496: "70 Ophiuchi B",
    425040000962559616: "Achird A (Eta Cassiopeiae A)",
    425040000962497792: "Achird B (Eta Cassiopeiae B)",
    4847957293278177024: "82 Eridani",
    4109030160308317312: "p Eridani A",
    4109030160308320128: "p Eridani B",
    6427464123776727168: "Delta Pavonis",
    4683897617110115200: "Beta Hydri",
    96331172942614528: "Gliese 75",
    6604147121141267712: "TW Piscis Austrini (Fomalhaut B)",
    4993479684438433792: "Menkent (Theta Centauri)",
    1563590579347125632: "Merak (Beta Ursae Majoris)",
    4429785739602747392: "Rasalhague (Alpha Ophiuchi)",
    856096765753549056: "Phecda (Gamma Ursae Majoris)",
    4473334474604992384: "Cebalrai (Beta Ophiuchi)",
    1625209684868707328: "Mizar A (Zeta Ursae Majoris)",
}
df["star_name"] = df["source_id"].map(named_stars).fillna("")

# Sort nearest first
df = df.sort_values("distance_ly")

print(f"Saving catalog to {output_file}...")
df.to_csv(output_file, index=False)
print("Saved successfully!")
print("\nClass counts:")
print(df["rough_star_type"].value_counts())
