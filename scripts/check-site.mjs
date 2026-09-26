#!/usr/bin/env node
// Static checks for the FleetPermit site. No dependencies.
//
//   node scripts/check-site.mjs
//
// Fails when:
//   - a local href, src or poster in an HTML file points to a file that does not exist
//     (elements marked data-optional, such as demo videos added later, are reported as warnings)
//   - a same-site link points to an #id that the target page does not contain
//   - a page loads a script from another origin
//   - a page is missing a non-empty <title> or a <main> element
//   - any text file contains placeholder filler text or an absolute home-directory path

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.svg', '.json', '.md', '.txt']);
// Pages whose ids are created at runtime from data (for example results.html#S1).
const DYNAMIC_ID_PAGES = new Set(['results.html']);

const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

const files = walk(root);
const htmlFiles = files.filter((f) => extname(f) === '.html');
const rel = (p) => relative(root, p).split(sep).join('/');

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/\sid=["']([^"']+)["']/g)) ids.add(m[1]);
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

for (const file of htmlFiles) {
  const name = rel(file);
  const html = readFileSync(file, 'utf8');

  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!title || !title[1].trim()) errors.push(`${name}: missing or empty <title>`);
  if (!/<main[\s>]/i.test(html)) errors.push(`${name}: missing <main>`);

  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
    if (/^(https?:)?\/\//i.test(m[1])) errors.push(`${name}: external script ${m[1]}`);
  }

  const base = html.match(/<base\s+href=["']([^"']+)["']/i);
  const baseDir = base && base[1].startsWith('/') ? join(root, base[1]) : dirname(file);

  const tagRe = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  for (const tag of html.matchAll(tagRe)) {
    const attrs = tag[2];
    const optional = /\sdata-optional(\s|=|$)/i.test(attrs);
    for (const a of attrs.matchAll(/\s(href|src|poster)\s*=\s*["']([^"']*)["']/gi)) {
      const url = a[2].trim();
      if (!url || /^(https?:|mailto:|tel:|data:|javascript:)/i.test(url) || url.startsWith('//')) continue;
      const [pathPart, hash] = url.split('#');
      const clean = pathPart.split('?')[0];
      let target = file;
      if (clean) {
        target = clean.startsWith('/') ? join(root, clean) : join(baseDir, clean);
        if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
        if (!existsSync(target)) {
          (optional ? warnings : errors).push(`${name}: ${a[1]}="${url}" not found${optional ? ' (optional)' : ''}`);
          continue;
        }
      }
      if (hash && extname(target) === '.html' && !DYNAMIC_ID_PAGES.has(rel(target))) {
        if (!idsOf(target).has(decodeURIComponent(hash))) {
          errors.push(`${name}: link "${url}" points to a missing id #${hash}`);
        }
      }
    }
  }
}

for (const file of files) {
  if (!TEXT_EXT.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  if (/lor[e]m\s+ipsum|\blor[e]m\b/i.test(text)) errors.push(`${rel(file)}: contains placeholder filler text`);
  if (/\/(Users|home)\/[A-Za-z0-9._-]+\//.test(text)) errors.push(`${rel(file)}: contains an absolute home-directory path`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`checked ${htmlFiles.length} pages and ${files.length} files: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
