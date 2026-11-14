"""Local convenience API for the regional series.

The public app is a static build and does not depend on this server.
Run it with: python -m uvicorn backend.main:app --port 8000
"""

import json
import re
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BASE_DIR / "data" / "artifacts"
FIXTURES_DIR = BASE_DIR / "data" / "fixtures"

SERIES_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
SKIP_FILES = {"index.json", "regions.json"}

app = FastAPI(title="Earth System Trend Detective", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _summary(doc: Dict[str, Any], fixture: bool) -> Dict[str, Any]:
    region = doc.get("region") or {}
    season = doc.get("season") or {}
    source = doc.get("source") or {}
    validation = doc.get("validation") or {}
    trend = doc.get("trend") or {}
    inference = trend.get("inference") or {}
    region_label = region.get("label") or region.get("id") or "Unknown region"
    season_code = season.get("code") or ""
    variable = doc.get("variable") or "series"
    return {
        "id": doc.get("id"),
        "label": f"{region_label}: {season_code} {variable}".strip(),
        "variable": variable,
        "units": doc.get("units") or "",
        "region_id": region.get("id") or "",
        "region_label": region_label,
        "season": season_code,
        "validation_status": validation.get("status") or "unknown",
        "inference_status": inference.get("status") or "unknown",
        "fixture": bool(fixture),
        "source": {
            "product": source.get("product") or "",
            "version": source.get("version") or "",
        },
    }


def _scan(directory: Path, fixture: bool) -> Dict[str, Dict[str, Any]]:
    found: Dict[str, Dict[str, Any]] = {}
    if not directory.is_dir():
        return found
    for path in sorted(directory.glob("*.json")):
        if path.name in SKIP_FILES:
            continue
        try:
            doc = _read_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(doc, dict):
            continue
        if not isinstance(doc.get("years"), list) or not isinstance(doc.get("region"), dict):
            continue
        series_id = doc.get("id") or path.stem
        found[series_id] = _summary(doc, fixture)
    return found


def _index_overrides() -> Dict[str, Dict[str, Any]]:
    """Read an optional data/artifacts/index.json entry list.

    The builder writes an ``artifacts`` list; older hand-written files may use
    ``series``. When either list is present, only those ids are listed.
    """
    path = ARTIFACTS_DIR / "index.json"
    if not path.is_file():
        return {}
    try:
        doc = _read_json(path)
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(doc, dict):
        return {}
    items = doc.get("artifacts")
    if not isinstance(items, list):
        items = doc.get("series")
    if not isinstance(items, list):
        return {}
    allowed = {
        "label",
        "variable",
        "units",
        "region_id",
        "region_label",
        "season",
        "inference_status",
        "fixture",
    }
    overrides: Dict[str, Dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        overrides[item["id"]] = {key: item[key] for key in allowed if key in item}
    return overrides


def _series_entries() -> List[Dict[str, Any]]:
    # Fixtures first, artifacts second so real results replace placeholders.
    entries = _scan(FIXTURES_DIR, fixture=True)
    artifacts = _scan(ARTIFACTS_DIR, fixture=False)
    overrides = _index_overrides()
    # When the real index carries entries, an artifact missing from it is not
    # listed. An empty or missing index keeps the folder scan for early builds.
    if overrides:
        artifacts = {
            series_id: entry
            for series_id, entry in artifacts.items()
            if series_id in overrides
        }
        for series_id, fields in overrides.items():
            if series_id in artifacts:
                artifacts[series_id].update(fields)
    entries.update(artifacts)
    return sorted(
        entries.values(),
        key=lambda entry: (
            str(entry["region_label"]).casefold(),
            str(entry["season"]),
            str(entry["variable"]),
        ),
    )


def _series_path(directory: Path, series_id: str) -> Path:
    if not SERIES_ID.fullmatch(series_id):
        raise HTTPException(status_code=400, detail="Invalid series id")
    root = directory.resolve()
    path = (root / f"{series_id}.json").resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid series id") from exc
    return path


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "earth-trend-detective",
        "series": len(_series_entries()),
    }


@app.get("/api/series")
def list_series() -> Dict[str, Any]:
    entries = _series_entries()
    return {"count": len(entries), "series": entries}


@app.get("/api/series/{series_id}")
def get_series(series_id: str) -> Dict[str, Any]:
    artifact = _series_path(ARTIFACTS_DIR, series_id)
    if artifact.is_file():
        return _read_json(artifact)

    fixture = _series_path(FIXTURES_DIR, series_id)
    if fixture.is_file():
        return _read_json(fixture)

    raise HTTPException(status_code=404, detail=f"Series '{series_id}' not found")
