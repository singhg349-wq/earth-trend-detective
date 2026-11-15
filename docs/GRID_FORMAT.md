# Global 1-Degree Grid Format Specification (`docs/GRID_FORMAT.md`)

Status: authoritative format specification for the precomputed global 1-degree seasonal grid.
Owner: Worker W1 (data pipeline) and frontend integrator.

This document specifies how the build pipeline writes global 1-degree seasonal time series and trends, and how the static web app reads them without a backend server. Follow every rule exactly so independent implementations produce byte-identical files.

---

## 1. Design Choices and Alternatives

### 1.1 Tile Size Comparison (1-Degree Grid)

The global 1-degree grid has `360 x 180 = 64,800` cells. We store 4 variables across 5 seasons (`ANN`, `DJF`, `MAM`, `JJA`, `SON`), which equals 20 variable-season layers.

| Tile size | Cells per tile | Global tiles per layer | Total files (20 layers, with land-only pruning) | Uncompressed tile size (Int16 JSON) | Verdict |
|---|---:|---:|---:|---:|---|
| **`10 x 10` deg (Recommended)** | `100` | `36 x 18 = 648` | `11,030` | `24–34 KB` | **Recommended.** Fits under `300 KB` by 9x. Keeps file count under static-host limits. |
| `30 x 30` deg | `900` | `12 x 6 = 72` | `1,260` | `215–305 KB` | **Rejected.** Crowds or exceeds the `300 KB` limit. Downloads 899 unused cells per click. |
| `5 x 5` deg | `25` | `72 x 36 = 2,592` | `44,120` | `6–9 KB` | **Rejected.** Exceeds the 20,000-file limit on static hosts such as Cloudflare Pages. Slows down Git and builds. |

### 1.2 Storage Format Designs

#### Main Design (Recommended): Compact Int16-Scaled JSON Tiles
- **Path:** `data/artifacts/grid/<variable>/<season>/<tile_lon>_<tile_lat>.json` plus `data/artifacts/grid/index.json`.
- **How it works:** Each tile is a minified UTF-8 JSON file. Cell values, coverage fractions, and full-period Sen slopes are stored as quantized signed 16-bit integers (`int16`). The browser fetches one JSON tile with `fetch()` and decodes the clicked cell using `scale` and `offset` from `index.json`.
- **Why choose this design:**
  1. It matches the required path `data/artifacts/grid/<variable>/<season>/<lon>_<lat>.json`.
  2. Standard `response.json()` parses the tile in every browser without custom binary parsers or endianness bugs.
  3. Integer arrays eliminate floating-point formatting differences between Python and JavaScript.
  4. Each tile is `24–34 KB` uncompressed (`6–9 KB` gzipped), well under the `300 KB` limit.

#### Alternative 1: Little-Endian Int16 Binary Tiles (`.bin` + `index.json`)
- **Path:** `data/artifacts/grid/<variable>/<season>/<tile_lon>_<tile_lat>.bin` plus `data/artifacts/grid/index.json`.
- **How it works:** Each `.bin` file stores 100 fixed-length cell records in row-major order (`lat` south-to-north, `lon` west-to-east). Each cell stores `[s, v_0, ..., v_{N-1}, c_0, ..., c_{N-1}]` as little-endian `int16` (`2 * (2N + 1)` bytes per cell). For `N = 47` years, each cell is `190 bytes` and each 100-cell tile is exactly `19,000 bytes` (`18.6 KB`).
- **Pros:** Smallest uncompressed disk footprint (`93.3 MB` total across all 4 variables and 5 seasons). Zero JSON text overhead.
- **Cons:** Harder to inspect during debugging. Coastal tiles waste bytes on empty ocean cells. Requires manual byte-offset math in `DataView`.
- **When to use:** Switch to Alternative 1 only if the lead enforces the `150 MB` cap on the **uncompressed 4-variable sum** on disk rather than per-variable or gzipped size.

