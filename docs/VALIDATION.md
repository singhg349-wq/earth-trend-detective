# Data validation notes

## Giovanni request

Product: GPCP Monthly 0.5 Degree (GPCPMON), version 3.3; variable: sat_gauge_precip (mm/day).
Time range: December 1983 through February 2025; season: DJF, labelled by January year, years 1984-2025.
Request Giovanni area in west, south, east, north order: Indonesia 95E, 11S, 141E, 6N; Peru 82W, 10S, 76W, 3S. Select time series and download the result CSV from the results/download panel.
Expected match: equal-month mean of three monthly rates. Day-weighted series is included for sensitivity.

## Pass rule

Before comparison: maximum absolute difference for any season must be < 2% of the series mean, using the box mask and identical aggregation.

## Mask diagnostics and box series

Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid).

### Indonesia

Polygon mask: 1111 cells; area 1888134.36 km².
Box versus polygon max absolute difference, equal-month: 2.556889 mm/day.

Box mask equal-month values (1984-2025):

10.010032, 8.963746, 9.205420, 7.621066, 8.359756, 9.726661, 7.818852, 8.545257, 6.860235, 7.224948, 8.575024, 8.592627, 9.362603, 9.556863, 5.759668, 10.041492, 10.062323, 9.592497, 8.052805, 8.314530, 8.676107, 7.363584, 9.855494, 8.426949, 9.624392, 9.935507, 7.598456, 9.638542, 9.694252, 9.893130, 8.681680, 8.973721, 7.524806, 9.562672, 8.933798, 7.687959, 7.280406, 10.001200, 9.896030, 10.221735, 7.995658, 11.088287

Box mask day-weighted values (1984-2025):

9.990429, 8.932108, 9.255806, 7.670405, 8.370064, 9.721690, 7.896213, 8.532280, 6.845247, 7.310917, 8.592837, 8.581041, 9.342359, 9.507722, 5.740717, 10.099205, 10.071906, 9.563343, 8.077019, 8.265779, 8.691150, 7.404254, 9.876749, 8.445238, 9.591395, 9.945740, 7.645358, 9.671143, 9.747183, 9.886364, 8.762094, 9.006050, 7.495324, 9.599730, 8.993003, 7.769468, 7.265209, 10.058738, 9.848626, 10.203014, 8.012642, 11.176088

### Coastal Peru

Polygon mask: 119 cells; area 306240.27 km².
Box versus polygon max absolute difference, equal-month: 1.811068 mm/day.

Box mask equal-month values (1984-2025):

4.214144, 2.495206, 2.974309, 3.670031, 3.324949, 3.983190, 2.694111, 2.798679, 2.214009, 3.535048, 3.723128, 2.948352, 3.442425, 2.850105, 5.986290, 4.145702, 3.525630, 3.538498, 3.039908, 3.025510, 2.610438, 2.768511, 3.821376, 3.187626, 4.508460, 3.674295, 3.098382, 2.739587, 4.755993, 3.146315, 3.233773, 3.251328, 3.302713, 4.606679, 3.526533, 3.210403, 3.022770, 2.640170, 2.560313, 2.256504, 2.988796, 3.995832

Box mask day-weighted values (1984-2025):

4.169799, 2.479752, 2.947260, 3.658200, 3.307906, 3.947192, 2.668694, 2.780607, 2.201256, 3.489178, 3.723301, 2.954437, 3.434386, 2.802705, 5.936364, 4.071315, 3.504115, 3.537936, 3.019346, 3.007222, 2.608160, 2.744448, 3.793667, 3.229904, 4.474504, 3.660723, 3.067278, 2.725403, 4.737152, 3.130439, 3.215917, 3.262480, 3.283448, 4.589539, 3.523191, 3.199759, 3.024552, 2.649605, 2.542341, 2.248367, 2.977826, 3.923452
