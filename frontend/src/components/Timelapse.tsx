import type { TimelapseIndex } from '../types';
import { colormapGradient } from '../lib/colormap';

interface TimelapseProps {
  index: TimelapseIndex | null;
  year: number | null;
  playing: boolean;
  showOnMap: boolean;
  season: string;
  variableLabel: string;
  onChangeYear: (year: number) => void;
  onTogglePlay: () => void;
  onToggleMap: (show: boolean) => void;
}

export default function Timelapse({
  index,
  year,
  playing,
  showOnMap,
  season,
  variableLabel,
  onChangeYear,
  onTogglePlay,
  onToggleMap,
}: TimelapseProps) {
  if (!index) {
    return (
      <section className="panel timelapse">
        <h2>
          {season} {variableLabel.toLowerCase()} time lapse
        </h2>
        <p className="muted">
          No time-lapse frames for this variable and season yet.
        </p>
      </section>
    );
  }

  const activeIndex = Math.max(0, index.years.indexOf(year ?? index.years[0]));
  const activeYear = index.years[activeIndex] ?? index.years[0];

  return (
    <section className="panel timelapse">
      <div className="timelapse-head">
        <div>
          <h2>
            {season} {variableLabel.toLowerCase()} time lapse
          </h2>
          <p className="muted">{index.source}</p>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showOnMap}
            onChange={(event) => onToggleMap(event.target.checked)}
          />
          Show on map
        </label>
      </div>

      <div className="timelapse-controls">
        <button type="button" className="play" onClick={onTogglePlay}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={index.years.length - 1}
          step={1}
          value={activeIndex}
          onChange={(event) => onChangeYear(index.years[Number(event.target.value)])}
          aria-label={`Select ${season} year`}
        />
        <output className="year">{activeYear}</output>
      </div>

      <div className="legend">
        <div className="legend-bar" style={{ background: colormapGradient(typeof index.colormap === 'string' ? index.colormap : index.colormap.name) }} />
        <div className="legend-labels">
          <span>
            {index.vmin} {index.units}
          </span>
          <span className="muted">{typeof index.colormap === 'string' ? index.colormap : index.colormap.name}</span>
          <span>
            {index.vmax} {index.units}
          </span>
        </div>
      </div>
    </section>
  );
}
