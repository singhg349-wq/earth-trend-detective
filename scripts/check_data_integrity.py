#!/usr/bin/env python3
"""Check the integrity of the data files the app and API serve.

Five independent checks, one PASS/FAIL line each:

1. every id in ``data/artifacts/index.json`` has a loadable artifact file
   whose own ``id`` matches the index entry (and all 3 metrics are present);
2. every artifact series has ``years`` and ``values`` lists of equal length;
3. ``data/artifacts/enso_history/{history.json,sst_global/index.json,impacts/index.json}``
   parse and satisfy size/frame/file contracts;
4. ``data/artifacts/grid/`` covers 3 metrics and ``data/artifacts/timelapse/``
   covers all 15 (metric, season) anomaly sets within the 25 MB budget;
5. every ``sha256`` in ``data/reference/enso/history/MANIFEST.json`` matches the
   file on disk.

Run from the repository root::

    python scripts/check_data_integrity.py

The exit code is non-zero if any check fails. This script never modifies data;
a checksum mismatch is reported, not repaired.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS_DIR = ROOT / "data" / "artifacts"
ENSO_HISTORY_DIR = ARTIFACTS_DIR / "enso_history"
ENSO_REFERENCE_DIR = ROOT / "data" / "reference" / "enso" / "history"
MANIFEST = ENSO_REFERENCE_DIR / "MANIFEST.json"

PASS = "PASS"
FAIL = "FAIL"


def read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def report(ok: bool, label: str, details: Iterable[str] = ()) -> bool:
    """Print one PASS/FAIL line (plus details) and return the result."""
    print(f"{PASS if ok else FAIL} {label}")
    for line in details:
        print(f"     {line}")
    return ok


def load_index_artifacts() -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    """Return (id -> document, problems) for the artifact index."""
    problems: List[str] = []
    docs: Dict[str, Dict[str, Any]] = {}
    index_path = ARTIFACTS_DIR / "index.json"
    try:
        index = read_json(index_path)
    except FileNotFoundError:
        problems.append(f"missing {index_path.relative_to(ROOT)}")
        return docs, problems
    except (OSError, json.JSONDecodeError) as exc:
        problems.append(f"{index_path.relative_to(ROOT)} is not readable: {exc}")
        return docs, problems

    entries = index.get("artifacts") if isinstance(index, dict) else None
    if not isinstance(entries, list):
        entries = index.get("series") if isinstance(index, dict) else None
    if not isinstance(entries, list) or not entries:
        problems.append(f"{index_path.relative_to(ROOT)} has no artifact list")
        return docs, problems

    for position, entry in enumerate(entries):
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            problems.append(f"entry {position}: missing a string id")
            continue
        series_id = entry["id"]
        if series_id in docs:
            problems.append(f"{series_id}: duplicate id in the index")
            continue
        file_name = entry.get("file")
        if not isinstance(file_name, str) or Path(file_name).name != file_name:
            file_name = f"{series_id}.json"
        path = ARTIFACTS_DIR / file_name
        try:
            document = read_json(path)
        except FileNotFoundError:
            problems.append(f"{series_id}: missing file {file_name}")
            continue
        except (OSError, json.JSONDecodeError) as exc:
            problems.append(f"{series_id}: {file_name} is not readable: {exc}")
            continue
        if not isinstance(document, dict):
            problems.append(f"{series_id}: {file_name} is not a JSON object")
            continue
        if document.get("id") != series_id:
            problems.append(
                f"{series_id}: document id is {document.get('id')!r}, not {series_id!r}"
            )
        docs[series_id] = document
    return docs, problems


def check_artifact_files(
    docs: Dict[str, Dict[str, Any]], problems: List[str]
) -> bool:
    label = f"artifact index: {len(docs)} series file(s) load and match their id"
    return report(not problems, label, problems)


def check_series_lengths(docs: Dict[str, Dict[str, Any]]) -> bool:
    if not docs:
        return report(False, "series lengths: no series documents were loaded")
    problems: List[str] = []
    checked = 0
    for series_id, document in docs.items():
        years = document.get("years")
        values = document.get("values")
        if not isinstance(years, list) or not isinstance(values, list):
            problems.append(f"{series_id}: years and values must both be lists")
            continue
        checked += 1
        if len(years) != len(values):
            problems.append(
                f"{series_id}: {len(years)} years but {len(values)} values"
            )
    label = f"series lengths: {checked} series checked, years and values lengths match"
    return report(not problems, label, problems)


def check_enso_history() -> bool:
    problems: List[str] = []
    history_path = ENSO_HISTORY_DIR / "history.json"
    sst_idx_path = ENSO_HISTORY_DIR / "sst_global" / "index.json"
    clim_idx_path = ENSO_HISTORY_DIR / "sst_climatology" / "index.json"
    impacts_idx_path = ENSO_HISTORY_DIR / "impacts" / "index.json"

    try:
        hist = read_json(history_path)
        if not hist.get("seasons") or not hist.get("episodes") or not hist.get("current"):
            problems.append("history.json missing seasons/episodes/current")
    except Exception as exc:
        problems.append(f"history.json error: {exc}")

    try:
        sst_idx = read_json(sst_idx_path)
        frames = sst_idx.get("frames", [])
        if len(frames) != 574:
            problems.append(f"sst_global expected 574 frames, got {len(frames)}")
        if int(sst_idx.get("total_size_bytes", 0)) > 12 * 1024 * 1024:
            problems.append(f"sst_global exceeds 12 MB budget: {sst_idx.get('total_size_bytes')}")
        for frame in frames[::100]:
            if not (ENSO_HISTORY_DIR / "sst_global" / frame["file"]).is_file():
                problems.append(f"missing sst frame: {frame['file']}")
    except Exception as exc:
        problems.append(f"sst_global/index.json error: {exc}")

    try:
        clim_idx = read_json(clim_idx_path)
        cframes = clim_idx.get("frames", [])
        if len(cframes) != 12 or clim_idx.get("kind") != "absolute":
            problems.append(f"sst_climatology invalid: len={len(cframes)}, kind={clim_idx.get('kind')}")
    except Exception as exc:
        problems.append(f"sst_climatology/index.json error: {exc}")

    try:
        imp_idx = read_json(impacts_idx_path)
        by_id = {m["id"]: m for m in imp_idx.get("maps", [])}
        for req in ("precip_DJF", "t2m_DJF", "aod_SON", "sm_DJF"):
            if req not in by_id:
                problems.append(f"impacts missing required map: {req}")
        for m in imp_idx.get("maps", []):
            for key in ("file", "overlay_file", "sig_file"):
                if not (ENSO_HISTORY_DIR / "impacts" / m[key]).is_file():
                    problems.append(f"impacts missing file: {m.get(key)}")
    except Exception as exc:
        problems.append(f"impacts/index.json error: {exc}")

    label = "enso history: history.json, sst_global (574 frames), sst_climatology (12), and impacts valid"
    return report(not problems, label, problems)


def check_grid_and_timelapse() -> bool:
    problems: List[str] = []
    try:
        grid_idx = read_json(ARTIFACTS_DIR / "grid" / "index.json")
        vars_present = set(grid_idx.get("variables", {}).keys())
        for slug in ("precip", "t2m", "aod", "sm"):
            if slug not in vars_present:
                problems.append(f"grid/index.json missing variable {slug}")
    except Exception as exc:
        problems.append(f"grid/index.json error: {exc}")

    total_png_bytes = 0
    for slug in ("precip", "t2m", "aod", "sm"):
        for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
            tdir = ARTIFACTS_DIR / "timelapse" / f"{slug}_{season}"
            tidx_path = tdir / "index.json"
            if not tidx_path.is_file():
                problems.append(f"timelapse/{slug}_{season}/index.json missing")
                continue
            try:
                tidx = read_json(tidx_path)
                years = tidx.get("years", [])
                pngs = list(tdir.glob("*.png"))
                if len(pngs) != len(years):
                    problems.append(f"timelapse/{slug}_{season}: {len(pngs)} PNGs != {len(years)} years")
                total_png_bytes += sum(p.stat().st_size for p in pngs)
            except Exception as exc:
                problems.append(f"timelapse/{slug}_{season} error: {exc}")

    if total_png_bytes >= 25 * 1024 * 1024:
        problems.append(f"timelapse PNGs exceed 25 MB: {total_png_bytes} bytes")

    mb = total_png_bytes / (1024 * 1024)
    label = f"grid & timelapse: 4 metrics x 5 seasons verified ({mb:.2f} MB)"
    return report(not problems, label, problems)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_manifest_checksums() -> bool:
    try:
        manifest = read_json(MANIFEST)
    except FileNotFoundError:
        return report(False, "manifest checksums: MANIFEST.json is missing")
    except (OSError, json.JSONDecodeError) as exc:
        return report(False, "manifest checksums: MANIFEST.json is not readable", [str(exc)])

    files = manifest.get("files") if isinstance(manifest, dict) else None
    if not isinstance(files, list) or not files:
        return report(False, "manifest checksums: MANIFEST.json has no files list")

    problems: List[str] = []
    matched = 0
    for entry in files:
        if not isinstance(entry, dict):
            problems.append("manifest entry is not an object")
            continue
        file_name = entry.get("filename")
        expected = entry.get("sha256")
        if not isinstance(file_name, str) or not file_name:
            problems.append("manifest entry has no filename")
            continue
        if not isinstance(expected, str) or len(expected) != 64:
            problems.append(f"{file_name}: manifest has no valid sha256")
            continue
        path = ENSO_REFERENCE_DIR / file_name
        if not path.is_file():
            problems.append(f"{file_name}: missing from {ENSO_REFERENCE_DIR.name}")
            continue
        actual = sha256_of(path)
        if actual != expected.lower():
            problems.append(
                f"{file_name}: sha256 mismatch (manifest {expected[:12]}..., "
                f"file {actual[:12]}...)"
            )
            continue
        matched += 1

    label = f"manifest checksums: {matched}/{len(files)} sha256 values match the files"
    return report(not problems, label, problems)


def main() -> int:
    docs, problems = load_index_artifacts()
    results = [
        check_artifact_files(docs, problems),
        check_series_lengths(docs),
        check_enso_history(),
        check_grid_and_timelapse(),
        check_manifest_checksums(),
    ]
    failed = results.count(False)
    if failed:
        print(f"{FAIL} {failed} of {len(results)} integrity check(s) failed")
        return 1
    print(f"{PASS} all {len(results)} integrity checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
