import numpy as np

from backend.trend import series


def test_build_series_returns_contract_shaped_box_result(monkeypatch):
    def fake_read_month(year, month):
        value = {12: 1.0, 1: 2.0, 2: 3.0}[month]
        return np.full((2, 2), value), np.array([-0.5, 0.5]), np.array([0.5, 1.5]), "mm/day"

    monkeypatch.setattr(series, "read_month", fake_read_month)
    result = series.build_series([0, 0, 2, 1], 1984, 1985)
    assert result["region"]["id"] == "custom_box"
    assert result["years"] == [1984, 1985]
    assert result["values"] == [180.0 / 91.0, 177.0 / 90.0]
    assert result["season"]["aggregation"] == "day-weighted mean of 3 monthly rates"
    assert result["validation"]["status"] == "pending"
    assert result["trend"]["inference"]["status"] == "unavailable"
    assert {"source", "season", "coverage", "geometry_file", "template_summary"} <= result.keys()
