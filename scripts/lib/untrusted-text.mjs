// The one set of rules for free text that came from outside and may reach the
// skill: reader notes (POST /api/signals, `insights import`, imported
// insights) and agent notes (`notes write`, imported notes). Text that fails
// is dropped or refused, never shown to an agent. Keeping the rules here
// means no copy can drift. Contract: references/learning-loop.md.

export const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;
const FENCE = /```|~~~/;
const MARKUP = /<\/?[a-z][a-z0-9-]*(\s[^>]*)?>/i;
// Any URL scheme other than http(s): javascript:, file:, data:, ssh:, mailto:, editor links...
const OTHER_SCHEME = /\b(?!https?:)[a-z][a-z0-9+.-]{1,20}:(\/\/|[^\s/]*[^\s,.;:)])/i;
const SHELL_PROMPT = /^\s*[$>#]\s?\S/;
const SHELL_WORD = /^\s*(sudo|curl|wget|npm|npx|pnpm|yarn|bun|bash|sh|zsh|rm|git|node|python3?|pip3?|docker|powershell|pwsh|cmd|chmod|chown|eval|exec)\b/i;
const TO_AGENT = [
  /\b(ignore|disregard|forget)\s+(all|any|every|previous|prior|the above|above|earlier)\b/i,
  /\byou\s+(must|should|need to|have to)\s+run\b/i,
  /\bsystem\s+prompt\b/i,
  /\b(new|updated|revised)\s+instructions\b/i,
  /^\s*(system|assistant|developer|user)\s*:/i,
];
const PATH_TOKEN = /^[\w./@+-]+$/;
/** A subject: a repo `owner/name`, a source ref or a tag. One token, no spaces. */
export const SUBJECT_TOKEN = /^[\w./@+-]{1,120}$/;

/**
 * Every reason `text` may not reach an agent, each starting with `where`.
 * @param {unknown} text
 * @param {string} where
 * @param {{ max?: number, commands?: boolean }} [options] commands: false skips the
 *   command-line check, for single tokens (a repo named `git/git` is not a command)
 * @returns {string[]}
 */
export function textErrors(text, where, { max = 200, commands = true } = {}) {
  if (typeof text !== 'string' || !text.trim()) return [`${where}: must be text`];
  const errors = [];
  if (text.length > max) errors.push(`${where}: over ${max} characters`);
  if (/[\r\n]/.test(text)) errors.push(`${where}: must be one line`);
  else if (HIDDEN.test(text)) errors.push(`${where}: contains a control or invisible character`);
  if (FENCE.test(text)) errors.push(`${where}: code fences are not allowed`);
  if (MARKUP.test(text)) errors.push(`${where}: markup is not allowed`);
  if (OTHER_SCHEME.test(text)) errors.push(`${where}: only http and https links are allowed`);
  if (commands && (SHELL_PROMPT.test(text) || SHELL_WORD.test(text))) errors.push(`${where}: looks like a command; notes describe, they never tell anyone to run things`);
  if (TO_AGENT.some((re) => re.test(text))) errors.push(`${where}: reads as text addressed to an agent`);
  if (!FENCE.test(text)) {
    const ticks = (text.match(/`/g) || []).length;
    if (ticks % 2) errors.push(`${where}: unbalanced backticks`);
    else if ((text.match(/`([^`]*)`/g) || []).some((span) => !PATH_TOKEN.test(span.slice(1, -1)))) {
      errors.push(`${where}: backticks may hold only a repo path, like \`src/app.ts\``);
    }
  }
  return errors;
}

/** True when `text` passes every rule. */
export const isSafeText = (text, options) => textErrors(text, 'text', options).length === 0;

/** Errors for a subject: one token (SUBJECT_TOKEN) that also passes the text rules. */
export function subjectErrors(subject, where = 'subject') {
  if (typeof subject !== 'string' || !SUBJECT_TOKEN.test(subject)) {
    return [`${where}: must be a repo (owner/name), a source ref or a tag: letters, digits and . / @ + - _ only, up to 120`];
  }
  return textErrors(subject, where, { max: 120, commands: false });
}
