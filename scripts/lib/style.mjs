// Reader-facing skins. The page reads `style` from its explainer-context tag;
// the hub reads it from its embedded data. Documented in references/library.md.
export const STYLES = ['clean', 'playful'];
export const DEFAULT_STYLE = 'clean';

/**
 * @param {unknown} value
 * @returns {'clean'|'playful'}
 */
export function parseStyle(value) {
  const style = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!STYLES.includes(style)) throw new Error(`unknown style "${String(value ?? '')}": use ${STYLES.join(' or ')}`);
  return style;
}
