#!/usr/bin/env node
// Dev only, not shipped. Writes every brand SVG into assets/, then renders the
// PNGs and the ICO with a headless Chromium. Playwright is not a dependency:
// point PLAYWRIGHT_FROM at any folder whose node_modules has playwright.
//
//   PLAYWRIGHT_FROM=~/some-project node scripts/dev/render-assets.mjs
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICO, RASTERS, exportAllSvgs, icoFromPngs, pngSize } from '../lib/assets.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ASSETS = join(ROOT, 'assets');

function loadPlaywright() {
  const from = process.env.PLAYWRIGHT_FROM;
  const require = createRequire(from ? join(resolve(from), 'package.json') : import.meta.url);
  try {
    return require('playwright');
  } catch (error) {
    throw new Error(`render assets: playwright not found${from ? ` in ${from}` : ''}. Set PLAYWRIGHT_FROM to a folder that has it (${error.message})`);
  }
}

// Remove stale SVGs, then write the fresh export.
function writeSvgs() {
  ['icons', 'logo', 'app'].forEach((dir) => {
    mkdirSync(join(ASSETS, dir), { recursive: true });
    readdirSync(join(ASSETS, dir)).filter((f) => f.endsWith('.svg')).forEach((f) => rmSync(join(ASSETS, dir, f)));
  });
  exportAllSvgs().forEach(({ path, svg }) => writeFileSync(join(ASSETS, path), svg));
  process.stderr.write(`wrote ${exportAllSvgs().length} SVGs\n`);
}

async function render(page, svgPath, width, height) {
  const svg = readFileSync(join(ROOT, svgPath), 'utf8').replace(/ width="\d+" height="\d+"/, ` width="${width}" height="${height}"`);
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
  const size = pngSize(png);
  if (size.width !== width || size.height !== height) throw new Error(`render ${svgPath}: got ${size.width}x${size.height}`);
  return png;
}

async function main() {
  writeSvgs();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const r of RASTERS) {
      const out = join(ROOT, r.out);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, await render(page, r.from, r.width, r.height));
      process.stderr.write(`rendered ${r.out}\n`);
    }
    const pngs = [];
    for (const size of ICO.sizes) pngs.push(await render(page, ICO.from, size, size));
    writeFileSync(join(ROOT, ICO.out), icoFromPngs(pngs));
    process.stderr.write(`wrote ${ICO.out} (${ICO.sizes.join(', ')})\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`✖ ${error.message}\n`);
  process.exitCode = 1;
});
