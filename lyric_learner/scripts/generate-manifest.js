#!/usr/bin/env node
/**
 * Scans assets/songs/ and regenerates src/data/songs_manifest.ts.
 * Run with: npm run songs
 *
 * Each song folder must contain:
 *   audio.mp3, song_info.json, translation_final.json
 */

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.join(__dirname, '../assets/songs');
const OUTPUT_FILE = path.join(__dirname, '../src/data/songs_manifest.ts');

const folders = fs
  .readdirSync(SONGS_DIR)
  .filter((name) => {
    const full = path.join(SONGS_DIR, name);
    return fs.statSync(full).isDirectory();
  })
  .sort();

const missing = [];
const valid = [];

for (const folder of folders) {
  const dir = path.join(SONGS_DIR, folder);
  const required = ['audio.mp3', 'song_info.json', 'translation_final.json'];
  const absent = required.filter((f) => !fs.existsSync(path.join(dir, f)));

  if (absent.length > 0) {
    missing.push({ folder, absent });
  } else {
    valid.push(folder);
  }
}

if (missing.length > 0) {
  console.warn('\n⚠️  Skipped folders (missing files):');
  for (const { folder, absent } of missing) {
    console.warn(`   ${folder}: missing ${absent.join(', ')}`);
  }
}

const entries = valid
  .map((folder) => {
    const rel = `../../assets/songs/${folder}`;
    return `  {
    id: '${folder}',
    songInfo: require('${rel}/song_info.json'),
    audioAsset: require('${rel}/audio.mp3'),
    translationData: require('${rel}/translation_final.json'),
  }`;
  })
  .join(',\n');

const output = `// AUTO-GENERATED — do not edit by hand.
// Run \`npm run songs\` to regenerate after adding or removing song folders.
import { SongManifestEntry } from '../types';

const SONGS: SongManifestEntry[] = [
${entries},
];

export default SONGS;
`;

fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
console.log(`\n✅ songs_manifest.ts updated with ${valid.length} song(s):`);
valid.forEach((f) => console.log(`   • ${f}`));
console.log();
