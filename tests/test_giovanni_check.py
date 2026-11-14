from scripts.check_giovanni import djf, read_giovanni


def test_giovanni_csv_and_djf_january_label():
    from pathlib import Path
    path = Path("data/reference/giovanni/g4.areaAvgTimeSeries.GPCPMON_3_3_sat_gauge_precip.19831201-20250228.95E_11S_141E_6N.csv")
    if not path.exists():
        return
    bounds, monthly = read_giovanni(path)
    assert bounds == (95.25, -10.75, 140.75, 5.75)
    years, values = djf(monthly)
    assert years == list(range(1984, 2026))
    assert len(values) == 42
    assert monthly[(1983, 12)] != -99999


def test_day_weighted_and_equal_month_differ_on_leap_february():
    monthly = {(2023, 12): 1., (2024, 1): 2., (2024, 2): 4.}
    years, weighted = djf(monthly)
    _, equal = djf(monthly, equal=True)
    assert years == [2024]
    assert weighted[0] == (31 + 62 + 116) / 91
    assert equal[0] == 7 / 3
