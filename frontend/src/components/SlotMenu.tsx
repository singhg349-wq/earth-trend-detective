import { useEffect, useRef, useState } from 'react';
import { PERIOD_OPTIONS } from '../data/exports';
import type { SlotSettings } from '../data/comparison';

interface SlotMenuProps {
  /** Unique id for this result card */
  id: string;
  /** Region identifier */
  regionId: string;
  /** Region display label */
  regionLabel: string;
  /** Current slot settings (for override display) */
  settings: SlotSettings;
  /** Whether this result is currently pinned */
  isPinned: boolean;
  /** Callback when pin/unpin is clicked */
  onPin?: (id: string) => void;
  /** Callback when save is clicked */
  onSave?: (id: string) => void;
  /** Callback when CSV export is clicked */
  onExportCsv?: (id: string) => void;
  /** Callback when JSON export is clicked */
  onExportJson?: (id: string) => void;
  /** Callback when show/hide checks is clicked */
  onToggleChecks?: (id: string) => void;
  /** Whether checks are currently shown for this card */
  checksOpen?: boolean;
  /** Callback when remove from comparison is clicked */
  onRemove?: (id: string) => void;
  /** Whether we're in compare mode (hide remove in explore) */
  inCompareMode: boolean;
  /** Whether this slot has override settings */
  overridden: boolean;
  /** Callback when override is toggled */
  onOverride?: (id: string, patch: Partial<SlotSettings>) => void;
  /** Callback when override is cleared */
  onClearOverride?: (id: string) => void;
  /** Available variables for the selector */
  variables: string[];
  /** Available seasons for the selector */
  seasons: string[];
}

export default function SlotMenu({
  id,
  regionLabel,
  settings,
  isPinned,
  onPin,
  onSave,
  onExportCsv,
  onExportJson,
  onToggleChecks,
  checksOpen = false,
  onRemove,
  inCompareMode,
  overridden,
  onOverride,
  onClearOverride,
  variables,
  seasons,
}: SlotMenuProps) {
  const [open, setOpen] = useState(false);
  const [showOverrideSettings, setShowOverrideSettings] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setShowOverrideSettings(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!open) return;
      if (event.key === 'Escape') {
        setOpen(false);
        setShowOverrideSettings(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleAction = (
    action: () => void | undefined,
    close = true,
  ) => {
    action();
    if (close) {
      setOpen(false);
      setShowOverrideSettings(false);
    }
  };

  const handleOverrideSettingChange = (
    key: keyof SlotSettings,
    value: string,
  ) => {
    onOverride?.(id, { [key]: value as SlotSettings[keyof SlotSettings] });
  };

  const handleClearOverride = () => {
    onClearOverride?.(id);
    setShowOverrideSettings(false);
    setOpen(false);
  };

  return (
    <div className="slot-menu" role="menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn slot-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${regionLabel}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        ⋯
      </button>

      {open && (
        <div
          ref={menuRef}
          className="slot-menu-panel"
          role="menu"
          aria-label={`Options for ${regionLabel}`}
        >
          <button
            type="button"
            role="menuitem"
            className="slot-menu-item"
            onClick={() => handleAction(() => onPin?.(id))}
          >
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="slot-menu-item"
            onClick={() => handleAction(() => onSave?.(id))}
          >
            Save this result
          </button>
          <button
            type="button"
            role="menuitem"
            className="slot-menu-item"
            onClick={() => handleAction(() => onExportCsv?.(id))}
          >
            Export CSV
          </button>
          <button
            type="button"
            role="menuitem"
            className="slot-menu-item"
            onClick={() => handleAction(() => onExportJson?.(id))}
          >
            Export JSON
          </button>
          <button
            type="button"
            role="menuitem"
            className="slot-menu-item"
            onClick={() => handleAction(() => onToggleChecks?.(id))}
          >
            {checksOpen ? 'Hide checks' : 'Show checks'}
          </button>
          {inCompareMode && onRemove && (
            <>
              <hr className="slot-menu-divider" />
              <button
                type="button"
                role="menuitem"
                className="slot-menu-item slot-menu-item-danger"
                onClick={() => handleAction(() => onRemove?.(id))}
              >
                Remove from comparison
              </button>
            </>
          )}
          <hr className="slot-menu-divider" />
          {overridden ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="slot-menu-item"
                onClick={() => setShowOverrideSettings(true)}
              >
                Edit own settings
              </button>
              <button
                type="button"
                role="menuitem"
                className="slot-menu-item"
                onClick={() => handleAction(handleClearOverride)}
              >
                Clear override (use shared)
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="slot-menu-item"
              onClick={() => setShowOverrideSettings(true)}
            >
              Use own settings
            </button>
          )}
          {showOverrideSettings && (
            <div className="slot-menu-override-settings" role="group" aria-label="Override settings">
              <label className="override-setting">
                <span className="override-setting-label">Variable</span>
                <select
                  value={settings.variable}
                  onChange={(e) => handleOverrideSettingChange('variable', e.target.value)}
                  aria-label="Variable"
                >
                  {variables.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="override-setting">
                <span className="override-setting-label">Season</span>
                <select
                  value={settings.season}
                  onChange={(e) => handleOverrideSettingChange('season', e.target.value)}
                  aria-label="Season"
                >
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="override-setting">
                <span className="override-setting-label">Period</span>
                <select
                  value={settings.period}
                  onChange={(e) => handleOverrideSettingChange('period', e.target.value)}
                  aria-label="Period"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ghost override-done"
                onClick={() => {
                  setShowOverrideSettings(false);
                  setOpen(false);
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}