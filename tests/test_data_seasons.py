import numpy as np
from backend.trend.seasons import aggregate_djf

def test_leap_february_day_weighting():
    result=aggregate_djf({(1999,12):np.array([[0.]]),(2000,1):np.array([[10.]]),(2000,2):np.array([[20.]])},[2000])
    assert result["equal"][0,0,0] == 10
    assert result["day_weighted"][0,0,0] == (31*0+31*10+29*20)/91

def test_incomplete_djf_is_excluded():
    result=aggregate_djf({(1999,12):np.ones((1,1)),(2000,1):np.ones((1,1)),(2000,12):np.ones((1,1)),(2001,1):np.ones((1,1)),(2001,2):np.ones((1,1))},[2000,2001])
    assert result["years"] == [2001]
