"""Parsers for NOAA CPC RONI and ONI ASCII reference tables."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, Dict, Tuple

SEASON_TO_CENTER_MONTH: Dict[str, int] = {
    "DJF": 1,
    "JFM": 2,
    "FMA": 3,
    "MAM": 4,
    "AMJ": 5,
    "MJJ": 6,
    "JJA": 7,
    "JAS": 8,
    "ASO": 9,
    "SON": 10,
    "OND": 11,
    "NDJ": 12,
}

CENTER_MONTH_TO_SEASON: Dict[int, str] = {
    v: k for k, v in SEASON_TO_CENTER_MONTH.items()
}


def ym_to_index(year: int, month: int) -> int:
    """Convert (year, month) with month in 1..12 to a contiguous integer month index."""
    if not (1 <= int(month) <= 12):
        raise ValueError(f"Invalid month: {month}")
    return int(year) * 12 + (int(month) - 1)


def index_to_ym(idx: int) -> Tuple[int, int]:
    """Convert integer month index back to (year, month)."""
    year, rem = divmod(int(idx), 12)
    return int(year), int(rem + 1)


def add_months(year: int, month: int, delta: int) -> Tuple[int, int]:
    """Add delta calendar months to (year, month)."""
    return index_to_ym(ym_to_index(year, month) + int(delta))


def format_ym(year: int, month: int) -> str:
    """Format (year, month) as YYYY-MM."""
    return f"{int(year):04d}-{int(month):02d}"


def sha256_file(path: Path) -> str:
    """Return hex SHA-256 digest of a file."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def parse_roni_ascii(path: Path) -> Dict[Tuple[int, int], Dict[str, Any]]:
    """Parse NOAA CPC RONI.ascii.txt (SEAS YR ANOM) keyed by (center_year, center_month)."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    out: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for raw_line in text.splitlines():
        parts = raw_line.split()
        if len(parts) < 3 or parts[0] not in SEASON_TO_CENTER_MONTH:
            continue
        seas = parts[0]
        try:
            year = int(parts[1])
            anom = float(parts[2])
        except ValueError:
            continue
        if anom <= -90.0:
            continue
        c_month = SEASON_TO_CENTER_MONTH[seas]
        s_year, s_month = add_months(year, c_month, -1)
        e_year, e_month = add_months(year, c_month, +1)
        out[(year, c_month)] = {
            "season": seas,
            "center_year": year,
            "center_month": c_month,
            "center_ym": format_ym(year, c_month),
            "start_ym": format_ym(s_year, s_month),
            "end_ym": format_ym(e_year, e_month),
            "anom_c": anom,
        }
    if not out:
        raise ValueError(f"No valid RONI rows parsed from {path}")
    return out


def parse_oni_ascii(path: Path) -> Dict[Tuple[int, int], Dict[str, Any]]:
    """Parse NOAA CPC oni.ascii.txt (SEAS YR TOTAL ANOM) keyed by (center_year, center_month)."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    out: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for raw_line in text.splitlines():
        parts = raw_line.split()
        if len(parts) < 4 or parts[0] not in SEASON_TO_CENTER_MONTH:
            continue
        seas = parts[0]
        try:
            year = int(parts[1])
            total_c = float(parts[2])
            anom_c = float(parts[3])
        except ValueError:
            continue
        if anom_c <= -90.0 or total_c <= -90.0:
            continue
        c_month = SEASON_TO_CENTER_MONTH[seas]
        s_year, s_month = add_months(year, c_month, -1)
        e_year, e_month = add_months(year, c_month, +1)
        out[(year, c_month)] = {
            "season": seas,
            "center_year": year,
            "center_month": c_month,
            "center_ym": format_ym(year, c_month),
            "start_ym": format_ym(s_year, s_month),
            "end_ym": format_ym(e_year, e_month),
            "total_c": total_c,
            "anom_c": anom_c,
        }
    if not out:
        raise ValueError(f"No valid ONI rows parsed from {path}")
    return out
