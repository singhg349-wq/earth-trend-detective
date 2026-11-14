# Giovanni rainfall check

Pass rule (fixed before comparison): mean bias and MAE each <= 0.5% of Giovanni mean; maximum annual absolute difference <= max(1% of Giovanni mean, 0.05 mm/day); absolute Sen slope difference <= max(2% of Giovanni slope magnitude, 0.005 mm/day/decade). Sen slope is from backend.trend.stats.sen_slope.

Giovanni product monthly area means are day-weighted at the product stage. The equal-month result is a sensitivity check. Live regional series use build_series and the live native NetCDF inputs.

| Region | Giovanni monthly means | Method | Mean bias | MAE | Max abs diff | Giovanni slope | Box slope | Slope diff | Result |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| indonesia | 495 months | day-weighted | -0.000000 (<= 0.044222: True) | 0.000000 (<= 0.044222: True) | 0.000000 (<= 0.088443: True) | 0.196730 | 0.196730 | 0.000000 (<= 0.005000: True) | PASS |
| indonesia | 495 months | equal-month | -0.000000 (<= 0.044143: True) | 0.000000 (<= 0.044143: True) | 0.000000 (<= 0.088286: True) | 0.190442 | 0.190442 | 0.000000 (<= 0.005000: True) | PASS |

indonesia mask diagnostic: 3128 center-selected 0.5 degree cells; bounds (95.25, -10.75, 140.75, 5.75). Monthly values and both DJF variants are derived from the copied CSV. The day-weighted method is the product-matched comparison.

| coastal_peru | 495 months | day-weighted | -0.000000 (<= 0.016697: True) | 0.000000 (<= 0.016697: True) | 0.000000 (<= 0.050000: True) | -0.039485 | -0.039485 | 0.000000 (<= 0.005000: True) | PASS |
| coastal_peru | 495 months | equal-month | -0.000000 (<= 0.016790: True) | 0.000000 (<= 0.016790: True) | 0.000000 (<= 0.050000: True) | -0.045628 | -0.045628 | 0.000000 (<= 0.005000: True) | PASS |

coastal_peru mask diagnostic: 168 center-selected 0.5 degree cells; bounds (-81.75, -9.75, -76.25, -3.25). Monthly values and both DJF variants are derived from the copied CSV. The day-weighted method is the product-matched comparison.

Failure investigation: no mismatched criteria trigger a setting change. If a check fails, investigate one item at a time in this order: monthly values, DJF year label, then mask/weights. Each step must be recorded here before any change.

Artifact validation update: both regions passed.