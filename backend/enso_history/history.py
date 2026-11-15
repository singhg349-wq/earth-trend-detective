"""ENSO phase classification, 5-season episode detection, and history.json builder."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple

from backend.enso_history.parsers import (
    parse_oni_ascii,
    parse_roni_ascii,
    sha256_file,
    ym_to_index,
)


def classify_phase(value_c: float, threshold: float = 0.5) -> str:
    """Classify a 3-month ENSO index value (deg C) as la_nina, neutral, or el_nino."""
    if not math.isfinite(value_c):
        raise ValueError(f"Cannot classify non-finite index value: {value_c!r}")
    if value_c <= -threshold:
        return "la_nina"
    if value_c >= threshold:
        return "el_nino"
    return "neutral"


def classify_strength(peak_anom_c: float) -> str:
    """Classify episode strength by |peak_anom_c|: weak, moderate, strong, very strong."""
    mag = round(abs(float(peak_anom_c)), 2)
    if mag >= 2.0:
        return "very strong"
    if mag >= 1.5:
        return "strong"
    if mag >= 1.0:
        return "moderate"
    return "weak"


def detect_episodes(
    seasonal_series: Dict[Tuple[int, int], Dict[str, Any]],
    threshold: float = 0.5,
    min_seasons: int = 5,
) -> List[Dict[str, Any]]:
    """Identify contiguous >= min_seasons episodes at or beyond +/- threshold deg C.

    Breaks a run if there is a calendar gap between consecutive seasonal centers.
    """
    keys = sorted(seasonal_series.keys())
    episodes: List[Dict[str, Any]] = []
    current_phase: str = "neutral"
    current_run: List[Dict[str, Any]] = []
    prev_idx: int | None = None

    def flush(phase: str, run: List[Dict[str, Any]]) -> None:
        if phase == "neutral" or len(run) < min_seasons:
            return
        if phase == "el_nino":
            peak_item = max(run, key=lambda x: float(x["anom_c"]))
        else:
            peak_item = min(run, key=lambda x: float(x["anom_c"]))
        peak_val = round(float(peak_item["anom_c"]), 2)
        episodes.append(
            {
                "phase": phase,
                "start_season": f"{run[0]['season']} {run[0]['center_year']}",
                "end_season": f"{run[-1]['season']} {run[-1]['center_year']}",
                "start_center_ym": run[0]["center_ym"],
                "end_center_ym": run[-1]["center_ym"],
                "peak_anom_c": peak_val,
                "peak_center_ym": peak_item["center_ym"],
                "n_overlapping_seasons": len(run),
                "strength": classify_strength(peak_val),
            }
        )

    for y, m in keys:
        item = seasonal_series[(y, m)]
        idx = ym_to_index(y, m)
        phase = classify_phase(float(item["anom_c"]), threshold=threshold)
        contiguous = prev_idx is None or idx == prev_idx + 1
        if phase == current_phase and contiguous:
            current_run.append(item)
        else:
            flush(current_phase, current_run)
            current_phase = phase
            current_run = [item]
        prev_idx = idx
    flush(current_phase, current_run)
    return episodes


def verify_reference_manifest(history_dir: Path) -> Dict[str, Any]:
    """Verify SHA-256 checksums of reference files in data/reference/enso/history/."""
    manifest_path = history_dir / "MANIFEST.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing MANIFEST.json in {history_dir}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError(f"MANIFEST.json in {history_dir} has no files list")
    for entry in files:
        fname = entry.get("filename")
        expected = str(entry.get("sha256", "")).lower()
        fpath = history_dir / fname
        if not fpath.is_file():
            raise FileNotFoundError(f"Missing reference file: {fpath}")
        actual = sha256_file(fpath).lower()
        if actual != expected:
            raise ValueError(
                f"SHA-256 mismatch for {fname}: expected {expected}, got {actual}"
            )
    return manifest


def build_history_payload(history_dir: Path) -> Dict[str, Any]:
    """Build the history.json contract dictionary from verified RONI and ONI tables."""
    verify_reference_manifest(history_dir)
    roni = parse_roni_ascii(history_dir / "RONI.ascii.txt")
    oni = parse_oni_ascii(history_dir / "oni.ascii.txt")

    roni_keys = sorted(roni.keys())
    seasons = []
    for k in roni_keys:
        item = roni[k]
        anom = round(float(item["anom_c"]), 2)
        seasons.append(
            {
                "season": item["season"],
                "year": item["center_year"],
                "center_ym": item["center_ym"],
                "anom_c": anom,
                "phase": classify_phase(anom, threshold=0.5),
            }
        )

    episodes = detect_episodes(roni, threshold=0.5, min_seasons=5)
    oni_episodes = detect_episodes(oni, threshold=0.5, min_seasons=5)

    latest_key = roni_keys[-1]
    latest = roni[latest_key]
    latest_anom = round(float(latest["anom_c"]), 2)

    return {
        "index": {
            "name": "RONI",
            "long_name": "Relative Oceanic Niño Index",
            "source": "NOAA CPC",
            "url": "https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt",
            "threshold_c": 0.5,
            "episode_rule": "at least 5 consecutive overlapping 3-month seasons at or beyond ±0.5 °C",
            "strength_rule": "by |peak_anom_c|: weak 0.5–0.9, moderate 1.0–1.4, strong 1.5–1.9, very strong ≥ 2.0",
        },
        "seasons": seasons,
        "episodes": episodes,
        "current": {
            "latest_season": f"{latest['season']} {latest['center_year']}",
            "center_ym": latest["center_ym"],
            "anom_c": latest_anom,
            "phase": classify_phase(latest_anom, threshold=0.5),
        },
        "also_traditional_oni": {
            "episodes_count": len(oni_episodes),
            "note": "RONI is NOAA's operational index since 2026; ONI shown for reference",
        },
    }
