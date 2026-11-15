#!/usr/bin/env python3
"""Build ENSO history, global SST timelapse, and ENSO impact composites."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.enso_history.history import build_history_payload  # noqa: E402

REF_HISTORY_DIR = ROOT / "data" / "reference" / "enso" / "history"
OUT_DIR = ROOT / "data" / "artifacts" / "enso_history"


def atomic_write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".tmp_", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp_name, path)
    except Exception:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def build_history() -> Path:
    payload = build_history_payload(REF_HISTORY_DIR)
    target = OUT_DIR / "history.json"
    atomic_write_json(target, payload)
    print(
        f"[enso_history] wrote {target.relative_to(ROOT)}: "
        f"{len(payload['seasons'])} seasons, {len(payload['episodes'])} RONI episodes, "
        f"current={payload['current']['latest_season']} ({payload['current']['anom_c']:+.2f} °C)"
    )
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--step",
        choices=("history", "sst", "sst-climatology", "impacts", "all"),
        default="all",
    )
    args = parser.parse_args()
    if args.step in ("history", "all"):
        build_history()
    if args.step in ("sst", "all"):
        from backend.enso_history.sst import build_sst_global
        build_sst_global(OUT_DIR)
    if args.step in ("sst-climatology", "all"):
        from backend.enso_history.sst import build_sst_climatology
        build_sst_climatology(OUT_DIR)
    if args.step in ("impacts", "all"):
        from backend.enso_history.impacts import build_impacts
        build_impacts(OUT_DIR)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
