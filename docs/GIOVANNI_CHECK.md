# Giovanni rainfall check

Pass rule (fixed before comparison): mean bias and MAE each <= 0.5% of Giovanni mean; maximum annual absolute difference <= max(1% of Giovanni mean, 0.05 mm/day); absolute Sen slope difference <= max(2% of Giovanni slope magnitude, 0.005 mm/day/decade). Sen slope is from backend.trend.stats.sen_slope.

Giovanni product monthly area means are day-weighted at the product stage. The equal-month result is a sensitivity check. Live regional series use build_series and the live native NetCDF inputs.

Lead independently verified the January 1984 regional means against Giovanni to 7 digits: Peru 2.668615 mm/day and Indonesia 10.565206 mm/day.

| Region | Giovanni monthly means | Method | Mean bias | MAE | Max abs diff | Giovanni slope | Box slope | Slope diff | Result |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| indonesia | 495 months | day-weighted | -4.784e-09 (<= 4.422e-02: True) | 1.158e-07 (<= 4.422e-02: True) | 3.019e-07 (<= 8.844e-02: True) | 0.196730 | 0.196730 | 6.286e-08 (<= 5.000e-03: True) | PASS |
| indonesia | 495 months | equal-month | -4.639e-09 (<= 4.414e-02: True) | 1.145e-07 (<= 4.414e-02: True) | 2.956e-07 (<= 8.829e-02: True) | 0.190442 | 0.190442 | 3.963e-09 (<= 5.000e-03: True) | PASS |

indonesia mask diagnostic: 3128 center-selected 0.5 degree cells; bounds (95.25, -10.75, 140.75, 5.75). Monthly values and both DJF variants are derived from the copied CSV. The day-weighted method is the product-matched comparison.

| coastal_peru | 495 months | day-weighted | -9.235e-09 (<= 1.670e-02: True) | 3.845e-08 (<= 1.670e-02: True) | 1.235e-07 (<= 5.000e-02: True) | -0.039485 | -0.039485 | 1.502e-08 (<= 5.000e-03: True) | PASS |
| coastal_peru | 495 months | equal-month | -9.680e-09 (<= 1.679e-02: True) | 3.940e-08 (<= 1.679e-02: True) | 1.271e-07 (<= 5.000e-02: True) | -0.045628 | -0.045628 | 9.531e-08 (<= 5.000e-03: True) | PASS |

coastal_peru mask diagnostic: 168 center-selected 0.5 degree cells; bounds (-81.75, -9.75, -76.25, -3.25). Monthly values and both DJF variants are derived from the copied CSV. The day-weighted method is the product-matched comparison.

Failure investigation: no mismatched criteria trigger a setting change. If a check fails, investigate one item at a time in this order: monthly values, DJF year label, then mask/weights. Each step must be recorded here before any change.

Artifact validation update: both regions passed.