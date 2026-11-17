// Calendar days for people. Timestamps are stored in UTC; a person reads them
// in their own zone, so a page published at 20:30 UTC is "tomorrow" in Manila.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

/**
 * The local calendar day (YYYY-MM-DD) of a stored date. A date-only string is
 * already a calendar day and is kept as is. Anything unreadable comes back
 * unchanged, and a missing value as ''.
 * @param {unknown} value
 */
export function localDay(value) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  if (DATE_ONLY.test(text)) return text;
  const at = new Date(text);
  if (Number.isNaN(at.getTime())) return text;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Today's local calendar day, for file names. */
export const today = (at = new Date()) => localDay(at.toISOString());
