// Checks that the built app (dist/, or the folder given) doesn't load anything
// from the internet: no fonts, images, scripts or stylesheets from other sites.
// Hikers use the app with no signal, so anything remote would just break.
//
//     npm run build && npm run check-offline
//
// It looks for the ways a page loads things (src/href attributes, CSS url()
// and @import), not for every web address: libraries contain harmless
// addresses in error messages, and those don't load anything.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? new URL('../dist/', import.meta.url).pathname;

const LOADS_REMOTE = [
  /\b(?:src|href|srcset)\s*[=:]\s*["'`]\s*(https?:)?\/\/[^"'`\s]+/g, // <img src="https://..."> and src:"https://..."
  /url\(\s*["']?(https?:)?\/\/[^)"']+/g, // CSS / inline style url(https://...)
  /@import\s+(?:url\()?\s*["']?(https?:)?\/\/[^)"';\s]+/g, // CSS @import of a remote stylesheet
];

function files(d) {
  return readdirSync(d).flatMap((name) => {
    const path = join(d, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|js|css|webmanifest|json)$/.test(name) ? [path] : [];
  });
}

const problems = [];
for (const file of files(dir)) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of LOADS_REMOTE) {
    for (const match of text.matchAll(pattern)) problems.push(`${relative(dir, file)}: ${match[0].slice(0, 120)}`);
  }
}

if (problems.length > 0) {
  console.error(`Not offline-safe: the app loads ${problems.length} thing(s) from the internet:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Offline check passed: nothing in ${relative(process.cwd(), dir) || dir} loads from the internet.`);
