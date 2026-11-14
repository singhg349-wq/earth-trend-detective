# Data validation notes

## Giovanni request

Product: GPCP Monthly 0.5 Degree (GPCPMON), version 3.3; variable: sat_gauge_precip (mm/day).
Time range: December 1983 through February 2025; season: DJF, labelled by January year, years 1984-2025.
Request Giovanni area in west, south, east, north order: Indonesia 95E, 11S, 141E, 6N; Peru 82W, 10S, 76W, 3S. Select time series and download the result CSV from the results/download panel.
The product series is the day-weighted mean of monthly rates. Equal-month is retained as a second comparison.

## Pass rule (set before comparison)

Compare each region's box-mask series with Giovanni's monthly area-averaged series for the same box. First compute Giovanni's monthly values, then apply the same DJF formula. Pass only if mean bias and mean absolute error are each at most 0.5% of the Giovanni series mean, maximum single-year absolute difference is at most max(1% of that mean, 0.05 mm/day), and Sen slopes differ by at most max(2% of Giovanni slope magnitude, 0.005 mm/day/decade).

No Giovanni monthly CSV has been supplied in this worktree, so neither Indonesia nor coastal Peru passes yet; neither is listed as featured. All other presets remain unlisted pending individual checks.

## Mask diagnostics and box series

Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid).

The following box-mask comparison series use the native 0.5 degree grid. Compare with Giovanni by taking Giovanni monthly area-averaged values first, then applying DJF: day-weighted first (the product series), equal-month second (sensitivity).

### Indonesia

Polygon mask: 1111 cells; area 1888134.36 km².
Box versus polygon max absolute difference, equal-month: 2.556889 mm/day.

Box mask comparison series by January year (mm/day):

| Year | Day-weighted | Equal-month |
|---:|---:|---:|
| 1984 | 9.990429 | 10.010032 |
| 1985 | 8.932108 | 8.963746 |
| 1986 | 9.255806 | 9.205420 |
| 1987 | 7.670405 | 7.621066 |
| 1988 | 8.370064 | 8.359756 |
| 1989 | 9.721690 | 9.726661 |
| 1990 | 7.896213 | 7.818852 |
| 1991 | 8.532280 | 8.545257 |
| 1992 | 6.845247 | 6.860235 |
| 1993 | 7.310917 | 7.224948 |
| 1994 | 8.592837 | 8.575024 |
| 1995 | 8.581041 | 8.592627 |
| 1996 | 9.342359 | 9.362603 |
| 1997 | 9.507722 | 9.556863 |
| 1998 | 5.740717 | 5.759668 |
| 1999 | 10.099205 | 10.041492 |
| 2000 | 10.071906 | 10.062323 |
| 2001 | 9.563343 | 9.592497 |
| 2002 | 8.077019 | 8.052805 |
| 2003 | 8.265779 | 8.314530 |
| 2004 | 8.691150 | 8.676107 |
| 2005 | 7.404254 | 7.363584 |
| 2006 | 9.876749 | 9.855494 |
| 2007 | 8.445238 | 8.426949 |
| 2008 | 9.591395 | 9.624392 |
| 2009 | 9.945740 | 9.935507 |
| 2010 | 7.645358 | 7.598456 |
| 2011 | 9.671143 | 9.638542 |
| 2012 | 9.747183 | 9.694252 |
| 2013 | 9.886364 | 9.893130 |
| 2014 | 8.762094 | 8.681680 |
| 2015 | 9.006050 | 8.973721 |
| 2016 | 7.495324 | 7.524806 |
| 2017 | 9.599730 | 9.562672 |
| 2018 | 8.993003 | 8.933798 |
| 2019 | 7.769468 | 7.687959 |
| 2020 | 7.265209 | 7.280406 |
| 2021 | 10.058738 | 10.001200 |
| 2022 | 9.848626 | 9.896030 |
| 2023 | 10.203014 | 10.221735 |
| 2024 | 8.012642 | 7.995658 |
| 2025 | 11.176088 | 11.088287 |

### Coastal Peru

Polygon mask: 119 cells; area 306240.27 km².
Box versus polygon max absolute difference, equal-month: 1.811068 mm/day.

Box mask comparison series by January year (mm/day):

| Year | Day-weighted | Equal-month |
|---:|---:|---:|
| 1984 | 4.169799 | 4.214144 |
| 1985 | 2.479752 | 2.495206 |
| 1986 | 2.947260 | 2.974309 |
| 1987 | 3.658200 | 3.670031 |
| 1988 | 3.307906 | 3.324949 |
| 1989 | 3.947192 | 3.983190 |
| 1990 | 2.668694 | 2.694111 |
| 1991 | 2.780607 | 2.798679 |
| 1992 | 2.201256 | 2.214009 |
| 1993 | 3.489178 | 3.535048 |
| 1994 | 3.723301 | 3.723128 |
| 1995 | 2.954437 | 2.948352 |
| 1996 | 3.434386 | 3.442425 |
| 1997 | 2.802705 | 2.850105 |
| 1998 | 5.936364 | 5.986290 |
| 1999 | 4.071315 | 4.145702 |
| 2000 | 3.504115 | 3.525630 |
| 2001 | 3.537936 | 3.538498 |
| 2002 | 3.019346 | 3.039908 |
| 2003 | 3.007222 | 3.025510 |
| 2004 | 2.608160 | 2.610438 |
| 2005 | 2.744448 | 2.768511 |
| 2006 | 3.793667 | 3.821376 |
| 2007 | 3.229904 | 3.187626 |
| 2008 | 4.474504 | 4.508460 |
| 2009 | 3.660723 | 3.674295 |
| 2010 | 3.067278 | 3.098382 |
| 2011 | 2.725403 | 2.739587 |
| 2012 | 4.737152 | 4.755993 |
| 2013 | 3.130439 | 3.146315 |
| 2014 | 3.215917 | 3.233773 |
| 2015 | 3.262480 | 3.251328 |
| 2016 | 3.283448 | 3.302713 |
| 2017 | 4.589539 | 4.606679 |
| 2018 | 3.523191 | 3.526533 |
| 2019 | 3.199759 | 3.210403 |
| 2020 | 3.024552 | 3.022770 |
| 2021 | 2.649605 | 2.640170 |
| 2022 | 2.542341 | 2.560313 |
| 2023 | 2.248367 | 2.256504 |
| 2024 | 2.977826 | 2.988796 |
| 2025 | 3.923452 | 3.995832 |

### Amazon

Polygon mask: 2400 cells; area 7352913.96 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### Sahel

Polygon mask: 2120 cells; area 6321780.74 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### East Africa

Polygon mask: 1248 cells; area 3829534.94 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### India

Polygon mask: 3600 cells; area 10270533.33 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### Australia

Polygon mask: 5712 cells; area 15502055.51 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### California

Polygon mask: 440 cells; area 1084828.49 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### Alberta / Prairies

Polygon mask: 1152 cells; area 2089239.68 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.

### Southern Africa

Polygon mask: 1944 cells; area 5378735.22 km².
Box versus polygon max absolute difference, equal-month: 0.000000 mm/day.
