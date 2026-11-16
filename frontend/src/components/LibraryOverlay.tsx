import { useState, useMemo } from 'react';
import type { SeriesSummary } from '../types';
import { validationLabel } from '../data/validation';
import type { SavedInvestigation } from '../data/library';

type Tab = 'catalog' | 'saved';

interface LibraryOverlayProps {
  datasets: SeriesSummary[];
  saved: SavedInvestigation[];
  initialTab?: Tab;
  onClose: () => void;
  onOpenDataset: (id: string) => void;
  onOpenSaved: (item: SavedInvestigation) => void;
  onDeleteSaved: (id: string) => void;
}

const VAR_SHORT: Record<string, string> = {
  temperature: 'Temp',
  precipitation: 'Rain',
  aerosol_optical_depth: 'AOD',
  soil_moisture: 'Soil',
};

export default function LibraryOverlay({
  datasets,
  saved,
  initialTab = 'catalog',
  onClose,
  onOpenDataset,
  onOpenSaved,
  onDeleteSaved,
}: LibraryOverlayProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // --- Catalog search ---
  const [catalogQuery, setCatalogQuery] = useState('');

  // --- Saved search and tag filter ---
  const [savedQuery, setSavedQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Extract all tags from saved items for the tag filter UI (memoized)
  const allSavedTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of saved) {
      if (item.tags && item.tags.length > 0) {
        for (const t of item.tags) tags.add(t);
      }
    }
    return Array.from(tags);
  }, [saved]);

  // Filtered datasets: search by region label, variable, or season
  const filteredDatasets = useMemo(() => {
    if (!catalogQuery.trim()) return datasets;
    const lower = catalogQuery.toLowerCase();
    return datasets.filter((dataset) => {
      return (
        dataset.region_label.toLowerCase().includes(lower) ||
        dataset.variable.toLowerCase().includes(lower) ||
        dataset.season.toLowerCase().includes(lower)
      );
    });
  }, [datasets, catalogQuery]);

  // Filtered saved items: search by name, notes, tags; also filter by tag
  const filteredSaved = useMemo(() => {
    // Start with all saved items
    let result = [...saved];

    // Tag filter: if a tag is selected, only show items containing that tag
    if (tagFilter) {
      result = result.filter((item) => item.tags && item.tags.includes(tagFilter));
    }

    // Name/notes query search
    if (savedQuery.trim()) {
      const lower = savedQuery.toLowerCase();
      result = result.filter((item) => {
        const matchesName = item.name.toLowerCase().includes(lower);
        const matchesNotes = item.notes?.toLowerCase().includes(lower);
        // Also check slot contents (region/variable/season strings)
        const hasSlots = item.slots !== undefined && item.slots.length > 0;
        const slotNames = item.slots
          ?.map(
            (s) => `${s.regionId} ${s.variable} ${s.season}`.toLowerCase(),
          )
          .filter(Boolean) as string[];
        const slotString = slotNames.join(' ') || '';
        const matchesSlots = hasSlots && slotString.toLowerCase().includes(lower);

        return matchesName || matchesNotes || matchesSlots;
      });
    }

    return result;
  }, [saved, tagFilter, savedQuery]);

  // --- Catalog tab ---
  const catalogTab = (
    <div className="library-body">
      {/* Search box for catalog */}
      {filteredDatasets.length < datasets.length && (
        <p className="muted small">
          Showing {filteredDatasets.length} of {datasets.length} results matching“{catalogQuery}”.
        </p>
      )}

      <input
        type="text"
        className="add-region-input"
        placeholder="Search regions, variables, seasons..."
        value={catalogQuery}
        onChange={(e) => setCatalogQuery(e.target.value)}
        aria-label="Search dataset catalog"
      />

      <table className="catalog-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Variable</th>
            <th>Season</th>
            <th>Units</th>
            <th>Validation</th>
            <th aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {filteredDatasets.map((dataset) => {
            const label = validationLabel(dataset.validation_status, {regionId:dataset.region_id,variable:dataset.variable,season:dataset.season});
            return (
              <tr key={dataset.id}>
                <td>{dataset.region_label}</td>
                <td>{dataset.variable}</td>
                <td>{dataset.season}</td>
                <td>{dataset.units}</td>
                <td>
                  <span className="tag tag-validation">
                    {label ?? dataset.validation_status}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpenDataset(dataset.id)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // --- Saved tab ---
  const savedTab = (
    <div className="library-body">
      {/* Tag filter UI */}
      {allSavedTags.length > 0 && (
        <div className="tag-filter">
          <span>Filter by tag:</span>
          {[...allSavedTags].map((t) => (
            <label
              key={t}
              className="tag"
              onClick={() => setTagFilter(t === tagFilter ? null : t)}
            >
              {t}
            </label>
          ))}
        </div>
      )}

      {/* Saved query info */}
      {filteredSaved.length < saved.length && (
        <p className="muted small">
          Showing {filteredSaved.length} of {saved.length} results matching“{savedQuery}”.
        </p>
      )}

      <input
        type="text"
        className="add-region-input"
        placeholder="Search by name, notes…"
        value={savedQuery}
        onChange={(e) => setSavedQuery(e.target.value)}
        aria-label="Search saved investigations"
      />

      {filteredSaved.length === 0 ? (
        <p className="muted empty">No saved investigations match your criteria.</p>
      ) : (
        <ul className="saved-list">
          {filteredSaved.map((item) => {
            const itemTags = item.tags || [];
            const regionLabelMap = new Map(datasets.map((d) => [d.region_id, d.region_label]));

            return (
              <li key={item.id} className="saved-item">
                <div>
                  <p className="saved-name">{item.name}</p>
                  <p className="muted small">
                    {item.mode === 'compare' ? 'Compare' : 'Explore'} ·{' '}
                    {item.regionIds.length} region(s) · saved{' '}
                    {new Date(item.savedAt).toLocaleString()}
                  </p>
                  {item.notes && (
                    <p
                      className="saved-notes"
                      style={{
                        marginTop: '6px',
                        fontSize: '0.9rem',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.notes}
                    </p>
                  )}
                </div>
                <div className="saved-tags-and-slots">
                  {item.slots && item.slots.length > 0 ? (
                    <span className="saved-tags">
                      {item.slots.map((s, idx) => (
                        <span key={`${s.regionId}-${idx}`} className="tag">
                          {regionLabelMap.get(s.regionId) ?? s.regionId} · {VAR_SHORT[s.variable] ?? s.variable} · {s.season}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="saved-slot-count">0 slot(s)</span>
                  )}
                  {itemTags.length > 0 && (
                    <span className="saved-tags">
                      {itemTags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <div className="saved-actions">
                  <button type="button" className="btn" onClick={() => onOpenSaved(item)}>
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onDeleteSaved(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="library-overlay" role="dialog" aria-modal="true" aria-label="Library">
      <header className="library-head">
        <div>
          <p className="eyebrow">Library</p>
          <h2>Datasets & saved investigations</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close library">
          ×
        </button>
      </header>

      <div className="library-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'catalog'}
          className={tab === 'catalog' ? 'library-tab active' : 'library-tab'}
          onClick={() => setTab('catalog')}
        >
          Dataset catalog ({datasets.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'saved'}
          className={tab === 'saved' ? 'library-tab active' : 'library-tab'}
          onClick={() => setTab('saved')}
        >
          Saved investigations ({saved.length})
        </button>
      </div>

      {tab === 'catalog' ? catalogTab : savedTab}
    </div>
  );
}