#!/usr/bin/env node
// Dev only, not shipped as a script (the fonts/ folder it writes is shipped).
// Downloads the latin and latin-ext woff2 subsets of the template's fonts and
// their SIL Open Font License texts into fonts/, and writes fonts/fonts.json,
// which the build reads to emit @font-face rules for library pages.
//
//   node scripts/dev/fetch-fonts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = fileURLToPath(new URL('../../fonts/', import.meta.url));
const CSS_URL = 'https://fonts.googleapis.com/css2?family=Geist:wght@400..600&family=Geist+Mono:wght@400..500&family=Nunito:wght@500..900&family=JetBrains+Mono:wght@500..700&display=swap';
// A browser user agent, so Google serves woff2 with unicode-range subsets.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SUBSETS = ['latin', 'latin-ext'];
const LICENSES = {
  Geist: 'https://raw.githubusercontent.com/google/fonts/main/ofl/geist/OFL.txt',
  'Geist Mono': 'https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/OFL.txt',
  Nunito: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt',
  'JetBrains Mono': 'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt',
};

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

const slug = (family) => family.toLowerCase().replace(/\s+/g, '-');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const css = await get(CSS_URL);
  const faces = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)]
    .map(([, subset, body]) => ({
      subset,
      family: body.match(/font-family: '([^']+)'/)[1],
      weight: body.match(/font-weight: ([^;]+);/)[1],
      url: body.match(/url\(([^)]+)\)/)[1],
      unicodeRange: body.match(/unicode-range: ([^;]+);/)[1],
    }))
    .filter((face) => SUBSETS.includes(face.subset));
  const fonts = [];
  for (const face of faces) {
    const file = `${slug(face.family)}-${face.subset}.woff2`;
    writeFileSync(join(OUT, file), await get(face.url, 'buffer'));
    fonts.push({ family: face.family, weight: face.weight, subset: face.subset, file, unicodeRange: face.unicodeRange });
    process.stderr.write(`fonts/${file}\n`);
  }
  writeFileSync(join(OUT, 'fonts.json'), `${JSON.stringify({ source: 'Google Fonts, SIL Open Font License 1.1 (see OFL.txt)', fonts }, null, 2)}\n`);
  const licenses = [];
  for (const [family, url] of Object.entries(LICENSES)) licenses.push(`${family}\n${'='.repeat(family.length)}\n\n${(await get(url)).trim()}\n`);
  writeFileSync(join(OUT, 'OFL.txt'), `These fonts are licensed under the SIL Open Font License, Version 1.1.\nOne license text per family follows.\n\n${licenses.join('\n\n')}`);
  process.stderr.write(`fonts/fonts.json, fonts/OFL.txt (${fonts.length} files)\n`);
}

main().catch((error) => {
  process.stderr.write(`✖ ${error.message}\n`);
  process.exitCode = 1;
});
