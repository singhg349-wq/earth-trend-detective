"""Small frozen copies of real DJF rainfall series for the stats tests.

Copied once, as numbers, from the w1-data worktree so the tests do not depend on
another worktree or on the GPCP files existing:

* ``INDONESIA_POLYGON``: artifact ``precip_indonesia_DJF.json`` (Natural Earth
  polygon mask, equal-month mean).
* ``COASTAL_PERU_POLYGON``: artifact ``precip_peru_DJF.json`` (Peru polygon
  clipped to the coastal box, equal-month mean).
* ``INDONESIA_BOX_EQUAL_MONTH``: the box-mask equal-month list in
  ``w1-data/docs/VALIDATION.md``.

Years are the DJF January labels 1984-2025 (42 seasons, one per year). Units are
mm/day. The artifact files themselves are never read by the tests.

The three series are not independent of each other: the box and polygon
Indonesia series describe the same region with different masks.
"""

YEARS = tuple(range(1984, 2026))

INDONESIA_POLYGON = (
    10.182191, 8.932548, 9.420631, 8.661206, 9.945959, 9.702922, 8.780436,
    9.272323, 8.396055, 8.859187, 9.219128, 10.495370, 9.356414, 8.324119,
    8.316557, 10.009727, 9.434677, 9.485913, 8.963531, 9.737284, 9.629918,
    9.058913, 10.485659, 9.989938, 9.308745, 10.578963, 10.084942, 9.324209,
    10.007325, 10.621641, 8.854675, 9.792244, 9.403499, 9.419751, 9.408192,
    9.281902, 8.870701, 9.529960, 9.632853, 9.155811, 9.586395, 11.176610,
    )
COASTAL_PERU_POLYGON = (
    5.911073, 3.581846, 4.142278, 5.073361, 4.724974, 5.462925, 3.908870,
    4.057502, 3.087042, 5.032999, 5.300915, 4.254295, 4.982247, 4.188529,
    7.151673, 5.924469, 5.032828, 5.074237, 4.363687, 4.384711, 3.780474,
    4.048085, 5.342268, 4.583314, 6.319527, 5.001809, 4.233225, 3.803216,
    6.557570, 4.489508, 4.729219, 4.744922, 4.594497, 6.321938, 5.034610,
    4.420662, 4.192118, 3.723019, 3.603534, 3.079381, 3.862476, 5.456183,
    )
INDONESIA_BOX_EQUAL_MONTH = (
    10.010032, 8.963746, 9.205420, 7.621066, 8.359756, 9.726661, 7.818852,
    8.545257, 6.860235, 7.224948, 8.575024, 8.592627, 9.362603, 9.556863,
    5.759668, 10.041492, 10.062323, 9.592497, 8.052805, 8.314530, 8.676107,
    7.363584, 9.855494, 8.426949, 9.624392, 9.935507, 7.598456, 9.638542,
    9.694252, 9.893130, 8.681680, 8.973721, 7.524806, 9.562672, 8.933798,
    7.687959, 7.280406, 10.001200, 9.896030, 10.221735, 7.995658, 11.088287,
    )

REAL_SERIES = (
    ("indonesia_polygon", INDONESIA_POLYGON),
    ("coastal_peru_polygon", COASTAL_PERU_POLYGON),
    ("indonesia_box_equal_month", INDONESIA_BOX_EQUAL_MONTH),
)

