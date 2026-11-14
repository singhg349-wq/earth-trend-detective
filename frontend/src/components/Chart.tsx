interface ChartProps {
  years: number[];
  values: Array<number | null>;
  units: string;
  highlightYear?: number | null;
}

const WIDTH = 340;
const HEIGHT = 150;
const PAD = { left: 38, right: 12, top: 12, bottom: 22 };

export default function Chart({ years, values, units, highlightYear }: ChartProps) {
  const points = years
    .map((year, index) => ({ year, value: values[index] }))
    .filter(
      (point): point is { year: number; value: number } =>
        typeof point.value === 'number' && Number.isFinite(point.value),
    );

  if (points.length === 0) {
    return <div className="chart-empty">No values in this series.</div>;
  }

  const firstYear = points[0].year;
  const lastYear = points[points.length - 1].year;
  const xSpan = lastYear - firstYear || 1;
  const rawMin = Math.min(...points.map((point) => point.value));
  const rawMax = Math.max(...points.map((point) => point.value));
  const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.08;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const x = (year: number) =>
    PAD.left + ((year - firstYear) / xSpan) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - (value - yMin) / (yMax - yMin)) * (HEIGHT - PAD.top - PAD.bottom);

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');

  const ticks = [yMax, (yMax + yMin) / 2, yMin].map((value) => ({
    value,
    y: y(value),
  }));

  const showHighlight =
    typeof highlightYear === 'number' && highlightYear >= firstYear && highlightYear <= lastYear;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Line chart of ${units} by year from ${firstYear} to ${lastYear}`}
    >
      {ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={tick.y}
            y2={tick.y}
            stroke="#e3e8ef"
            strokeWidth="1"
          />
          <text x={PAD.left - 5} y={tick.y + 3} textAnchor="end" className="chart-axis">
            {tick.value.toFixed(2)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={PAD.left}
        y1={PAD.top}
        y2={HEIGHT - PAD.bottom}
        stroke="#c8d0da"
        strokeWidth="1"
      />
      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={HEIGHT - PAD.bottom}
        y2={HEIGHT - PAD.bottom}
        stroke="#c8d0da"
        strokeWidth="1"
      />
      {showHighlight && (
        <line
          x1={x(highlightYear)}
          x2={x(highlightYear)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="#b45309"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}
      <path d={path} fill="none" stroke="#1f6feb" strokeWidth="1.8" />
      {points.map((point) => (
        <circle
          key={point.year}
          cx={x(point.year)}
          cy={y(point.value)}
          r="1.8"
          fill="#ffffff"
          stroke="#1f6feb"
          strokeWidth="1.2"
        />
      ))}
      <text x={PAD.left} y={HEIGHT - 7} className="chart-axis">
        {firstYear}
      </text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 7} textAnchor="end" className="chart-axis">
        {lastYear}
      </text>
      <text x={WIDTH - PAD.right} y={PAD.top + 2} textAnchor="end" className="chart-units">
        {units}
      </text>
    </svg>
  );
}
