import { useMemo, useRef, useState } from 'react';

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  years: number[];
  values: Array<number | null>;
  slopePerDecade: number | null;
  intercept: number | null;
  slopeCI?: [number,number] | null;
}

export interface WindowBand {
  start: number;
  end: number;
}

export interface TrendChartProps {
  series: TrendSeries[];
  units: string;
  /** Optional season label shown on the x-axis. */
  seasonLabel?: string;
  /** Optional window band to highlight (e.g., for sub-period shading). */
  windowBand?: WindowBand;
  /** Externally controlled hover year for linked hover across charts */
  hoverYear?: number | null;
  /** Callback when hover year changes (from mouse or keyboard) */
  onHoverYearChange?: (year: number | null) => void;
  /** Unique ID for this chart (used for keyboard focus sync) */
  chartId?: string;
}


const VB_W = 760;
const VB_H = 320;
const PAD = { left: 54, right: 16, top: 18, bottom: 34 };

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return min === max && Number.isFinite(min) ? [min] : [];
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const error = (span / count) / step;
  const niceStep = error >= 5 ? step * 10 : error >= 2 ? step * 5 : error >= 1 ? step * 2 : step;
  const first = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = first; value <= max + niceStep * 0.5; value += niceStep) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

function contiguousRuns(
  years: number[],
  values: Array<number | null>,
): Array<Array<{ year: number; value: number }>> {
  const runs: Array<Array<{ year: number; value: number }>> = [];
  let current: Array<{ year: number; value: number }> = [];
  for (let index = 0; index < years.length; index += 1) {
    const value = values[index];
    if (typeof value === 'number' && Number.isFinite(value)) {
      current.push({ year: years[index], value });
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export default function TrendChart({
  series,
  units,
  seasonLabel,
  hoverYear: externalHoverYear,
  onHoverYearChange,
}: TrendChartProps) {
  const [internalHoverYear, setInternalHoverYear] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  // Use external hover year if provided, otherwise use internal state
  const hoverYear = externalHoverYear ?? internalHoverYear;
  const setHoverYear = (year: number | null) => {
    setInternalHoverYear(year);
    onHoverYearChange?.(year);
  };

  const allYears = useMemo(() => {
    const years: number[] = [];
    for (const item of series) {
      for (const year of item.years) {
        if (!years.includes(year)) years.push(year);
      }
    }
    return years.sort((a, b) => a - b);
  }, [series]);
  const allValues = useMemo(
    () =>
      series
        .flatMap((item) => item.values)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    [series],
  );

  const firstYear = allYears[0];
  const lastYear = allYears[allYears.length - 1];
  const xSpan = (lastYear ?? firstYear ?? 0) - (firstYear ?? 0) || 1;

  const rawMin = allValues.length ? Math.min(...allValues) : 0;
  const rawMax = allValues.length ? Math.max(...allValues) : 1;
  const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.1;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const x = (year: number) =>
    PAD.left + ((year - firstYear) / xSpan) * (VB_W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - (value - yMin) / (yMax - yMin)) * (VB_H - PAD.top - PAD.bottom);

  const yTicks = niceTicks(yMin, yMax, 4);
  const xTickYears = useMemo(() => {
    if (firstYear === undefined || lastYear === undefined) return [];
    const count = 6;
    const span = lastYear - firstYear;
    const step = Math.max(1, Math.ceil(span / count));
    const years: number[] = [];
    for (let year = firstYear; year <= lastYear; year += step) years.push(year);
    if (years[years.length - 1] !== lastYear) years.push(lastYear);
    return years;
  }, [firstYear, lastYear]);

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const sx = (px / rect.width) * VB_W;
    const year = Math.round(firstYear + ((sx - PAD.left) / (VB_W - PAD.left - PAD.right)) * xSpan);
    if (year >= firstYear && year <= lastYear) setHoverYear(year);
  };

  // Keyboard navigation for linked hover
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!firstYear || !lastYear) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const currentYear = hoverYear ?? lastYear;
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const nextYear = Math.max(firstYear, Math.min(lastYear, currentYear + delta));
      setHoverYear(nextYear);
      focusRef.current?.focus();
    } else if (event.key === 'Escape') {
      setHoverYear(null);
    }
  };
  return (
    <div className="trend-chart" ref={focusRef} tabIndex={0} onKeyDown={handleKeyDown} onFocus={() => {}} onBlur={() => setHoverYear(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Trend chart in ${units}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverYear(null)}
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(148, 163, 184, 0.14)"
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="chart-tick"
            >
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {xTickYears.map((year) => (
          <text
            key={`x-${year}`}
            x={x(year)}
            y={VB_H - PAD.bottom + 18}
            textAnchor="middle"
            className="chart-tick"
          >
            {year}
          </text>
        ))}

        {hoverYear !== null && (
          <line
            x1={x(hoverYear)}
            x2={x(hoverYear)}
            y1={PAD.top}
            y2={VB_H - PAD.bottom}
            stroke="rgba(226, 232, 240, 0.35)"
            strokeDasharray="3 3"
          />
        )}

        {series.map((item) => {
          const runs = contiguousRuns(item.years, item.values);
          const trendPoints =
            item.slopePerDecade !== null && item.intercept !== null
              ? [
                  { year: firstYear, value: item.intercept + (item.slopePerDecade / 10) * firstYear },
                  { year: lastYear, value: item.intercept + (item.slopePerDecade / 10) * lastYear },
                ]
              : null;
          return (
            <g key={item.id}>
              {item.slopeCI && trendPoints && (() => {
                const pivot=(firstYear+lastYear)/2;
                const level=item.intercept! + item.slopePerDecade!/10*pivot;
                const bounds=[firstYear,lastYear].map(year=>item.slopeCI!.map(s=>level+s/10*(year-pivot)).sort((a,b)=>a-b));
                const cap=(v:number)=>Math.max(PAD.top,Math.min(VB_H-PAD.bottom,y(v)));
                return <polygon points={`${x(firstYear)},${cap(bounds[0][0])} ${x(lastYear)},${cap(bounds[1][0])} ${x(lastYear)},${cap(bounds[1][1])} ${x(firstYear)},${cap(bounds[0][1])}`} fill={item.color} opacity={0.12}><title>95% slope confidence interval, anchored at the fitted midpoint. Assumes independent years; this is not a prediction interval.</title></polygon>;
              })()}
              {runs.map((run, index) => (
                <polyline
                  key={index}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={1.5}
                  points={run
                    .map((point) => `${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`)
                    .join(' ')}
                />
              ))}
              {trendPoints && (
                <line
                  x1={x(trendPoints[0].year)}
                  y1={y(trendPoints[0].value)}
                  x2={x(trendPoints[1].year)}
                  y2={y(trendPoints[1].value)}
                  stroke={item.color}
                  strokeWidth={1.4}
                  strokeDasharray="5 4"
                  opacity={0.9}
                />
              )}
            </g>
          );
        })}

        {hoverYear !== null && (
          <g>
            {series.map((item) => {
              const index = item.years.indexOf(hoverYear);
              if (index < 0) return null;
              const value = item.values[index];
              if (typeof value !== 'number' || !Number.isFinite(value)) return null;
              return (
                <circle
                  key={item.id}
                  cx={x(hoverYear)}
                  cy={y(value)}
                  r={3.5}
                  fill={item.color}
                  stroke="#04060e"
                  strokeWidth={1}
                />
              );
            })}
          </g>
        )}
      </svg>

      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.id} className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: item.color }} />
            {item.label}
            <span className="legend-dash" style={{ borderColor: item.color }} />
            trend
          </span>
        ))}
        <span className="chart-units">
          {units}
          {seasonLabel ? ` · ${seasonLabel}` : ''}
        </span>
      </div>

      {hoverYear !== null && (
        <div className="chart-tooltip">
          <strong>{hoverYear}</strong>
          {series.map((item) => {
            const index = item.years.indexOf(hoverYear);
            const value = index >= 0 ? item.values[index] : null;
            return (
              <span key={item.id}>
                {item.label}:{' '}
                {typeof value === 'number' && Number.isFinite(value)
                  ? value.toFixed(3)
                  : 'no data'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