#### Alternative 2: Unscaled Float JSON or All-Seasons-in-One JSON Tile
- **How it works:** Stores raw floating-point numbers (`289.431...`) in JSON, or bundles all 5 seasons (`ANN`, `DJF`, `MAM`, `JJA`, `SON`) into one file per `<variable>/<lon>_<lat>.json`.
- **Why rejected:**
  1. Unscaled floats use 7–10 characters per number and push the 4-variable total above `500 MB` uncompressed.
  2. Floating-point text serialization causes rounding mismatches across languages.
  3. Bundling 5 seasons into one file multiplies tile size by 5x (`130–170 KB` for int16, `> 400 KB` for float) and downloads 4 unused seasons on every click.

---

## 2. File Tree and Canonical Identifiers

Store all grid files under `data/artifacts/grid/`:

```text
data/artifacts/grid/
  index.json
  <variable>/
    <season>/
      <tile_lon>_<tile_lat>.json
```

### 2.1 Variable Directory Slugs (`<variable>`)

Use these exact directory names and contract variable names in this order:

| Order | `<variable>` slug | Contract `variable` field | Source product & version | Source variable | Native grid | Regridding to 1 deg | Domain |
|---:|---|---|---|---|---|---|---|
| 1 | `precip` | `precipitation` | `GPCPMON` v`3.3` | `sat_gauge_precip` | `0.5 x 0.5` deg | `2 x 2` block mean weighted by `cos(lat)` | Global |
| 2 | `t2m` | `temperature` | `M2TMNXSLV` v`5.12.4` | `T2M` | `0.5 x 0.625` deg | Area-weighted (`cos(lat)` x overlap area) bin mean | Global |
| 3 | `aod` | `aerosol_optical_depth` | `M2TMNXAER` v`5.12.4` | `TOTEXTTAU` | `0.5 x 0.625` deg | Area-weighted (`cos(lat)` x overlap area) bin mean | Global |
| 4 | `soil` | `soil_moisture` | `GLDAS_NOAH10_M` v`2.1` | `SoilMoi0_10cm_inst` | `1.0 x 1.0` deg | Native `1.0` deg grid (no regrid) | Land-only (`60S` to `90N`) |

### 2.2 Season Directory Slugs (`<season>`)

Use uppercase season codes: `ANN`, `DJF`, `MAM`, `JJA`, `SON`.

- `ANN`: months `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]` of calendar year `Y`.
- `DJF`: month `12` of year `Y - 1` plus months `[1, 2]` of year `Y`. Label the season with January year `Y`.
- `MAM`: months `[3, 4, 5]` of year `Y`.
- `JJA`: months `[6, 7, 8]` of year `Y`.
- `SON`: months `[9, 10, 11]` of year `Y`.
- **Complete-season rule:** A cell-season is valid only if all required months in that season are non-fill. Weight each month by its actual calendar days (`29` days for February in leap years).

---

## 3. Coordinate Grid, Cell IDs, and Browser Tile Lookup

### 3.1 1-Degree Cell Geometry and Cell-Centre Rule
1. Divide longitude `[-180, 180)` into 360 columns of width `1` degree.
2. Divide latitude `[-90, 90]` into 180 rows of height `1` degree.
3. Each cell has an integer **Southwest (lower-left) corner** `(cell_lon_sw, cell_lat_sw)` where:
   - `cell_lon_sw` is an integer in `[-180, 179]`.
   - `cell_lat_sw` is an integer in `[-90, 89]`.
4. Each cell covers `[cell_lon_sw, cell_lon_sw + 1) x [cell_lat_sw, cell_lat_sw + 1)`.
5. The **cell centre** is always offset by `+0.5` degrees from the Southwest corner:
   - `cell_lon = cell_lon_sw + 0.5` (in `{-179.5, -178.5, ..., -0.5, 0.5, ..., 179.5}`).
   - `cell_lat = cell_lat_sw + 0.5` (in `{-89.5, -88.5, ..., -0.5, 0.5, ..., 89.5}`).

### 3.2 Exact Browser Lookup Rule (from Click `lon`, `lat`)
When a user clicks `(lon, lat)` in decimal degrees:

1. **Normalize longitude** into `[-180.0, 180.0)` so `+180.0` wraps to `-180.0`:
   ```js
   const lonNorm = ((((lon + 180) % 360) + 360) % 360) - 180;
   ```
2. **Clamp latitude** into `[-90.0, 89.999999]` so `+90.0` (North Pole) maps to the top row `lat_sw = 89`:
   ```js
   const latClamped = Math.min(89.999999, Math.max(-90.0, lat));
   ```
