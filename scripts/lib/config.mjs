// Explainer defaults kept in <home>/config.json: what the skill reads before
// it starts (config --json) and what the Settings view shows. Nothing here is
// secret. Documented in references/library.md; keep them in sync.
import { EXPLAINER_TYPES, TYPE_RULES, VISUAL_KINDS } from './schema.mjs';
import { STYLES } from './style.mjs';

export const MODEL_IDS = ['fable-5.2', 'opus-5.5', 'sonnet-5.5', 'haiku-5.5'];
export const INSTRUCTIONS_MAX = 2000;
export const LANGUAGE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const LANGUAGE = LANGUAGE_PATTERN;
// Plain text: tabs and newlines are fine, other control characters are not.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const CONFIG_DEFAULTS = Object.freeze({
  style: 'clean',
  defaultType: 'auto',
  audience: 'engineer',
  depth: 'standard',
  language: 'en',
  visuals: [],
  chapters: {},
  quiz: true,
  analogies: true,
  codeWalkthrough: 'auto',
  model: 'auto',
  budgetUsd: null,
  confirmBeforeStart: true,
  instructions: '',
  // The installed app is tied to this port. null idle means: launcher 30, manual serve never.
  servePort: 4747,
  serveIdleMinutes: null,
});

export const CONFIG_KEYS = Object.keys(CONFIG_DEFAULTS);

