import json
from pathlib import Path

ARTIFACTS = Path(__file__).resolve().parents[1] / "data" / "artifacts"


def test_precipitation_djf_timelapse_index_and_size():
    folder = ARTIFACTS / "timelapse" / "precip_DJF"
    index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
    frames = sorted(folder.glob("*.png"))
    assert len(frames) == len(index["years"]) == 42
    assert all(key in index for key in ("units", "vmin", "vmax", "colormap", "extent", "source"))
    assert index["extent"] == [-180, -90, 180, 90]
    assert sum(frame.stat().st_size for frame in frames) < 15_000_000


def test_all_precipitation_season_timelapses_have_index_files():
    for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
        folder = ARTIFACTS / "timelapse" / f"precip_{season}"
        index = json.loads((folder / "index.json").read_text(encoding="utf-8"))
        assert len(list(folder.glob("*.png"))) == len(index["years"])