3. **Compute the cell Southwest corner and cell centre**:
   ```js
   const cellLonSw = Math.floor(lonNorm);      // integer in -180..179
   const cellLatSw = Math.floor(latClamped);   // integer in -90..89
   const cellLon = cellLonSw + 0.5;            // half-degree in -179.5..179.5
   const cellLat = cellLatSw + 0.5;            // half-degree in -89.5..89.5
   ```
4. **Compute the `10 x 10` tile Southwest corner**:
   ```js
   const tileLon = Math.floor(cellLonSw / 10) * 10; // -180, -170, ..., 0, ..., 170
   const tileLat = Math.floor(cellLatSw / 10) * 10; // -90, -80, ..., 0, ..., 80
   ```

### 3.3 Exact Naming, Sign, and Zero-Padding Rules

#### Tile Filename (`<tile_lon>_<tile_lat>.json`)
- **Corner convention:** Name every tile by its **Southwest (lower-left) corner** `(tile_lon, tile_lat)`.
- **Order:** Longitude first, then underscore `_`, then latitude: `<tile_lon>_<tile_lat>.json`.
- **Signs:** Write `-` for negative numbers. Do **not** write `+` for zero or positive numbers.
- **Zero-padding:** Do **not** zero-pad tile coordinates. Write `0`, `-10`, `100` (never `000`, `-010`, `+100`).
- **Decimals:** None. Tile coordinates are integers.
- **Examples:** `-80_-10.json`, `0_0.json`, `100_-10.json`, `-120_50.json`.

#### Cell ID (`cell_<lat>_<lon>`)
- **Coordinate convention:** Name every cell by its **cell centre** `(cell_lat, cell_lon)`.
- **Order:** Latitude first, then underscore `_`, then longitude: `cell_<lat>_<lon>`. (Note: tile filenames use `<lon>_<lat>`, whereas cell IDs use `cell_<lat>_<lon>` per the scope specification.)
- **Signs:** Write `-` for negative numbers. Do **not** write `+` for positive numbers. Because centres end in `.5`, `0.0` never occurs (`-0.5` and `0.5` have explicit signs/values).
- **Zero-padding:** Do **not** pad leading zeros before the integer part. Keep the single `0` before the decimal point for `-0.5` and `0.5`.
- **Decimals:** Always write **1 decimal digit** (`.5`).
- **Exact formulas:**
  - Python: `f"cell_{cell_lat:.1f}_{cell_lon:.1f}"`
  - JavaScript: `` `cell_${cellLat.toFixed(1)}_${cellLon.toFixed(1)}` ``
- **Examples:** `cell_-4.5_-79.5`, `cell_-0.5_0.5`, `cell_53.5_-113.5`.

---

## 4. Int16 Scaling Rules

### 4.1 Quantization and Fill Value
- Store all numeric series values, coverage values, and Sen slopes as signed 16-bit integers (`int16`, range `-32768` to `32767`).
- **Fill value:** `-32768` represents missing (`null` / `NaN`) data for values and slopes.
- **Valid integer range:** Clamp valid quantized integers to `[-32767, 32767]`. Never encode a valid measurement as `-32768`.

### 4.2 Encode and Decode Formulas
- **Python encoder (writer):**
  Use round-half-to-even (`np.rint` or Python `round`) before casting to `int`:
  ```python
  def encode_int16(val: float | None, scale: float, offset: float) -> int:
      if val is None or np.isnan(val):
          return -32768
      q = int(np.rint((val - offset) / scale))
      return max(-32767, min(32767, q))
  ```
- **JavaScript decoder (browser reader):**
  ```js
  function decodeInt16(q, scale, offset, decimals) {
    if (q === -32768 || q === null || q === undefined) return null;
    return Number((q * scale + offset).toFixed(decimals));
  }
  ```

### 4.3 Canonical Scale and Offset Table

Convert `t2m` from Kelvin to degrees Celsius (`T_C = T_K - 273.15`) before encoding.

