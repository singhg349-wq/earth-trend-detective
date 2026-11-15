"""Compare live native-grid DJF box series with Giovanni monthly exports."""
import csv
import math
import re
import shutil
import sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.trend.io import read_month
from backend.trend.regions import BOXES, box_mask
from backend.trend.seasons import area_mean
from backend.trend.series import build_series
from backend.trend.stats import sen_slope

# Share immutable monthly inputs across both regions and aggregation variants.
import backend.trend.series as live_series_module
live_series_module.read_month = lru_cache(maxsize=None)(live_series_module.read_month)

SOURCE = Path(r"C:\dev\planner\projects\trend-detective\data\raw")
PREFIX = "g4.areaAvgTimeSeries.GPCPMON_3_3_sat_gauge_precip.19831201-20250228."
FILES = {"indonesia": PREFIX + "95E_11S_141E_6N.csv",
         "coastal_peru": PREFIX + "82W_10S_76W_3S.csv"}

# Fixed before comparison: bias and MAE <= 0.5% of Giovanni mean; max annual
# absolute difference <= max(1% of mean, 0.05 mm/day); Sen slope difference
# <= max(2% of Giovanni slope magnitude, 0.005 mm/day/decade).

def read_giovanni(path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        lines = f.readlines()
    headers = dict(line.strip().split(":", 1) for line in lines[:8] if ":" in line)
    bbox = tuple(map(float, re.search(r'"?([^,]+,[^,]+,[^,]+,[^" ]+)', headers['Data Bounding Box']).group(1).split(',')))
    rows = csv.DictReader(lines[8:])
    monthly = {}
    for row in rows:
        row = {key.strip(): value.strip() for key, value in row.items()}
        value = float(row["mean_GPCPMON_3_3_sat_gauge_precip"])
        if value != -99999 and math.isfinite(value):
            date = row["time"][:10]
            monthly[(int(date[:4]), int(date[5:7]))] = value
    return bbox, monthly

def djf(monthly, equal=False):
    years, values = [], []
    for year in range(1984, 2026):
        keys = ((year - 1, 12), (year, 1), (year, 2))
        if not all(k in monthly for k in keys):
            continue
        vals = [monthly[k] for k in keys]
        if equal:
            value = sum(vals) / 3
        else:
            days = (31, 31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,)
            value = sum(v*d for v, d in zip(vals, days)) / sum(days)
        years.append(year)
        values.append(value)
    return years, values

def main():
    outdir = ROOT / "data/reference/giovanni"
    outdir.mkdir(parents=True, exist_ok=True)
    source_by_region = {}
    for rid, name in FILES.items():
        src = SOURCE / name
        target = outdir / name
        if not target.exists():
            shutil.copyfile(src, target)
        source_by_region[rid] = target

    # Written documentation states exact, fixed criteria before results print.
    report = ["# Giovanni rainfall check", "", "Pass rule (fixed before comparison): mean bias and MAE each <= 0.5% of Giovanni mean; maximum annual absolute difference <= max(1% of Giovanni mean, 0.05 mm/day); absolute Sen slope difference <= max(2% of Giovanni slope magnitude, 0.005 mm/day/decade). Sen slope is from backend.trend.stats.sen_slope.", "", "Giovanni product monthly area means are day-weighted at the product stage. The equal-month result is a sensitivity check. Live regional series use build_series and the live native NetCDF inputs.", "", "Lead independently verified the January 1984 regional means against Giovanni to 7 digits: Peru 2.668615 mm/day and Indonesia 10.565206 mm/day.", "", "| Region | Giovanni monthly means | Method | Mean bias | MAE | Max abs diff | Giovanni slope | Box slope | Slope diff | Result |", "|---|---|---|---:|---:|---:|---:|---:|---:|---|"]
    all_pass = True
    for rid, path in source_by_region.items():
        bbox, monthly = read_giovanni(path)
        bound = BOXES[rid]
        expected_data_bbox = (bound[0] + .25, bound[1] + .25, bound[2] - .25, bound[3] - .25)
        if any(abs(a-b) > 1e-9 for a,b in zip(bbox, expected_data_bbox)):
            raise ValueError(f"{rid}: Giovanni Data Bounding Box {bbox} differs from center-cell edges {expected_data_bbox}")
        years, native_daily = djf(monthly)
        _, native_equal = djf(monthly, equal=True)
        live = build_series(list(bound), 1984, 2025)
        live_equal = build_series(list(bound), 1984, 2025, equal_month=True)
        if live["years"] != years:
            raise ValueError(f"{rid}: live series year labels differ")
        # Center-mask diagnostics are compared to expected native-grid edges.
        _, lat, lon, _ = read_month(1983, 12)
        frac, _ = box_mask(lat, lon, bound)
        count = int(frac.sum())
        expected = 92 * 34 if rid == "indonesia" else 12 * 14
        if count != expected:
            raise ValueError(f"{rid}: box mask selects {count}, expected {expected} center cells")
        for method, ref, comparison in (("day-weighted", native_daily, live), ("equal-month", native_equal, live_equal)):
            vals = comparison["values"]
            pairs = [(a, b) for a,b in zip(ref, vals) if a is not None and b is not None]
            diffs = [b-a for a,b in pairs]
            mean = sum(ref) / len(ref)
            bias = sum(diffs) / len(diffs)
            mae = sum(abs(d) for d in diffs) / len(diffs)
            maxdiff = max(abs(d) for d in diffs)
            gslope = sen_slope(years, ref)[0] * 10
            bslope = sen_slope(years, vals)[0] * 10
            limits = (0.005*mean, 0.005*mean, max(0.01*mean, 0.05), max(0.02*abs(gslope), 0.005))
            checks = (abs(bias) <= limits[0], mae <= limits[1], maxdiff <= limits[2], abs(bslope-gslope) <= limits[3])
            passed = all(checks)
            all_pass &= passed
            result = "PASS" if passed else "FAIL"
            report.append(f"| {rid} | {len(monthly)} months | {method} | {bias:.3e} (<= {limits[0]:.3e}: {checks[0]}) | {mae:.3e} (<= {limits[1]:.3e}: {checks[1]}) | {maxdiff:.3e} (<= {limits[2]:.3e}: {checks[2]}) | {gslope:.6f} | {bslope:.6f} | {abs(bslope-gslope):.3e} (<= {limits[3]:.3e}: {checks[3]}) | {result} |")
            print(f"{rid} {method}: bias={bias:.3e}, MAE={mae:.3e}, max={maxdiff:.3e}, slopes={gslope:.6f}/{bslope:.6f}, slope_diff={abs(bslope-gslope):.3e}, limits={[f'{limit:.3e}' for limit in limits]}, checks={checks}: {result}")
        report += ["", f"{rid} mask diagnostic: {count} center-selected 0.5 degree cells; bounds {bbox}. Monthly values and both DJF variants are derived from the copied CSV. The day-weighted method is the product-matched comparison.", ""]
    report += ["Failure investigation: no mismatched criteria trigger a setting change. If a check fails, investigate one item at a time in this order: monthly values, DJF year label, then mask/weights. Each step must be recorded here before any change.", "", f"Artifact validation update: {'both regions passed' if all_pass else 'at least one comparison failed; leave both pending'}."]
    (ROOT / "docs/GIOVANNI_CHECK.md").write_text("\n".join(report), encoding="utf-8")
    if all_pass:
        import subprocess
        subprocess.run([sys.executable, str(ROOT / "scripts/build_artifacts.py"), "--giovanni-passed"], check=True)
    print("\n".join(report))

if __name__ == "__main__":
    main()
