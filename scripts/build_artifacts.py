"""Build the two compact, contract-shaped result artifacts."""
import json, sys
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.trend.io import read_month
from backend.trend.regions import BOXES, REGIONS, build_regions, box_mask
from backend.trend.seasons import aggregate_djf, area_mean

def main():
    first, lat, lon, _ = read_month(1983, 12)
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))
    monthly = {(1983,12): first}
    for year in range(1984, 2026):
        for month in (1, 2, 12):
            monthly[(year,month)] = read_month(year,month)[0]
        if year % 6 == 0:
            print(f"Read DJF inputs through {year}", flush=True)
    seasons = aggregate_djf(monthly, range(1984,2026))
    for rid, reg in regions.items():
        reg["equal"], reg["coverage"] = area_mean(seasons["equal"], reg["area_weights"])
        reg["day_weighted"], _ = area_mean(seasons["day_weighted"], reg["area_weights"])
        bf, bw = box_mask(lat, lon, BOXES[rid])
        reg["box_equal"], _ = area_mean(seasons["equal"], bf*bw)
        reg["box_day_weighted"], _ = area_mean(seasons["day_weighted"], bf*bw)
    features = [{"type":"Feature", "properties":{"id":rid}, "geometry":__import__("shapely.geometry", fromlist=["mapping"]).mapping(reg["geometry"].simplify(.05, preserve_topology=True))} for rid,reg in regions.items()]
    out = ROOT/"data"/"artifacts"; out.mkdir(parents=True, exist_ok=True)
    stale = out/"precip_coastal_peru_DJF.json"
    if stale.exists(): stale.unlink()
    (out/"regions.geojson").write_text(json.dumps({"type":"FeatureCollection","features":features},separators=(",",":")),encoding="utf-8")
    specs = {r["id"]: (f"precip_{r['id']}_DJF", r["label"], list(r["bbox"])) for r in REGIONS}
    artifact_index = []
    for rid,(aid,label,bbox) in specs.items():
        reg=regions[rid]; vals=reg["equal"]
        try:
            from backend.trend.stats import sen_slope
            slope=sen_slope(list(range(1984,2026)), vals.tolist())
        except Exception:
            slope=None
        payload={"id":aid,"variable":"precipitation","units":"mm/day","source":{"product":"GPCPMON","version":"3.3","var":"sat_gauge_precip","doi_or_url":"https://doi.org/10.5067/MEASURES/GPCP/DATA304"},
          "region":{"id":rid,"label":label,"geometry":"Natural Earth Admin 0 polygon" if rid=="indonesia" else ("Natural Earth Peru polygon clipped to box" if rid=="coastal_peru" else "BBOX"),"bbox":bbox,"cells_used":reg["cells_used"],"area_km2":round(reg["area_km2"],2)},
          "season":{"code":"DJF","year_label":"January year","months":[12,1,2],"aggregation":"mean of 3 monthly rates"},"years":list(range(1984,2026)),
          "values":[round(float(v),6) for v in vals],"coverage":[round(float(v),6) for v in reg["coverage"]],"anomaly_baseline":None,"geometry_file":"data/artifacts/regions.geojson",
          "template_summary":f"{label} DJF precipitation for 1984–2025 has a mean of {float(vals.mean()):.3f} mm/day across 42 seasons.",
          "trend":{"sen_slope_per_decade":slope,"intercept":None,"method":"Sen","inference":{"status":"unavailable","p_value":None,"ci":None,"method":None}},
          "validation":{"reference":"Giovanni GPCPMON 3.3 box request","status":"pending","notes":"Giovanni comparison pending; this preset is not individually checked." if rid not in ("indonesia", "coastal_peru") else "Giovanni comparison pending; inference unavailable."},"generated":datetime.now(timezone.utc).isoformat(),"code_version":"w1-data"}
        filename = "precip_peru_DJF.json" if rid == "coastal_peru" else f"{aid}.json"
        (out/filename).write_text(json.dumps(payload,indent=2)+"\n",encoding="utf-8")
        artifact_index.append({"id":aid,"label":label,"variable":"precipitation","season":"DJF","region_id":rid})
    (out/"index.json").write_text(json.dumps({"artifacts":artifact_index},indent=2)+"\n",encoding="utf-8")
    lines=["# Data validation notes","","## Giovanni request","","Product: GPCP Monthly 0.5 Degree (GPCPMON), version 3.3; variable: sat_gauge_precip (mm/day).","Time range: December 1983 through February 2025; season: DJF, labelled by January year, years 1984-2025.","Request Giovanni area in west, south, east, north order: Indonesia 95E, 11S, 141E, 6N; Peru 82W, 10S, 76W, 3S. Select time series and download the result CSV from the results/download panel.","Expected match: equal-month mean of three monthly rates. Day-weighted series is included for sensitivity.","","## Pass rule","","Before comparison: maximum absolute difference for any season must be < 2% of the series mean, using the box mask and identical aggregation.","","The current regional artifacts remain marked pending until the Giovanni CSVs are compared. Indonesia and coastal Peru are the only presets in the first Giovanni validation round.","","## Featured preset proposals","","Indonesia and coastal Peru are the first two presets. The following eight use the stated bounding boxes and are not individually checked: Amazon, Sahel, East Africa, India, Australia, California, Alberta / Prairies, and Southern Africa. Their artifacts carry a pending validation status and must be presented as same method, not individually checked.","","## Mask diagnostics and box series","","Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid)."]
    for rid,(_,label,_) in specs.items():
        reg=regions[rid]
        lines += ["",f"### {label}","",f"Polygon mask: {reg['cells_used']} cells; area {reg['area_km2']:.2f} km².",f"Box versus polygon max absolute difference, equal-month: {max(abs(reg['box_equal']-reg['equal'])):.6f} mm/day.","", "Box mask equal-month values (1984-2025):", "", ", ".join(f"{v:.6f}" for v in reg["box_equal"]),"","Box mask day-weighted values (1984-2025):","",", ".join(f"{v:.6f}" for v in reg["box_day_weighted"])]
    (ROOT/"docs"/"VALIDATION.md").write_text("\n".join(lines)+"\n",encoding="utf-8")

if __name__ == "__main__": main()
