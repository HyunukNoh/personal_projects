import { SongManifestEntry, SongManifestJSON } from '../types';
import { AUDIO } from './songs_audio';

const manifest = require('./songs_manifest.json') as SongManifestJSON[];

const SONGS: SongManifestEntry[] = manifest.map((s) => ({
  ...s,
  audioAsset: (AUDIO as Record<string, number>)[s.id] ?? null,
}));

export default SONGS;
