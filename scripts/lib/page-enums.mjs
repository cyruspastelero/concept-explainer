// The choices the Settings view and import box offer, embedded in each page
// at build time so the template never carries its own copy that can drift.
import { CONFIG_ENUMS, INSTRUCTIONS_MAX, LANGUAGE_PATTERN } from './config.mjs';
import { EXPLAINER_TYPES, VISUAL_KINDS } from './schema.mjs';
import { STYLES } from './style.mjs';
import { BUNDLE_FORMAT, MAX_BUNDLE_BYTES } from './bundle-format.mjs';

/** A fresh copy each call, so no page can change another's lists. */
export function pageEnums() {
  return {
    models: [...CONFIG_ENUMS.model],
    visualKinds: [...VISUAL_KINDS],
    types: [...EXPLAINER_TYPES],
    styles: [...STYLES],
    depth: [...CONFIG_ENUMS.depth],
    audience: [...CONFIG_ENUMS.audience],
    codeWalkthrough: [...CONFIG_ENUMS.codeWalkthrough],
    bundleFormat: BUNDLE_FORMAT,
    bundleMaxBytes: MAX_BUNDLE_BYTES,
    instructionsLimit: INSTRUCTIONS_MAX,
    languagePattern: LANGUAGE_PATTERN.source,
  };
}
