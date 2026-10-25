// Rebuilds the bundled icon font so it contains exactly the Material Symbols
// icons the screens use. Run it (needs internet) after using a new icon:
//
//     npm run icons
//
// It finds every <span className="material-symbols-outlined">icon_name</span>
// in src/, asks Google Fonts for a font with just those icons, and saves it to
// src/assets/fonts/. The app itself never downloads fonts: it works offline.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const OUT = new URL('../src/assets/fonts/material-symbols-outlined-subset.woff2', import.meta.url).pathname;
// Google only serves the compact .woff2 format to modern browsers, so say we're one.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

const names = new Set();
for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8');
  // Icons written directly: <span className="material-symbols-outlined">close</span>
  for (const match of text.matchAll(/material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*</g)) names.add(match[1]);
  // Icons chosen by code: <span ...>{isDark ? 'light_mode' : 'dark_mode'}</span>
  // takes every quoted name inside the {...}. An extra name that isn't an icon is harmless.
  for (const match of text.matchAll(/material-symbols-outlined[^>]*>\s*\{([^}]*)\}/g)) {
    for (const quoted of match[1].matchAll(/['"]([a-z0-9_]+)['"]/g)) names.add(quoted[1]);
  }
}
const icons = [...names].sort();
console.log(`Found ${icons.length} icons: ${icons.join(', ')}`);

const cssUrl =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200' +
  `&icon_names=${icons.join(',')}&display=block`;
const css = await (await fetch(cssUrl, { headers: { 'User-Agent': USER_AGENT } })).text();
const fontUrl = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
if (!fontUrl) throw new Error(`Google Fonts didn't return a font. Answer was:\n${css.slice(0, 500)}`);

const font = Buffer.from(await (await fetch(fontUrl, { headers: { 'User-Agent': USER_AGENT } })).arrayBuffer());
writeFileSync(OUT, font);
console.log(`Saved ${(font.length / 1024).toFixed(0)} KB to src/assets/fonts/material-symbols-outlined-subset.woff2`);
