from pathlib import Path

from PIL import Image


def test_precip_trend_maps_are_georeferenced_pngs_under_size_budget():
    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "precip"
    for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
        for suffix in ("", "_fdr"):
            stem = f"trend_{season}{suffix}"
            png = root / f"{stem}.png"
            with Image.open(png) as image:
                assert image.format == "PNG"
                assert image.size == (360, 180)
                if suffix:
                    assert image.mode == "RGBA"
                    assert image.getchannel("A").getextrema()[0] == 0
            assert png.stat().st_size < 300_000
            assert (root / f"{stem}.pgw").exists()
            assert (root / f"{stem}.prj").exists()
