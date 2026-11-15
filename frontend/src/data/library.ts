/**
 * Local saved-investigation library (localStorage). Prototype scope: it stores
 * the selection configuration only, never the underlying series. Reopening
 * re-resolves against current data.
 */

/**
 * One stored selection. Settings are part of a slot's identity, so a saved
 * comparison can hold the same region twice with different periods.
 */
export interface SavedSlot {
  regionId: string;
  variable: string;
  season: string;
  period: string;
}

export interface SavedInvestigation {
  id: string;
  name: string;
  mode: 'explore' | 'compare';
  regionIds: string[];
  savedAt: string;
  /** Absent on entries saved before comparisons carried settings. */
  slots?: SavedSlot[];
  notes?: string;
  tags?: string[];
}

const KEY = 'etd.library.v1';

function readAll(): SavedInvestigation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedInvestigation =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedInvestigation).id === 'string' &&
        Array.isArray((item as SavedInvestigation).regionIds),
    );
  } catch {
    return [];
  }
}

export function loadSaved(): SavedInvestigation[] {
  return readAll();
}

export function saveInvestigation(input: {
  name: string;
  mode: 'explore' | 'compare';
  regionIds: string[];
  slots?: SavedSlot[];
  notes?: string;
  tags?: string[];
}): SavedInvestigation[] {
  const all = readAll();
  const next: SavedInvestigation = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    mode: input.mode,
    regionIds: input.regionIds,
    savedAt: new Date().toISOString(),
    ...(input.slots ? { slots: input.slots } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.tags && input.tags.length > 0 ? { tags: input.tags } : {}),
  };
  const updated = [next, ...all].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // Storage full or blocked; the in-memory list still reflects the save.
  }
  return updated;
}

export function deleteInvestigation(id: string): SavedInvestigation[] {
  const updated = readAll().filter((item) => item.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors on delete.
  }
  return updated;
}
