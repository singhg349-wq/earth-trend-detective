import { useEffect, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { InspectItem } from '../Inspector';

interface NoteDraft {
  name: string;
  notes: string;
  tags: string[];
}

const EMPTY_NOTE: NoteDraft = { name: '', notes: '', tags: [] };

function noteStorageKey(items: InspectItem[]): string {
  const sortedIds = items.map((item) => item.id).sort().join('|');
  return `etd.drawer-notes:${sortedIds}`;
}

function readNoteDraft(key: string): NoteDraft {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_NOTE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_NOTE;
    const record = parsed as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : '',
      notes: typeof record.notes === 'string' ? record.notes : '',
      tags: Array.isArray(record.tags) ? record.tags.filter((t): t is string => typeof t === 'string') : [],
    };
  } catch {
    return EMPTY_NOTE;
  }
}

function validateTag(tag: string): { valid: boolean; error?: string } {
  const trimmed = tag.trim();
  if (!trimmed) return { valid: false, error: 'Tag cannot be empty' };
  if (trimmed.length > 40) return { valid: false, error: 'Tag cannot exceed 40 characters' };
  return { valid: true };
}

interface NotesPanelProps {
  items: InspectItem[];
  onSave: () => void;
  onNotesChange?: (value: string) => void;
  onTagsChange?: (tags: string[]) => void;
}

export default function NotesPanel({ items, onSave, onNotesChange, onTagsChange }: NotesPanelProps) {
  const storageKey = noteStorageKey(items);
  const [draft, setDraft] = useState<NoteDraft>(() => readNoteDraft(storageKey));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Storage can be unavailable (private mode, quota); notes stay local to this view.
    }
  }, [storageKey, draft]);

  useEffect(() => {
    onNotesChange?.(draft.notes);
    onTagsChange?.(draft.tags);
  }, [draft.notes, draft.tags, onNotesChange, onTagsChange]);

  const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const validation = validateTag(tagInput);
      if (!validation.valid) {
        setTagError(validation.error ?? null);
        return;
      }
      if (draft.tags.length >= 12) {
        setTagError('Maximum 12 tags allowed');
        return;
      }
      const trimmed = tagInput.trim();
      if (trimmed && !draft.tags.includes(trimmed)) {
        setDraft({ ...draft, tags: [...draft.tags, trimmed] });
        setTagInput('');
        setTagError(null);
      }
    }
  };

  const handleTagInputBlur = () => {
    if (tagInput.trim()) {
      const validation = validateTag(tagInput);
      if (!validation.valid) {
        setTagError(validation.error ?? null);
        return;
      }
      if (draft.tags.length >= 12) {
        setTagError('Maximum 12 tags allowed');
        return;
      }
      const trimmed = tagInput.trim();
      if (trimmed && !draft.tags.includes(trimmed)) {
        setDraft({ ...draft, tags: [...draft.tags, trimmed] });
        setTagInput('');
        setTagError(null);
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setDraft({ ...draft, tags: draft.tags.filter((t) => t !== tagToRemove) });
  };

  const handleNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft({ ...draft, notes: event.target.value });
  };

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraft({ ...draft, name: event.target.value });
  };

  return (
    <div role="tabpanel" id="inspector-panel-notes" aria-labelledby="inspector-tab-notes" tabIndex={0}>
      <section className="inspector-section notes-panel">
        <h3>Notes & save</h3>
        <p className="muted small">
          Notes and tags are stored in this browser only (localStorage). Nothing is
          uploaded or synced.
        </p>
        <div className="notes-form">
          <label>
            <span>Name</span>
            <input type="text" placeholder="e.g. Sahel rainfall check" value={draft.name} onChange={handleNameChange} />
          </label>
          <label>
            <span>Notes</span>
            <textarea rows={4} placeholder="What you observed, and what to check next" value={draft.notes} onChange={handleNotesChange} />
          </label>
          <label>
            <span>Tags</span>
            <div className="tag-editor">
              <div className="tag-chips">
                {draft.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" className="tag-chip-remove" onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="tag-input"
                placeholder="Add a tag (comma or Enter to commit)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                onBlur={handleTagInputBlur}
                aria-describedby={tagError ? 'tag-error' : undefined}
              />
              {tagError && (
                <p id="tag-error" className="muted small tag-error" role="alert">
                  {tagError}
                </p>
              )}
              <p className="muted small">
                Maximum 12 tags, 40 characters each. Empty tags are rejected.
              </p>
            </div>
          </label>
        </div>
        <div className="notes-actions">
          <button
            type="button"
            className="btn btn-ghost notes-save"
            onClick={() => {
              onSave();
              setSavedAt(new Date().toLocaleTimeString());
            }}
          >
            Save investigation
          </button>
          {savedAt && (
            <span className="muted small" role="status">
              Saved to this browser at {savedAt}.
            </span>
          )}
        </div>
        <p className="muted small">
          Saving keeps this investigation in the local library: {items.map((item) => item.doc.region.label).join(', ')}.
        </p>
      </section>
    </div>
  );
}