| `<variable>` | Display units | Series `scale` | Series `offset` | Series `decimals` | Representable valid series range | Slope units | Slope `scale` | Slope `offset` | Slope `decimals` | Coverage `scale` | Coverage `offset` |
|---|---|---:|---:|---:|---|---|---:|---:|---:|---:|---:|
| `precip` | `mm/day` | `0.01` | `0.0` | `2` | `-327.67` to `327.67` | `mm/day/decade` | `0.001` | `0.0` | `3` | `0.001` | `0.0` |
| `t2m` | `degC` | `0.01` | `0.0` | `2` | `-327.67` to `327.67` | `degC/decade` | `0.001` | `0.0` | `3` | `0.001` | `0.0` |
| `aod` | `1` | `0.001` | `0.0` | `3` | `-32.767` to `32.767` | `1/decade` | `0.0001` | `0.0` | `4` | `0.001` | `0.0` |
| `soil` | `kg/m2` | `0.01` | `0.0` | `2` | `-327.67` to `327.67` | `kg/m2/decade` | `0.001` | `0.0` | `3` | `0.001` | `0.0` |

---

## 5. Per-Cell Fields and JSON Tile Schema

### 5.1 Supported Year Vectors (`years`)
Each `(variable, season)` pair has one fixed contiguous integer `years` array covering all complete seasons in the verified archive:

| `<variable>` | Raw archive dates | `ANN`, `MAM`, `JJA`, `SON` `years` | `DJF` `years` (January year) |
|---|---|---|---|
| `precip` | `1983-01` to `2025-12` | `1983..2025` (`43` years) | `1984..2025` (`42` years) |
| `t2m` | `1980-01` to `2026-09` | `ANN`, `SON`: `1980..2025` (`46` yr); `MAM`, `JJA`: `1980..2026` (`47` yr) | `1981..2026` (`46` years) |
| `aod` | `1980-01` to `2026-09` | `ANN`, `SON`: `1980..2025` (`46` yr); `MAM`, `JJA`: `1980..2026` (`47` yr) | `1981..2026` (`46` years) |
| `soil` | `2000-01` to `2026-07` | `ANN`, `JJA`, `SON`: `2000..2025` (`26` yr); `MAM`: `2000..2026` (`27` yr) | `2001..2026` (`26` years) |

### 5.2 Tile JSON Structure (`<tile_lon>_<tile_lat>.json`)
Serialize every tile with UTF-8 encoding, no spaces (`separators=(",", ":")` in Python), and keys sorted in ascending ASCII order (`sort_keys=True` on `cells`):

```json
{
  "v_slug": "precip",
  "season": "DJF",
  "tile": [-80, -10],
  "cells": {
    "cell_-4.5_-79.5": {
      "s": 12,
      "v": [142, 89, 210],
      "c": 1000
    }
  }
}
```

### 5.3 Per-Cell Field Definitions
Inside `cells["cell_<lat>_<lon>"]`:
1. **`s` (integer, `int16`):** Precomputed full-period Sen slope per decade, quantized with `slope_scale` and `slope_offset`.
   - **Exact consistency rule:** Compute the full-period Sen slope from the **quantized-then-decoded** series `y[i] = decodeInt16(v[i], scale, offset, decimals)` across all valid years `i`. This guarantees that the browser's sub-period Sen slope calculator produces the exact same number when the user selects the full period.
   - If a cell has fewer than `10` valid years, set `"s": -32768`.
2. **`v` (array of integers, length `len(years)`):** Quantized seasonal values for each year in `years`. Missing years use `-32768`.
3. **`c` (integer `1000` OR array of integers of length `len(years)`):** Quantized valid-area coverage fraction (`0` = `0.000`, `1000` = `1.000`).
   - **Deterministic compaction rule:**
     - If every valid year (`v[i] != -32768`) has `c[i] == 1000` and every missing year (`v[i] == -32768`) has `c[i] == 0`, store the single integer `"c": 1000`.
     - When decoding `"c": 1000`, the browser sets `coverage[i] = (v[i] === -32768) ? 0.0 : 1.0` for each index `i`.
     - If any valid year has partial coverage (`0 < c[i] < 1000`), store the full integer array `"c": [c_0, c_1, ..., c_{N-1}]`.

---

## 6. How Land-Only and Missing Cells Are Stored

Follow these three rules at the tile, cell, and year levels:

