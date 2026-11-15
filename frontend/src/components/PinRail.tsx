import type { InspectItem } from './Inspector';

interface PinRailProps {
  items: InspectItem[];
  onUnpin: (id: string) => void;
}

/**
 * Pinned reference results: compact cards that stay visible while the main panel
 * changes, so a fixed result can be compared against a moving selection.
 */
export default function PinRail({ items, onUnpin }: PinRailProps) {
  if (items.length === 0) return null;
  return (
    <aside className="pin-rail" aria-label="Pinned reference results">
      <h2 className="pin-rail-title">Pinned</h2>
      {items.map((item) => {
        const slope = item.doc.trend?.sen_slope_per_decade;
        const slopeText =
          typeof slope === 'number' && Number.isFinite(slope)
            ? `${slope >= 0 ? '+' : '\u2212'}${Math.abs(slope).toFixed(3)} ${item.doc.units} per decade`
            : 'slope not recorded';
        const years = item.doc.years;
        return (
          <div key={item.id} className="pin-card" style={{ borderColor: item.color }}>
            <div className="pin-card-head">
              <span className="pin-slot" style={{ background: item.color }}>
                {item.slot}
              </span>
              <strong>{item.doc.region.label}</strong>
              <button
                type="button"
                className="ghost-btn pin-remove"
                onClick={() => onUnpin(item.id)}
                aria-label={`Unpin ${item.doc.region.label}`}
              >
                Unpin
              </button>
            </div>
            <p className="pin-meta">
              {item.doc.season.code} &middot; {years[0]}&ndash;{years[years.length - 1]} &middot;{' '}
              {item.doc.units}
            </p>
            <p className="pin-value">{slopeText}</p>
          </div>
        );
      })}
    </aside>
  );
}
