// Calendar days for people. Timestamps are stored in UTC; a person reads them
// in their own zone, so a page published at 20:30 UTC is "tomorrow" in Manila.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The zone to show days in: `TZ` when it names a real zone, else the
 * system's. Node on Windows takes the zone from the OS and ignores TZ, so it
 * is passed to Intl explicitly to mean the same thing everywhere.
 */
export function userTimeZone(env = process.env) {
  const named = env.TZ;
  if (!named) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: named }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The calendar day (YYYY-MM-DD) of a stored date in `timeZone` (default: the
 * user's). A date-only string is already a calendar day and is kept as is.
 * Anything unreadable comes back unchanged, and a missing value as ''.
 * @param {unknown} value
 * @param {{ timeZone?: string }} [options]
 */
export function localDay(value, { timeZone = userTimeZone() } = {}) {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  if (DATE_ONLY.test(text)) return text;
  const at = new Date(text);
  if (Number.isNaN(at.getTime())) return text;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(at).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Today's calendar day where the user is, for file names. */
export const today = (at = new Date(), options = {}) => localDay(at.toISOString(), options);