const ENUMS = Object.freeze({
  style: STYLES,
  defaultType: ['auto', ...EXPLAINER_TYPES],
  audience: ['newcomer', 'engineer', 'expert'],
  depth: ['overview', 'standard', 'deep'],
  model: ['auto', ...MODEL_IDS],
  // auto: when code carries the root of the idea; always: at least one when the type cites code; never.
  codeWalkthrough: ['auto', 'always', 'never'],
});
/** The allowed values of each choice setting. */
export const CONFIG_ENUMS = ENUMS;
const BOOLEANS = ['quiz', 'analogies', 'confirmBeforeStart'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const quote = (value) => JSON.stringify(value);

function chapterErrors(chapters) {
  if (!isObject(chapters)) return ['chapters: must be { <type>: { <chapter>: true|false } }'];
  return Object.entries(chapters).flatMap(([type, flags]) => {
    if (!EXPLAINER_TYPES.includes(type)) return [`chapters.${type}: "${type}" is not a type (use ${EXPLAINER_TYPES.join(', ')})`];
    if (!isObject(flags)) return [`chapters.${type}: must be { <chapter>: true|false }`];
    return Object.entries(flags).flatMap(([key, on]) => {
      const allowed = [...TYPE_RULES[type].chapters, ...TYPE_RULES[type].optional];
      if (!allowed.includes(key)) return [`chapters.${type}.${key}: not a ${type} chapter (use ${allowed.join(', ')})`];
      return typeof on === 'boolean' ? [] : [`chapters.${type}.${key}: must be true or false`];
    });
  });
}

/** Errors for one key's value, each starting with the key. */
function valueErrors(key, value) {
  if (ENUMS[key]) return ENUMS[key].includes(value) ? [] : [`${key}: ${quote(value)} is not one of ${ENUMS[key].join(', ')}`];
  if (BOOLEANS.includes(key)) return typeof value === 'boolean' ? [] : [`${key}: must be true or false`];
  switch (key) {
    case 'language':
      return typeof value === 'string' && LANGUAGE.test(value) ? [] : [`language: ${quote(value)} is not a language tag like en or pt-BR`];
    case 'visuals':
      if (!Array.isArray(value)) return ['visuals: must be a list of visual kinds'];
      return value.flatMap((kind, i) => (VISUAL_KINDS.includes(kind) ? [] : [`visuals[${i}]: ${quote(kind)} is not one of ${VISUAL_KINDS.join(', ')}`]));
    case 'chapters':
      return chapterErrors(value);
    case 'servePort':
      return Number.isInteger(value) && value >= 1024 && value <= 65535 ? [] : ['servePort: must be a whole number from 1024 to 65535'];
    case 'serveIdleMinutes':
      return value === null || (Number.isInteger(value) && value >= 0 && value <= 1440) ? [] : ['serveIdleMinutes: must be a whole number from 0 to 1440, or null'];
    case 'budgetUsd':
      return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? [] : ['budgetUsd: must be a number of 0 or more, or null'];
    case 'instructions':
      if (typeof value !== 'string') return ['instructions: must be text'];
      if (value.length > INSTRUCTIONS_MAX) return [`instructions: ${value.length} characters. Keep it to ${INSTRUCTIONS_MAX}`];
      return CONTROL.test(value) ? ['instructions: contains control characters. Use plain text'] : [];
    default:
      return [`${key}: unknown setting "${key}" (use ${CONFIG_KEYS.join(', ')})`];
  }
}

/**
 * The config a page may embed: everything except `instructions`, which can
 * hold private notes. Pages served with a token read the rest from the API.
 */
export function publicConfig(config) {
  const { instructions, ...rest } = normalizeConfig(config);
  return rest;
}

/**
 * Strict check, for anything about to be saved. Unknown keys are errors.
 * @param {unknown} config a full or partial config
 * @returns {{ errors: string[] }}
 */
export function validateConfig(config) {
  if (!isObject(config)) return { errors: ['config: must be a JSON object'] };
  return { errors: Object.entries(config).flatMap(([key, value]) => valueErrors(key, value)) };
}

/** Tolerant read: every valid value kept, everything else back to its default. */
export function normalizeConfig(raw) {
  const source = isObject(raw) ? raw : {};
  return Object.fromEntries(CONFIG_KEYS.map((key) => {
    const value = source[key];
    if (value === undefined) return [key, structuredClone(CONFIG_DEFAULTS[key])];
    if (key === 'visuals' && Array.isArray(value)) return [key, value.filter((kind) => VISUAL_KINDS.includes(kind))];
    return [key, valueErrors(key, value).length ? structuredClone(CONFIG_DEFAULTS[key]) : structuredClone(value)];
  }));
}

/**
 * Turn command-line text into the typed value for `key`.
 * @param {string} key
 * @param {string} raw
 */
export function parseConfigValue(key, raw) {
  if (!CONFIG_KEYS.includes(key)) throw new Error(`unknown setting "${key}" (use ${CONFIG_KEYS.join(', ')})`);
  const text = String(raw ?? '').trim();
  if (BOOLEANS.includes(key)) {
    if (['on', 'true', 'yes'].includes(text)) return true;
    if (['off', 'false', 'no'].includes(text)) return false;
    throw new Error(`${key}: use on or off`);
  }
  if (key === 'servePort' || key === 'serveIdleMinutes') {
    if (key === 'serveIdleMinutes' && ['', 'none', 'null'].includes(text)) return null;
    const number = Number(text);
    if (!/^\d+$/.test(text)) throw new Error(`${key}: "${text}" is not a whole number`);
    return number;
  }
  if (key === 'budgetUsd') {
    if (['', 'none', 'null'].includes(text)) return null;
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error(`budgetUsd: "${text}" is not a number`);
    return number;
  }
  if (key === 'visuals') return text ? text.split(',').map((kind) => kind.trim()).filter(Boolean) : [];
  if (key === 'chapters') {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('chapters: use JSON, or set one with chapters.<type>.<chapter> on|off');
    }
  }
  return key === 'instructions' ? String(raw ?? '') : text;
}

/**
 * A new config with one setting changed. `chapters.<type>.<chapter>` sets one flag.
 * Throws with the key named when the value is not allowed.
 */
export function setConfigValue(config, key, raw) {
  const chapter = key.match(/^chapters\.([^.]+)\.([^.]+)$/);
  const next = chapter
    ? { ...config, chapters: { ...config.chapters, [chapter[1]]: { ...(config.chapters[chapter[1]] || {}), [chapter[2]]: chapterFlag(key, raw) } } }
    : { ...config, [key]: parseConfigValue(key, raw) };
  const { errors } = validateConfig(next);
  if (errors.length) throw new Error(errors.join('; '));
  return next;
}

// A chapter flag reads like any on/off setting, but its errors name the chapter.
function chapterFlag(key, raw) {
  try {
    return parseConfigValue('quiz', raw);
  } catch {
    throw new Error(`${key}: use on or off`);
  }
}
