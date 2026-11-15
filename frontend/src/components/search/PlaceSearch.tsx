import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  PLACE_KIND_LABELS,
  getCityLoadState,
  loadCities,
  searchPlaces,
  type PlaceResult,
} from '../../lib/gazetteer';
import './search.css';

export interface PlaceSearchProps {
  onChoose: (place: PlaceResult) => void;
  onClose: () => void;
  autoFocus?: boolean;
}

const LIST_ID = 'place-search-results';

function optionId(index: number): string {
  return `place-search-option-${index}`;
}

export default function PlaceSearch({ onChoose, onClose, autoFocus = true }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Bumped when the city list finishes loading, so results refresh.
  const [cityVersion, setCityVersion] = useState(0);
  const trimmed = query.trim();
  const hasQuery = trimmed !== '';
  const results = useMemo(
    () => searchPlaces(query, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, cityVersion],
  );
  const [loading, setLoading] = useState(false);
  const loadingCities = hasQuery && loading;

  // The first keystroke fetches the city list (cached afterwards).
  useEffect(() => {
    if (!hasQuery || getCityLoadState() === 'ready') return;
    let live = true;
    setLoading(true);
    void loadCities().then((ok) => {
      if (!live) return;
      setLoading(false);
      if (ok) setCityVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [hasQuery]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // A changed query always restarts the highlight at the best match.
  useEffect(() => {
    setActive(0);
  }, [query]);

  function choose(place: PlaceResult | undefined) {
    if (!place) return;
    onChoose(place);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (results.length === 0) return;
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      setActive((index) => (index <= 0 ? results.length - 1 : index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active] ?? results[0]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      className="ps ed-panel ed-panel--raised"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
        }
      }}
    >
      <div className="ps-field">
        <svg
          className="ps-icon"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="6.75" cy="6.75" r="4.75" />
          <path d="M10.4 10.4 14 14" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className="ps-input"
          type="text"
          role="combobox"
          aria-label="Search for a place or coordinates"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={LIST_ID}
          aria-activedescendant={
            results.length > 0 ? optionId(active) : undefined
          }
          placeholder="Country, ocean, city, region — or 53.55, -113.49"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {trimmed === '' ? (
        <p className="ps-hint">
          Type a place name, or paste coordinates as <kbd>53.55, -113.49</kbd> or{' '}
          <kbd>53.55N 113.49W</kbd>. <kbd>↑</kbd> <kbd>↓</kbd> to move,{' '}
          <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close.
        </p>
      ) : results.length === 0 && loadingCities ? (
        <p className="ps-empty" role="status">
          Loading cities…
        </p>
      ) : results.length === 0 ? (
        <p className="ps-empty" role="status">
          No place matches “{trimmed}”. Try a country, ocean or city name, or
          coordinates such as 53.55, -113.49.
        </p>
      ) : (
        <ul className="ps-list" id={LIST_ID} role="listbox" aria-label="Search results">
          {results.map((place, index) => (
            <li key={`${place.kind}:${place.name}:${place.lon}:${place.lat}`} role="none">
              <button
                type="button"
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                className="ps-option"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(place)}
              >
                <span className="ps-name">{place.name}</span>
                <span className="ps-kind">{PLACE_KIND_LABELS[place.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {results.length > 0 && loadingCities ? (
        <p className="ps-hint" role="status">
          Loading cities…
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="ps-foot" aria-hidden="true">
          <span>
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
          <span>Enter to open</span>
        </div>
      ) : null}
    </div>
  );
}
