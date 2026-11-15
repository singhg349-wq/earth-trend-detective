import type { InspectItem } from '../Inspector';
import type { Suggestion, SuggestionContext } from '../../data/explain';
import { buildSuggestions } from '../../data/explain';

interface SuggestionsProps {
  item: InspectItem;
  checksOpen: boolean;
  onToggleChecks: (id: string) => void;
  onCompareSuggestion?: (regionId: string) => void;
  onOpenTimelapse?: (variable: string, season: string) => void;
  onSave?: () => void;
  inCompareMode: boolean;
  variables: string[];
}

export default function Suggestions(props: SuggestionsProps) {
  const {
    item,
    checksOpen,
    onCompareSuggestion,
    onOpenTimelapse,
    onSave,
    inCompareMode,
    variables,
  } = props;

  const suggestionContext: SuggestionContext = {
    variable: item.doc.variable,
    season: item.doc.season.code,
    regionId: item.regionId,
    regionLabel: item.doc.region.label,
    catalog: variables.map((v) => ({ variable: v, season: item.doc.season.code, regionId: item.regionId, label: item.doc.region.label })),
    hasTimelapse: false,
    checksOpen,
    inCompareMode,
    onCompareSuggestion,
    onOpenTimelapse,
  };
  const suggestions = buildSuggestions(suggestionContext);

  return (
    <div className="suggestions">
      {suggestions.map((suggestion: Suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          className="suggestion-btn"
          onClick={() => handleSuggestionClick(suggestion, item, suggestionContext, onSave)}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

function handleSuggestionClick(
  suggestion: Suggestion,
  item: InspectItem,
  ctx: SuggestionContext,
  onSave?: () => void,
) {
  switch (suggestion.action) {
    case 'compare':
      if (suggestion.data?.regionId && typeof suggestion.data.regionId === 'string') {
        ctx.onCompareSuggestion?.(suggestion.data.regionId);
      }
      break;
    case 'timelapse':
      if (suggestion.data?.variable && suggestion.data?.season) {
        ctx.onOpenTimelapse?.(
          suggestion.data.variable as string,
          suggestion.data.season as string
        );
      }
      break;
    case 'toggleChecks':
      ctx.onToggleChecks?.(item.id);
      break;
    case 'save':
      onSave?.();
      break;
    case 'cite':
      const citation = `${item.doc.source.product} v${item.doc.source.version}${item.doc.source.var ? ` · ${item.doc.source.var}` : ''} · ${item.doc.region.label} · ${item.doc.season.code} · ${item.doc.units}`;
      navigator.clipboard.writeText(citation).catch(() => {});
      break;
    case 'explain':
      break;
  }
}