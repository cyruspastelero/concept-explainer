// Small helpers shared by the validator modules.

export const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isText = (value) => typeof value === 'string' && value.trim().length > 0;
export const arr = (value) => (Array.isArray(value) ? value : []);

export function collector() {
  const errors = [];
  const warnings = [];
  return {
    error: (path, message) => errors.push(`${path}: ${message}`),
    warn: (path, message) => warnings.push(`${path}: ${message}`),
    result: () => ({ errors, warnings }),
  };
}

export function requireText(report, path, value) {
  if (!isText(value)) report.error(path, 'must be a non-empty string');
}

export function optionalText(report, path, value) {
  if (value !== undefined && typeof value !== 'string') report.error(path, 'must be a string');
}

// For v1 fields an unknown value only falls back to a default style, so it warns.
export function checkEnum(report, path, value, allowed) {
  if (value !== undefined && !allowed.includes(value)) {
    report.warn(path, `"${value}" is not one of ${allowed.join(', ')}. It will render with a default style`);
  }
}

// For v2 fields the value changes what is drawn, so an unknown one is an error.
export function checkOneOf(report, path, value, allowed, { required = false } = {}) {
  if (value === undefined) {
    if (required) report.error(path, `is required (one of ${allowed.join(', ')})`);
    return;
  }
  if (!allowed.includes(value)) report.error(path, `"${value}" is not one of ${allowed.join(', ')}`);
}

export function checkUniqueIds(report, path, items) {
  const seen = new Set();
  items.forEach((item, i) => {
    requireText(report, `${path}[${i}].id`, item && item.id);
    if (item && seen.has(item.id)) report.error(`${path}[${i}].id`, `duplicate id "${item.id}"`);
    if (item) seen.add(item.id);
  });
  return seen;
}

/** An array field: error when present but not a list. Returns the list. */
export function listAt(report, path, value) {
  if (value !== undefined && !Array.isArray(value)) report.error(path, 'must be a list');
  return arr(value);
}

export function checkCount(report, path, items, { min = 0, max = Infinity }, { strict = false, what = 'items' } = {}) {
  if (items.length >= min && items.length <= max) return;
  const range = max === Infinity ? `at least ${min}` : `${min} to ${max}`;
  const message = `has ${items.length} ${what}. Use ${range}`;
  if (strict) report.error(path, message);
  else report.warn(path, message);
}

export const words = (value) => (isText(value) ? value.trim().split(/\s+/).length : 0);
export const sentences = (value) => (isText(value) ? (value.match(/[.!?](\s|$)/g) || []).length : 0);
