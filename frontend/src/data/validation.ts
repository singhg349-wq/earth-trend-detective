/**
 * Region validation labels.
 *
 * The label text is derived only from an artifact's `validation.status`.
 * `passed` means the series was checked against Giovanni; `unchecked-same-method`
 * means it uses the same processing and estimator but has no individual check;
 * `pending` means a check is still to come.
 *
 * `failed` and any unlisted status return null, so the interface can hide them
 * instead of showing a number that did not survive its check.
 */
export const VALIDATION_LABELS = {
  passed: 'checked against Giovanni',
  'unchecked-same-method': 'same method, not individually checked',
  pending: 'pending check',
} as const;

export type ListedValidationStatus = keyof typeof VALIDATION_LABELS;

export function validationLabel(status: unknown): string | null {
  if (typeof status !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(VALIDATION_LABELS, status)) return null;
  return VALIDATION_LABELS[status as ListedValidationStatus];
}

export function isListedValidation(status: unknown): boolean {
  return validationLabel(status) !== null;
}
