const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const songsDir = path.join(__dirname, '../assets/songs');

console.log('[watch-songs] Watching', songsDir);
fs.watch(songsDir, { recursive: true }, (event, filename) => {
  console.log(`[watch-songs] ${event}: ${filename} — regenerating manifest`);
  try {
    execSync('node scripts/generate-manifest.js', { stdio: 'inherit' });
  } catch (e) {}
});
