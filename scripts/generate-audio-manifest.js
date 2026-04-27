#!/usr/bin/env node
/*
 * Scans public/audio/ and writes public/audio/manifest.json so the running
 * app can discover audio files by name without a directory-listing API.
 *
 * Convention used elsewhere in the codebase: each audio file's name starts
 * with the corresponding station number (with optional leading zero), e.g.
 * "01-juedische-maedchenschule.mp3" belongs to station 1. The runtime code
 * picks the right file by matching that prefix.
 *
 * Wired into package.json as `prestart` and `prebuild`, so it always runs
 * before the dev server boots and before a production build. You can also
 * run it on demand with `npm run audio-manifest`.
 */
const fs = require('fs');
const path = require('path');

const audioDir = path.join(__dirname, '..', 'public', 'audio');
const outPath = path.join(audioDir, 'manifest.json');

const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac']);

if (!fs.existsSync(audioDir)) {
  console.warn(`[audio-manifest] ${audioDir} does not exist — skipping.`);
  process.exit(0);
}

const files = fs
  .readdirSync(audioDir)
  .filter((name) => AUDIO_EXTS.has(path.extname(name).toLowerCase()))
  .sort();

const manifest = {
  generatedAt: new Date().toISOString(),
  files,
};

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(
  `[audio-manifest] wrote ${files.length} file(s) → ${path.relative(process.cwd(), outPath)}`
);
