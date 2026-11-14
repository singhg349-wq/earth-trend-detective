# One-off repair: tile slopes were written per year; this rewrites them per decade (0.001 steps) and redraws the trend PNGs. build_precip_grid.py now writes per decade directly.
import json, sys, numpy as np, importlib.util
from pathlib import Path
sys.path.insert(0, '.')
from backend.trend.stats import sen_slope
spec = importlib.util.spec_from_file_location('g', 'scripts/build_precip_grid.py'); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
root = Path('data/artifacts/grid')
idx = json.load(open(root / 'index.json')); FILL = idx['fill_int16']
yrs = idx['variables']['precip']['years_by_season']
changed = 0
for season, years in yrs.items():
    slopes = np.full((180, 360), np.nan, np.float32)
    for f in sorted((root / 'precip' / season).glob('*.json')):
        t = json.load(open(f, encoding='utf-8'))
        for cid, c in t['cells'].items():
            lat = float(cid.split('_')[1]); lon = float(cid.split('_')[2])
            ys = [(y, round(q * 0.01, 2)) for y, q in zip(years, c['v']) if q != FILL]
            if len(ys) < 10:
                s = None
            else:
                s = sen_slope([a for a, _ in ys], [b for _, b in ys])[0] * 10.0
            c['s'] = FILL if s is None else int(round(s / 0.001))
            if s is not None:
                slopes[89 - int(np.floor(lat)), int(np.floor(lon)) + 180] = s
            changed += 1
        f.write_text(json.dumps(t, separators=(',', ':')), encoding='utf-8')
    g.color_image(slopes, -2., 2., 'coolwarm').save(root / 'precip' / f'trend_{season}.png', optimize=True)
    print(season, 'done')
print('cells', changed)
