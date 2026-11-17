#!/usr/bin/env node
// Dev only, not shipped (package.json "files" leaves scripts/dev/ out).
// Pulls the glyph outlines the brand assets need out of Geist and Geist Mono
// (SIL Open Font License 1.1) into scripts/lib/brand-glyphs.json, so the
// exported SVGs draw their text as paths and render the same with no font.
//
//   node scripts/dev/brand-glyphs.mjs <Geist-400.ttf> <Geist-600.ttf> <GeistMono-500.ttf>
//
// Static TTF instances come from Google Fonts (request the css2 URL with a
// non-browser user agent to get truetype URLs).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../lib/brand-glyphs.json', import.meta.url));
// Every character any brand string uses, plus digits and common punctuation.
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?/()&+-·\'"';

function tables(buf) {
  const count = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    out[buf.toString('latin1', at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  return out;
}

function cmap4(buf, start) {
  const n = buf.readUInt16BE(start + 2);
  for (let i = 0; i < n; i += 1) {
    const platform = buf.readUInt16BE(start + 4 + i * 8);
    const encoding = buf.readUInt16BE(start + 6 + i * 8);
    const offset = start + buf.readUInt32BE(start + 8 + i * 8);
    if (buf.readUInt16BE(offset) === 4 && (platform === 3 && encoding === 1 || platform === 0)) {
      const segX2 = buf.readUInt16BE(offset + 6);
      const ends = offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      return (code) => {
        for (let s = 0; s < segX2 / 2; s += 1) {
          const end = buf.readUInt16BE(ends + s * 2);
          if (code > end) continue;
          const begin = buf.readUInt16BE(starts + s * 2);
          if (code < begin) return 0;
          const delta = buf.readInt16BE(deltas + s * 2);
          const range = buf.readUInt16BE(ranges + s * 2);
          if (!range) return (code + delta) & 0xffff;
          const g = buf.readUInt16BE(ranges + s * 2 + range + (code - begin) * 2);
          return g ? (g + delta) & 0xffff : 0;
        }
        return 0;
      };
    }
  }
  throw new Error('no format 4 cmap');
}

function readFont(path) {
  const buf = readFileSync(path);
  const t = tables(buf);
  const upm = buf.readUInt16BE(t.head + 18);
  const longLoca = buf.readInt16BE(t.head + 50) === 1;
  const numMetrics = buf.readUInt16BE(t.hhea + 34);
  const glyphAt = (g) => (longLoca ? buf.readUInt32BE(t.loca + g * 4) : buf.readUInt16BE(t.loca + g * 2) * 2);
  const advance = (g) => buf.readUInt16BE(t.hmtx + Math.min(g, numMetrics - 1) * 4);
  const lookup = cmap4(buf, t.cmap);

  // Contours as arrays of { x, y, on } points, in font units.
  function contours(g, dx = 0, dy = 0) {
    const start = t.glyf + glyphAt(g);
    if (glyphAt(g + 1) === glyphAt(g)) return [];
    const n = buf.readInt16BE(start);
    if (n < 0) return composite(start + 10, dx, dy);
    const endPts = Array.from({ length: n }, (_, i) => buf.readUInt16BE(start + 10 + i * 2));
    const total = endPts[n - 1] + 1;
    let p = start + 10 + n * 2;
    p += 2 + buf.readUInt16BE(p);
    const flags = [];
    while (flags.length < total) {
      const f = buf[p++];
      flags.push(f);
      if (f & 8) for (let r = buf[p++]; r > 0; r -= 1) flags.push(f);
    }
    const coords = (short, same) => {
      let v = 0;
      return flags.map((f) => {
        if (f & short) { const d = buf[p++]; v += f & same ? d : -d; } else if (!(f & same)) { v += buf.readInt16BE(p); p += 2; }
        return v;
      });
    };
    const xs = coords(2, 16);
    const ys = coords(4, 32);
    let from = 0;
    return endPts.map((end) => {
      const points = [];
      for (let i = from; i <= end; i += 1) points.push({ x: xs[i] + dx, y: ys[i] + dy, on: Boolean(flags[i] & 1) });
      from = end + 1;
      return points;
    });
  }

  function composite(p, dx, dy) {
    const out = [];
    for (let more = true; more;) {
      const flags = buf.readUInt16BE(p);
      const g = buf.readUInt16BE(p + 2);
      p += 4;
      let ox;
      let oy;
      if (flags & 1) { ox = buf.readInt16BE(p); oy = buf.readInt16BE(p + 2); p += 4; } else { ox = buf.readInt8(p); oy = buf.readInt8(p + 1); p += 2; }
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
      out.push(...contours(g, dx + ox, dy + oy));
      more = Boolean(flags & 0x20);
    }
    return out;
  }

  // Quadratic contours to an SVG path, y flipped so it reads top down.
  function pathOf(g) {
    const f = (v) => Math.round(v);
    return contours(g).map((pts) => {
      if (!pts.length) return '';
      const startIndex = pts.findIndex((q) => q.on);
      const first = startIndex >= 0 ? pts[startIndex] : { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true };
      const ring = startIndex >= 0 ? [...pts.slice(startIndex + 1), ...pts.slice(0, startIndex + 1)] : [...pts, pts[0]];
      let d = `M${f(first.x)} ${f(-first.y)}`;
      let control = null;
      ring.forEach((q) => {
        if (q.on) {
          d += control ? `Q${f(control.x)} ${f(-control.y)} ${f(q.x)} ${f(-q.y)}` : `L${f(q.x)} ${f(-q.y)}`;
          control = null;
        } else if (control) {
          const mid = { x: (control.x + q.x) / 2, y: (control.y + q.y) / 2 };
          d += `Q${f(control.x)} ${f(-control.y)} ${f(mid.x)} ${f(-mid.y)}`;
          control = q;
        } else {
          control = q;
        }
      });
      if (control) d += `Q${f(control.x)} ${f(-control.y)} ${f(first.x)} ${f(-first.y)}`;
      return `${d}Z`;
    }).join('');
  }

  const glyphs = Object.fromEntries([...CHARS].map((ch) => {
    const g = lookup(ch.codePointAt(0));
    if (!g) throw new Error(`${path}: no glyph for "${ch}"`);
    return [ch, { advance: advance(g), d: pathOf(g) }];
  }));
  return { unitsPerEm: upm, glyphs };
}

const [regular, semibold, mono] = process.argv.slice(2);
if (!regular || !semibold || !mono) {
  process.stderr.write('usage: node scripts/dev/brand-glyphs.mjs <Geist-400.ttf> <Geist-600.ttf> <GeistMono-500.ttf>\n');
  process.exit(1);
}
const data = {
  source: 'Geist and Geist Mono by Vercel, SIL Open Font License 1.1. Outlines only, generated by scripts/dev/brand-glyphs.mjs.',
  fonts: { sans: readFont(regular), sansSemibold: readFont(semibold), mono: readFont(mono) },
};
writeFileSync(OUT, `${JSON.stringify(data)}\n`);
process.stderr.write(`wrote ${OUT} (${Math.round(JSON.stringify(data).length / 1024)} KB)\n`);
