"""DJF seasonal aggregation; season year is its January year."""
import calendar
import numpy as np

def djf_months(year):
    return ((year-1, 12), (year, 1), (year, 2))

def aggregate_djf(monthly, years=range(1984, 2026)):
    """monthly maps keyed by (year, month); return equal and day-weighted maps."""
    out = {"years": [], "equal": [], "day_weighted": []}
    for year in years:
        keys = djf_months(year)
        if not all(k in monthly for k in keys):
            continue
        maps = [np.asarray(monthly[k], dtype=float) for k in keys]
        stack = np.stack(maps)
        out["years"].append(year)
        out["equal"].append(np.nanmean(stack, axis=0))
        days = np.array([calendar.monthrange(y, m)[1] for y,m in keys], dtype=float)[:,None,None]
        valid = np.isfinite(stack)
        out["day_weighted"].append(np.nansum(stack*days, axis=0)/np.sum(valid*days, axis=0))
    out["equal"] = np.stack(out["equal"]) if out["equal"] else np.empty((0,))
    out["day_weighted"] = np.stack(out["day_weighted"]) if out["day_weighted"] else np.empty((0,))
    return out

def area_mean(grid, area_weights):
    x = np.asarray(grid, dtype=float)
    valid = np.isfinite(x) & (area_weights > 0)
    denom = np.sum(np.where(valid, area_weights, 0), axis=(-2,-1))
    numer = np.sum(np.where(valid, x*area_weights, 0), axis=(-2,-1))
    return numer/denom, denom/np.sum(area_weights)
