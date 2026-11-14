import pytest
from backend.trend.io import read_month

def test_monthly_units_are_mm_per_day():
    try:
        _,_,_,units=read_month(1983,1)
    except FileNotFoundError:
        pytest.skip("Local GPCP collection is not available")
    assert units.lower().replace(" ", "") in {"mm/day","mmday-1","mmday**-1","mmday^-1"}