1. **All-Empty Tiles (Omitted from Disk):**
   - If a `10 x 10` tile has zero cells with at least one valid year (for example, `soil` over open ocean or Antarctica `-90..-60`), **do not write the tile file**.
   - List all existing tile keys (`"<tile_lon>_<tile_lat>"`, sorted in ASCII order) in `index.json` under `variables[var].available_tiles[season]`.
   - Before fetching a tile, the browser checks `available_tiles`. If the tile key is absent, the browser immediately displays `"No data (ocean or outside sensor domain)"` without sending an HTTP request.
2. **Missing / Ocean Cells Inside a Partial Tile (Omitted from `cells`):**
   - In a coastal tile for a land-only variable (`soil`), or if all years in a cell are missing (`-32768`), **omit** the `cell_<lat>_<lon>` key from the tile's `"cells"` object.
   - If the tile exists but `tile.cells[cellId]` is `undefined`, the browser displays `"No data for this 1° cell"`.
3. **Missing Individual Years Inside a Valid Cell (`-32768` Fill):**
   - Keep the cell in `tile.cells`. Set `v[i] = -32768` and `c[i] = 0` for the missing year index `i`.
   - When computing Sen slopes in Python or JavaScript, skip all indices `i` where `v[i] == -32768`. Never renumber the remaining years; always divide by the true calendar year gap `years[j] - years[i]`.

---

## 7. Size Budget Arithmetic (4 Variables x 5 Seasons at 1 Degree)

### 7.1 Per-Cell and Per-Tile Arithmetic (Main Design: Int16 JSON)
For a 47-year series (`t2m` or `aod`, worst-case length) with full coverage (`"c": 1000`):
- **Cell key and framing:** `"cell_-12.5_-123.5":{"s":-12,"v":[...],"c":1000},` = `48 bytes`.
- **Series array `v`:** 47 integers x `4.5 bytes` average (3–4 digits plus comma) = `211.5 bytes`.
- **Total per cell:** `48 + 211.5 = 259.5 bytes` (`~260 bytes` average; `330 bytes` worst-case if every value is a 5-character negative integer).
- **Tile header:** `{"v_slug":"precip","season":"DJF","tile":[-180,-90],"cells":{...}}` = `68 bytes`.
- **Full 100-cell tile size:**
  - Average: `100 x 260 + 68 = 26,068 bytes` (**`25.5 KB`**).
  - Worst-case (all 5-char ints + full `c` array): `100 x 565 + 68 = 56,568 bytes` (**`55.2 KB`**).
  - **Tile budget check:** `55.2 KB < 300 KB` (**Passes** with >5x margin).

### 7.2 Total Size per Variable and 4-Variable Grand Total

Each global layer has `64,800` cells across `648` tiles (`324,000` cell-seasons across 5 seasons).
`soil` (GLDAS 2.1 land-only, `60S–90N`) has `~15,600` active land cells across `262` non-empty tiles (`78,000` cell-seasons across 5 seasons).

