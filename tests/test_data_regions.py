import numpy as np
from shapely.geometry import box
from backend.trend.regions import fractional_mask

def test_mask_area_positive():
    frac, area = fractional_mask(np.array([-0.5,0.5]),np.array([0.5,1.5]),box(0,0,2,1))
    assert np.sum(frac*area) > 0
