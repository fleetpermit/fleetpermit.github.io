#!/usr/bin/env node
// Adds a content hash to every local stylesheet and script reference in the
// HTML pages, for example assets/css/site.css?v=1a2b3c4d5e. GitHub Pages lets
// browsers cache files for ten minutes, so without the hash a returning visitor
// can get a new page with an old stylesheet. Run it after changing any CSS or
// JS file; scripts/check-site.mjs fails when a hash is missing or stale.
//
//   node scripts/stamp-assets.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Matches href="assets/….css" and src="/assets/….js" (404.html uses root paths),
// with or without an existing ?v=.
export const ASSET_REF = /(\s(?:href|src)=["'])((?:\.\/|\/)?assets\/[^"'?#]+\.(?:css|js))(?:\?v=[0-9a-f]*)?(["'])/g;

export function assetHash(root, path) {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex').slice(0, 10);
}

export function stamp(root, html) {
  return html.replace(ASSET_REF, (all, pre, path, quote) =>
    existsSync(join(root, path)) ? `${pre}${path}?v=${assetHash(root, path)}${quote}` : all);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const name of readdirSync(root).filter((f) => f.endsWith('.html'))) {
    const file = join(root, name);
    const html = readFileSync(file, 'utf8');
    const next = stamp(root, html);
    if (next !== html) {
      writeFileSync(file, next);
      changed++;
    }
  }
  console.log(`stamped asset references in ${changed} page(s)`);
}
