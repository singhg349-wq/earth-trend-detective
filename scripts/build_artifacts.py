"""Build the featured regional rainfall artifacts and validation report."""
import json
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.trend.io import read_month
from backend.trend.regions import BOXES, REGIONS, build_regions, box_mask
from backend.trend.seasons import aggregate_djf, area_mean


def automatic_check(payload):
    """Return whether a regional artifact is safe to list after local checks."""
    import math

    values = payload.get("values", [])
    coverage = payload.get("coverage", [])
    return (
        payload.get("units") == "mm/day"
        and len(payload.get("years", [])) == 42
        and len(values) == len(coverage) == 42
        and all(isinstance(v, (int, float)) and math.isfinite(v) for v in values)
        and all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in coverage)
        and payload.get("region", {}).get("cells_used", 0) > 0
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--giovanni-passed", action="store_true", help="mark Indonesia and Peru validation passed after the external comparison succeeds")
    args = parser.parse_args()
    first, lat, lon, _ = read_month(1983, 12)
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))
    monthly = {(1983, 12): first}
    for year in range(1984, 2026):
        for month in (1, 2, 12):
            monthly[(year, month)] = read_month(year, month)[0]
        if year % 6 == 0:
            print(f"Read DJF inputs through {year}", flush=True)
    seasons = aggregate_djf(monthly, range(1984, 2026))
    for rid, reg in regions.items():
        reg["equal"], reg["coverage"] = area_mean(seasons["equal"], reg["area_weights"])
        reg["day_weighted"], _ = area_mean(seasons["day_weighted"], reg["area_weights"])
        # Giovanni includes cells by centre point; use the same mask locally.
        bf, bw = box_mask(lat, lon, BOXES[rid])
        reg["box_equal"], _ = area_mean(seasons["equal"], bf * bw)
        reg["box_day_weighted"], _ = area_mean(seasons["day_weighted"], bf * bw)

    from shapely.geometry import mapping
    features = [{"type": "Feature", "properties": {"id": rid}, "geometry": mapping(reg["geometry"].simplify(.05, preserve_topology=True))} for rid, reg in regions.items()]
    out = ROOT / "data" / "artifacts"
    out.mkdir(parents=True, exist_ok=True)
    stale = out / "precip_coastal_peru_DJF.json"
    if stale.exists():
        stale.unlink()
    (out / "regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    specs = {r["id"]: (f"precip_{r['id']}_DJF", r["label"], list(r["bbox"])) for r in REGIONS}
    artifact_index = []
    for rid, (aid, label, bbox) in specs.items():
        reg = regions[rid]
        vals = reg["day_weighted"]
        from backend.trend.stats import trend_block
        payload = {
            "id": aid, "variable": "precipitation", "units": "mm/day",
            "source": {"product": "GPCPMON", "version": "3.3", "var": "sat_gauge_precip", "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA304"},
            "region": {"id": rid, "label": label, "geometry": "Natural Earth Admin 0 polygon" if rid == "indonesia" else ("Natural Earth Peru polygon clipped to box" if rid == "coastal_peru" else "BBOX"), "bbox": bbox, "cells_used": reg["cells_used"], "area_km2": round(reg["area_km2"], 2)},
            "season": {"code": "DJF", "year_label": "January year", "months": [12, 1, 2], "aggregation": "day-weighted mean of 3 monthly rates"},
            "years": list(range(1984, 2026)), "values": [round(float(v), 6) for v in vals],
            "coverage": [round(float(v), 6) for v in reg["coverage"]], "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": f"{label} DJF precipitation for 1984-2025 has a mean of {float(vals.mean()):.3f} mm/day across 42 seasons.",
            "trend": trend_block(list(range(1984, 2026)), vals.tolist()),
            "validation": {"reference": "Giovanni GPCPMON 3.3 box request", "status": ("passed" if args.giovanni_passed else "pending") if rid in ("indonesia", "coastal_peru") else "unchecked-same-method", "notes": ("Giovanni check passed; see docs/GIOVANNI_CHECK.md." if args.giovanni_passed else "Giovanni comparison pending.") if rid in ("indonesia", "coastal_peru") else "Automatic checks only; not individually checked."},
            "generated": datetime.now(timezone.utc).isoformat(), "code_version": "w1-data",
        }
        filename = "precip_peru_DJF.json" if rid == "coastal_peru" else f"{aid}.json"
        if rid not in ("indonesia", "coastal_peru") and not automatic_check(payload):
            continue
        (out / filename).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        artifact_index.append({"id": aid, "label": label, "variable": "precipitation", "season": "DJF", "region_id": rid, "validation_status": payload["validation"]["status"], "file": filename})
    (out / "index.json").write_text(json.dumps({"artifacts": artifact_index}, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Data validation notes", "", "## Giovanni request", "",
        "Product: GPCP Monthly 0.5 Degree (GPCPMON), version 3.3; variable: sat_gauge_precip (mm/day).",
        "Time range: December 1983 through February 2025; season: DJF, labelled by January year, years 1984-2025.",
        "Request Giovanni monthly area-averaged time series and download the CSV from the results/download panel. Product: GPCPMON 3.3; variable: sat_gauge_precip (mm/day); time range: December 1983 through February 2025. Giovanni selects cells by whether their centres fall inside the requested box.",
        "The product series is the day-weighted mean of monthly rates. Equal-month is retained as a second comparison.", "", "## Giovanni box settings", "", "Coordinates are west, south, east, north in degrees. Use the native 0.5 degree grid and include cell centres inside each box. Local DJF comparison: day-weighted and equal-month series, each with 42 values labelled 1984–2025.", "", "| Region | Product | Variable | W, S, E, N | Time range | Comparison series |", "|---|---|---|---|---|---|",
        "| Indonesia | GPCPMON 3.3 | sat_gauge_precip (mm/day) | 95.25, -10.75, 140.75, 5.75 | Dec 1983–Feb 2025 | Box mask; day-weighted and equal-month, 42 values each |",
        "| Coastal Peru | GPCPMON 3.3 | sat_gauge_precip (mm/day) | -81.75, -9.75, -76.25, -3.25 | Dec 1983–Feb 2025 | Box mask; day-weighted and equal-month, 42 values each |",
        *[f"| {r['label']} | GPCPMON 3.3 | sat_gauge_precip (mm/day) | {', '.join(map(str, r['bbox']))} | Dec 1983–Feb 2025 | Box mask; day-weighted and equal-month, 42 values each |" for r in REGIONS[2:]],
        "", "## Pass rule (set before comparison)", "",
        "Compare each region's box-mask series with Giovanni's monthly area-averaged series for the same box. First compute Giovanni's monthly values, then apply the same DJF formula. Pass only if mean bias and mean absolute error are each at most 0.5% of the Giovanni series mean, maximum single-year absolute difference is at most max(1% of that mean, 0.05 mm/day), and Sen slopes differ by at most max(2% of Giovanni slope magnitude, 0.005 mm/day/decade).",
        "", "The Giovanni CSV check is recorded in docs/GIOVANNI_CHECK.md. Indonesia and Coastal Peru are validated only when it passes (validation.status passed). The other regions are listed as unchecked-same-method after automatic checks only; that status does not claim individual validation.",
        "", "## Mask diagnostics and box series", "",
        "Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid).",
        "", "Mask rule: box regions select complete grid cells when the cell centre is inside the region bounds. The native 0.5-degree cell centre is its latitude/longitude coordinate; the 1-degree grid uses centres at the southwest corner plus 0.5 degrees, with tiles partitioning cells by their integer southwest corners. Box-cell weights are full spherical cell areas. Indonesia and coastal Peru polygon masks use fractional geographic intersection; their box comparison series use centre-selected whole cells.",
        "", "Featured-region values use the native 0.5 degree grid with no regridding. Only the click-any-spot global grid uses 1 degree. The box-mask series select native cell centres inside each box. Compare with Giovanni by taking its monthly area-averaged values first, then applying DJF: day-weighted first (product series), equal-month second (sensitivity)."
    ]
    for rid, (_, label, _) in specs.items():
        reg = regions[rid]
        lines += ["", f"### {label}", "", f"Polygon mask: {reg['cells_used']} cells; area {reg['area_km2']:.2f} km².", f"Box versus polygon max absolute difference, equal-month: {max(abs(reg['box_equal'] - reg['equal'])):.6f} mm/day."]
        lines += ["", "Box mask comparison series by January year (mm/day):", "", "| Year | Day-weighted | Equal-month |", "|---:|---:|---:|"]
        lines += [f"| {year} | {day:.6f} | {equal:.6f} |" for year, day, equal in zip(seasons["years"], reg["box_day_weighted"], reg["box_equal"])]
    (ROOT / "docs" / "VALIDATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
