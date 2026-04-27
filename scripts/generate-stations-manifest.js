#!/usr/bin/env node
/*
 * Scans public/stations/<folder>/ and writes public/stations/manifest.json
 * mapping each station folder → its display name.
 *
 * Convention: each station folder contains a "marker" .txt file whose
 * filename is the station name (e.g. "Hurra! Emancipation.txt"). It's
 * recognised as anything ending in .txt that is NOT one of the known
 * content files (description.txt, description-long.txt, clue.txt). The
 * file's contents don't matter — only the basename — so the marker also
 * serves as a human-friendly label when browsing the folder in Finder.
 *
 * Wired into package.json as `prestart` and `prebuild` so it always runs
 * before the dev server boots and before a production build. Run on demand
 * with `npm run stations-manifest`.
 */
const fs = require('fs');
const path = require('path');

const stationsDir = path.join(__dirname, '..', 'public', 'stations');
const outPath = path.join(stationsDir, 'manifest.json');

// Filenames that carry station content rather than identity. Anything else
// ending in .txt in a station folder is treated as the name marker.
const RESERVED_TXT = new Set([
  'description.txt',
  'description-long.txt',
  'clue.txt',
]);

if (!fs.existsSync(stationsDir)) {
  console.warn(`[stations-manifest] ${stationsDir} does not exist — skipping.`);
  process.exit(0);
}

const folders = fs
  .readdirSync(stationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^station-\d+$/.test(d.name))
  .map((d) => d.name)
  .sort((a, b) => {
    const na = parseInt(a.split('-')[1], 10);
    const nb = parseInt(b.split('-')[1], 10);
    return na - nb;
  });

const stations = folders.map((folder) => {
  const folderPath = path.join(stationsDir, folder);
  const txts = fs
    .readdirSync(folderPath)
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .filter((name) => !RESERVED_TXT.has(name.toLowerCase()))
    .sort();

  if (txts.length === 0) {
    console.warn(`[stations-manifest] ${folder}: no marker .txt file found`);
    return { folder, name: '' };
  }
  if (txts.length > 1) {
    console.warn(
      `[stations-manifest] ${folder}: multiple marker .txt candidates (${txts.join(', ')}); using "${txts[0]}"`
    );
  }
  const name = path.basename(txts[0], path.extname(txts[0]));
  return { folder, name };
});

const manifest = {
  generatedAt: new Date().toISOString(),
  stations,
};

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(
  `[stations-manifest] wrote ${stations.length} station(s) → ${path.relative(process.cwd(), outPath)}`
);
for (const s of stations) {
  console.log(`  ${s.folder} → ${s.name || '(no marker)'}`);
}