| Variable | Active cells / season | Avg years (`N`) | Bytes / cell (Int16 JSON) | 1-Tile avg / max (KB) | **Total per variable, 5 seasons (Main: Int16 JSON)** | Total per variable, 5 seasons (Gzipped HTTP) | Total per variable, 5 seasons (Alt 1: Binary `.bin`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `precip` | `64,800` | `42.8` | `240 B` | `24.1 / 51.0 KB` | **`77.8 MB`** | `18.2 MB` | `28.4 MB` |
| `t2m` | `64,800` | `46.4` | `258 B` | `25.9 / 55.2 KB` | **`83.6 MB`** | `19.8 MB` | `30.7 MB` |
| `aod` | `64,800` | `46.4` | `245 B` | `24.6 / 53.0 KB` | **`79.4 MB`** | `17.9 MB` | `30.7 MB` |
| `soil` (land) | `15,600` | `26.2` | `166 B` | `10.0 / 32.0 KB` | **`13.0 MB`** | `3.1 MB` | `4.2 MB` |
| **All 4 variables** | — | — | — | **`< 56 KB` (Limit: `300 KB`)** | **`253.8 MB` (FLAG!)** | **`59.0 MB`** | **`94.0 MB`** |

### 7.3 150 MB Budget Flag for the Lead
- **Per-variable check:** Every individual variable is between **`13.0 MB` and `83.6 MB`** uncompressed (under `150 MB`).
- **4-variable sum flag:** In the Main Design (uncompressed Int16 JSON), the sum across all 4 variables is **`253.8 MB`**, which **exceeds `150 MB` by `103.8 MB`** on disk (though its gzipped static-host size is `59.0 MB`).
- **Action required from Lead:**
  1. Confirm if `253.8 MB` uncompressed (`59.0 MB` gzipped) is approved, **OR**
  2. Authorize **Alternative 1 (Binary `.bin` tiles)**, which reduces the 4-variable uncompressed total to **`94.0 MB`** (strictly under `150 MB`).

---

## 8. `data/artifacts/grid/index.json` Layout

The browser loads `data/artifacts/grid/index.json` once at startup. It holds all metadata needed to validate clicks, find tiles, decode `int16` values, and build a `CONTRACT.md` response object.

```json
{
  "format_version": 1,
  "grid_resolution_deg": 1.0,
  "tile_size_deg": 10,
  "fill_int16": -32768,
  "seasons": {
    "ANN": {
      "code": "ANN",
      "year_label": "Calendar year",
      "months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      "aggregation": "day-weighted mean of 12 monthly values"
    },
    "DJF": {
      "code": "DJF",
      "year_label": "January year",
      "months": [12, 1, 2],
      "aggregation": "day-weighted mean of 3 monthly values"
    },
    "MAM": {
      "code": "MAM",
      "year_label": "Calendar year",
      "months": [3, 4, 5],
      "aggregation": "day-weighted mean of 3 monthly values"
    },
    "JJA": {
      "code": "JJA",
      "year_label": "Calendar year",
      "months": [6, 7, 8],
      "aggregation": "day-weighted mean of 3 monthly values"
    },
    "SON": {
      "code": "SON",
      "year_label": "Calendar year",
      "months": [9, 10, 11],
      "aggregation": "day-weighted mean of 3 monthly values"
    }
  },
  "variables": {
    "precip": {
      "variable": "precipitation",
      "units": "mm/day",
      "slope_units": "mm/day/decade",
      "scale": 0.01,
      "offset": 0.0,
      "decimals": 2,
      "slope_scale": 0.001,
      "slope_offset": 0.0,
      "slope_decimals": 3,
      "coverage_scale": 0.001,
      "coverage_offset": 0.0,
      "coverage_decimals": 3,
      "land_only": false,
      "regrid_note": "GPCP 0.5 deg 2x2 block averaged to 1.0 deg with cos(lat) weights",
      "source": {
        "product": "GPCPMON",
        "version": "3.3",
        "var": "sat_gauge_precip",
        "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA306"
      },
      "years_by_season": {
        "ANN": [1983, 1984, 1985],
        "DJF": [1984, 1985],
        "MAM": [1983, 1984, 1985],
        "JJA": [1983, 1984, 1985],
        "SON": [1983, 1984, 1985]
      },
      "available_tiles": "ALL_648"
    },
    "soil": {
      "variable": "soil_moisture",
      "units": "kg/m2",
      "slope_units": "kg/m2/decade",
      "scale": 0.01,
      "offset": 0.0,
      "decimals": 2,
      "slope_scale": 0.001,
      "slope_offset": 0.0,
      "slope_decimals": 3,
      "coverage_scale": 0.001,
      "coverage_offset": 0.0,
      "coverage_decimals": 3,
      "land_only": true,
      "regrid_note": "Native 1.0 deg GLDAS-2.1 land grid (60S to 90N)",
      "source": {
        "product": "GLDAS_NOAH10_M",
        "version": "2.1",
        "var": "SoilMoi0_10cm_inst",
        "doi_or_url": "https://doi.org/10.5067/SXAVCZFAQLNO"
      },
      "years_by_season": {
        "DJF": [2001, 2002, 2003]
      },
      "available_tiles": ["-80_-10", "-80_0", "100_-10"]
    }
  }
}
```
*(Note: In production `index.json`, `years_by_season` lists the full year array from Section 5.1, and `t2m` and `aod` follow the same structure.)*

---

## 9. Tiny Worked Example (End-to-End)

### 9.1 User Click Input
- User clicks Coastal Peru at `lon = -79.23`, `lat = -4.61`.
- Selected variable: `precip`, season: `DJF`.
- Assume a 3-year toy period: `years = [2023, 2024, 2025]`.

### 9.2 Browser Coordinate Lookup
1. `lonNorm = -79.23`, `latClamped = -4.61`.
2. `cellLonSw = Math.floor(-79.23) = -80`, `cellLatSw = Math.floor(-4.61) = -5`.
3. `cellLon = -80 + 0.5 = -79.5`, `cellLat = -5 + 0.5 = -4.5`.
4. `cellId = "cell_-4.5_-79.5"`.
5. `tileLon = Math.floor(-80 / 10) * 10 = -80`, `tileLat = Math.floor(-5 / 10) * 10 = -10`.
6. Browser fetches `data/artifacts/grid/precip/DJF/-80_-10.json`.

### 9.3 Raw Physical Values and Int16 Encoding (Writer)
For `cell_-4.5_-79.5`:
- Physical DJF means (`mm/day`): `2023 -> 1.42`, `2024 -> 1.50`, `2025 -> 1.68`.
- Physical coverages: `[1.0, 1.0, 1.0]`.
- Quantized `v` (`scale = 0.01`, `offset = 0.0`):
  - `2023`: `round(1.42 / 0.01) = 142`
  - `2024`: `round(1.50 / 0.01) = 150`
  - `2025`: `round(1.68 / 0.01) = 168`
- Pairwise slopes per decade from decoded values `[(2023, 1.42), (2024, 1.50), (2025, 1.68)]`:
  - `(2023, 2024)`: `((1.50 - 1.42) / 1) * 10 = 0.800 mm/day/decade`
  - `(2023, 2025)`: `((1.68 - 1.42) / 2) * 10 = 1.300 mm/day/decade`
  - `(2024, 2025)`: `((1.68 - 1.50) / 1) * 10 = 1.800 mm/day/decade`
  - Median (Sen slope) = `1.300 mm/day/decade`.
- Quantized `s` (`slope_scale = 0.001`, `slope_offset = 0.0`): `round(1.300 / 0.001) = 1300`.
- Because all valid years have coverage `1.0` (`1000`), `"c": 1000`.

### 9.4 Exact Tile File (`data/artifacts/grid/precip/DJF/-80_-10.json`)
```json
{"v_slug":"precip","season":"DJF","tile":[-80,-10],"cells":{"cell_-4.5_-79.5":{"s":1300,"v":[142,150,168],"c":1000}}}
```

### 9.5 Reconstructed Contract Result in Browser
Calculate `area_km2` for the `1 x 1` degree cell with `R = 6371.0088 km`:
`area_km2 = Number((R * R * (Math.PI / 180) * (Math.sin((-4 * Math.PI) / 180) - Math.sin((-5 * Math.PI) / 180))).toFixed(1)) = 12284.1`.

```json
{
  "id": "precip_cell_-4.5_-79.5_DJF",
  "variable": "precipitation",
  "units": "mm/day",
  "source": {
    "product": "GPCPMON",
    "version": "3.3",
    "var": "sat_gauge_precip",
    "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA306"
  },
  "region": {
    "id": "cell_-4.5_-79.5",
    "label": "4.5°S, 79.5°W (1° cell)",
    "geometry": "BBOX",
    "bbox": [-80, -5, -79, -4],
    "cells_used": 1,
    "area_km2": 12284.1
  },
  "season": {
    "code": "DJF",
    "year_label": "January year",
    "months": [12, 1, 2],
    "aggregation": "day-weighted mean of 3 monthly values"
  },
  "years": [2023, 2024, 2025],
  "values": [1.42, 1.5, 1.68],
  "coverage": [1.0, 1.0, 1.0],
  "trend": {
    "method": "theil_sen",
    "slope_per_decade": 1.3,
    "slope_units": "mm/day/decade",
    "n_valid": 3,
    "period": [2023, 2025],
    "inference": {
      "status": "unavailable"
    }
  },
  "validation": {
    "status": "unchecked-same-method"
  },
  "template_summary": "For cell_-4.5_-79.5 (4.5°S, 79.5°W (1° cell)) in DJF (2023-2025, n=3), precipitation has a descriptive Theil-Sen slope of +1.300 mm/day/decade (inference status: unavailable; validation: unchecked-same-method)."
}
```
