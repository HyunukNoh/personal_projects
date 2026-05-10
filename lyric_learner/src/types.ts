export interface LyricComponent {
  highlight: string;
  meaning: string;
}

export interface LyricFragment {
  id: number;
  word: string;
  meaning: string;
  timestamp_start: number;
  timestamp_end: number;
  components?: LyricComponent[];
}

export interface LyricLine {
  id: number;
  text: string;
  timestamp_start: number; // seconds
  timestamp_end: number;   // seconds
  translation: string;
  translation_literal: string;
  fragments: LyricFragment[];
}

export interface TranslationData {
  song: string;
  artist: string;
  source_language: string;
  target_language: string;
  line_count: number;
  merged_at: string;
  lines: LyricLine[];
}

export interface SongInfo {
  song_original: string;
  artist_original: string;
  song_english: string;
  artist_english: string;
  confidence: string;
  notes: string;
}

export interface SongManifestEntry {
  id: string;
  songInfo: SongInfo;
  audioAsset: number;
  translationData: TranslationData;
}
