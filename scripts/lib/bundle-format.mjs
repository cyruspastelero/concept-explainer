// The bundle file format, apart from bundle.mjs so the page build can name it
// without importing the library (which imports the build).
export const BUNDLE_FORMAT = 'concept-explainer-bundle';
export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
export const MAX_BUNDLE_EXPLAINERS = 500;
