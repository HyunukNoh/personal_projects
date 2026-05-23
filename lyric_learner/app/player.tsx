import Slider from '@react-native-community/slider';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LyricsView from '../src/components/LyricsView';
import SONGS from '../src/data/getSongs';
import { LyricLine } from '../src/types';

function getActiveIndex(lines: LyricLine[], positionMs: number): number {
  const sec = positionMs / 1000;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sec >= lines[i].timestamp_start) active = i;
    else break;
  }
  return active;
}

// persists across mounts within the session
let globalTranslationMode: 'literal' | 'none' = 'literal';

export default function PlayerScreen() {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const song = SONGS.find((s) => s.id === songId) ?? SONGS[0];
  const lines = song?.translationData.lines ?? [];

  const soundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // refs for stable access inside the polling interval (no stale closure)
  const isRepeatingRef = useRef(false);
  const linesRef = useRef(lines);
  const lastRepeatSeekRef = useRef(0);
  const positionMsRef = useRef(0);
  const repeatLineIndexRef = useRef(-1);
  const playbackRateRef = useRef(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [lyricsHeight, setLyricsHeight] = useState(400);
  const [translationMode, setTranslationMode] = useState<'literal' | 'none'>(globalTranslationMode);
  const [showContextual, setShowContextual] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedSlider, setShowSpeedSlider] = useState(false);
  const [speedDraft, setSpeedDraft] = useState<number | null>(null);

  // keep refs in sync with state
  useEffect(() => { isRepeatingRef.current = isRepeating; }, [isRepeating]);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { playbackRateRef.current = playbackRate; }, [playbackRate]);

  useEffect(() => {
    if (!song) { router.back(); return; }

    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    if (song.audioAsset != null) {
      (async () => {
        const { sound: s } = await Audio.Sound.createAsync(song.audioAsset as number, {
          shouldPlay: false,
          rate: playbackRateRef.current,
          shouldCorrectPitch: true,
        });
        soundRef.current = s;

        const status = await s.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setDurationMs(status.durationMillis);
        }
      })();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      soundRef.current?.unloadAsync();
    };
  }, [song?.audioAsset]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const status: AVPlaybackStatus =
        (await soundRef.current?.getStatusAsync()) ?? { isLoaded: false };
      if (!status.isLoaded) return;

      const pos = status.positionMillis ?? 0;
      if (status.durationMillis) setDurationMs(status.durationMillis);

      // Check repeat BEFORE updating positionMs state to avoid flickering the active line.
      if (isRepeatingRef.current && Date.now() - lastRepeatSeekRef.current > 300) {
        const lockedIdx = repeatLineIndexRef.current;
        if (lockedIdx >= 0 && lockedIdx < linesRef.current.length) {
          const lockedLine = linesRef.current[lockedIdx];
          const endMs = lockedLine.timestamp_end * 1000;
          const startMs = lockedLine.timestamp_start * 1000;
          if (pos >= endMs) {
            lastRepeatSeekRef.current = Date.now();
            positionMsRef.current = startMs;
            setPositionMs(startMs);
            await soundRef.current?.setPositionAsync(startMs);
            return;
          }
        }
      }

      positionMsRef.current = pos;
      setPositionMs(pos);

      if (status.didJustFinish) {
        setIsPlaying(false);
        setIsRepeating(false);
        isRepeatingRef.current = false;
        setPositionMs(0);
        clearInterval(intervalRef.current!);
      }
    }, 100);
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const togglePlayPause = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
      stopPolling();
    } else {
      await sound.playAsync();
      setIsPlaying(true);
      startPolling();
    }
  }, [startPolling, stopPolling]);

  const handleSeek = useCallback(async (ms: number) => {
    const sound = soundRef.current;
    if (!sound) return;
    await sound.setPositionAsync(ms);
    positionMsRef.current = ms;
    setPositionMs(ms);
  }, []);

  const handleLinePress = useCallback(async (line: LyricLine) => {
    const sound = soundRef.current;
    if (!sound) return;
    const targetMs = line.timestamp_start * 1000;
    await sound.setPositionAsync(targetMs);
    positionMsRef.current = targetMs;
    setPositionMs(targetMs);

    // if loop is on, re-lock to the newly tapped line
    if (isRepeatingRef.current) {
      const idx = linesRef.current.findIndex((l) => l.id === line.id);
      if (idx >= 0) {
        repeatLineIndexRef.current = idx;
        lastRepeatSeekRef.current = Date.now();
      }
    }

    // auto-play on tap if paused
    const status = await sound.getStatusAsync();
    if (status.isLoaded && !status.isPlaying) {
      await sound.playAsync();
      setIsPlaying(true);
      startPolling();
    }
  }, [startPolling]);

  const handleToggleRepeat = useCallback(() => {
    setIsRepeating((prev) => {
      const next = !prev;
      if (next) {
        repeatLineIndexRef.current = getActiveIndex(linesRef.current, positionMsRef.current);
      } else {
        repeatLineIndexRef.current = -1;
      }
      return next;
    });
  }, []);

  const handleCycleTranslation = useCallback(() => {
    setTranslationMode((prev) => {
      const next = prev === 'literal' ? 'none' : 'literal';
      globalTranslationMode = next;
      return next;
    });
  }, []);

  const handleRateChange = useCallback(async (rate: number) => {
    setPlaybackRate(rate);
    playbackRateRef.current = rate;
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      await sound.setRateAsync(rate, true);
    }
  }, []);


  const seekToLineIndex = useCallback(async (idx: number) => {
    const sound = soundRef.current;
    if (!sound) return;
    const line = linesRef.current[idx];
    if (!line) return;
    const targetMs = line.timestamp_start * 1000;
    await sound.setPositionAsync(targetMs);
    positionMsRef.current = targetMs;
    setPositionMs(targetMs);
    repeatLineIndexRef.current = idx;
    lastRepeatSeekRef.current = Date.now();
  }, []);

  const handlePrevLine = useCallback(async () => {
    const currentIdx = repeatLineIndexRef.current;
    if (currentIdx <= 0) return;
    await seekToLineIndex(currentIdx - 1);
  }, [seekToLineIndex]);

  const handleNextLine = useCallback(async () => {
    const currentIdx = repeatLineIndexRef.current;
    if (currentIdx < 0 || currentIdx >= linesRef.current.length - 1) return;
    await seekToLineIndex(currentIdx + 1);
  }, [seekToLineIndex]);

  const handleLyricsLayout = useCallback((e: LayoutChangeEvent) => {
    setLyricsHeight(e.nativeEvent.layout.height);
  }, []);

  if (!song) return null;

  const speedLabel = `${playbackRate}×`;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {song.songInfo.song_english}
          </Text>
          <Text style={styles.artistName} numberOfLines={1}>
            {song.songInfo.artist_english}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Lyrics */}
      <View style={styles.lyricsContainer} onLayout={handleLyricsLayout}>
        <LyricsView
          lines={lines}
          currentMs={positionMs}
          containerHeight={lyricsHeight}
          isPlaying={isPlaying}
          isRepeating={isRepeating}
          translationMode={translationMode}
          showContextual={showContextual}
          onLinePress={handleLinePress}
          onToggleRepeat={handleToggleRepeat}
          onPrevLine={handlePrevLine}
          onNextLine={handleNextLine}
        />
      </View>

      {/* Translation toggle — sits between lyrics and control panel */}
      <View style={styles.modeToggleBar}>
        <Pressable
          onPress={() => setShowContextual((v) => !v)}
          style={styles.modeToggleButton}
          hitSlop={10}
        >
          <Text style={[styles.modeToggleText, showContextual && styles.modeToggleTextOn]}>
            {showContextual ? 'translation on' : 'translation off'}
          </Text>
        </Pressable>
      </View>

      {/* Control panel — visually distinct from the lyrics area */}
      <View style={styles.controlPanel}>
        {/* Speed slider overlay — floats above the panel without shifting layout */}
        {showSpeedSlider && (
          <View style={styles.speedSliderOverlay}>
            <Text style={styles.speedOverlayLabel}>
              {speedDraft !== null ? `${speedDraft}×` : speedLabel}
            </Text>
            <Slider
              style={styles.speedOverlaySlider}
              minimumValue={0.5}
              maximumValue={2}
              step={0.25}
              value={playbackRate}
              onValueChange={(v) => setSpeedDraft(v)}
              onSlidingComplete={async (v) => {
                setSpeedDraft(null);
                await handleRateChange(v);
                setShowSpeedSlider(false);
              }}
              minimumTrackTintColor="#ffffff"
              maximumTrackTintColor="#333333"
              thumbTintColor="#ffffff"
            />
          </View>
        )}

        {/* Play row */}
        <View style={styles.playRow}>
          <View style={styles.sideSlot} />
          <Pressable
            onPress={togglePlayPause}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
          >
            {isPlaying ? (
              <View style={styles.pauseIconContainer}>
                <View style={styles.pauseBar} />
                <View style={styles.pauseBar} />
              </View>
            ) : (
              <Text style={styles.playIcon}>▶</Text>
            )}
          </Pressable>
          <View style={styles.sideSlot}>
            {/* Translation mode toggle: literal ↔ none (none = white = "clean") */}
            <Pressable
              onPress={handleCycleTranslation}
              style={[
                styles.translationToggle,
                translationMode === 'none' && styles.translationToggleActive,
              ]}
              hitSlop={10}
            >
              <Text
                style={[
                  styles.translationToggleIcon,
                  translationMode === 'none' && styles.translationToggleIconActive,
                ]}
              >
                {translationMode === 'literal' ? '≡' : '—'}
              </Text>
            </Pressable>
            {/* Speed button — tap to reveal slider overlay */}
            <Pressable
              onPress={() => setShowSpeedSlider((v) => !v)}
              hitSlop={10}
              style={[styles.speedButton, showSpeedSlider && styles.speedButtonActive]}
            >
              <Text style={[styles.speedButtonText, showSpeedSlider && styles.speedButtonTextActive]}>
                {speedLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 32,
    color: '#ffffff',
    lineHeight: 36,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  artistName: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },
  lyricsContainer: {
    flex: 1,
  },
  controlPanel: {
    borderTopWidth: 1,
    borderTopColor: '#1c1c1c',
    paddingBottom: 12,
  },
  modeToggleBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  modeToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e2e2e',
  },
  modeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444444',
  },
  modeToggleTextOn: {
    color: '#888888',
  },
  controlPanel: {
    backgroundColor: '#131313',
    borderTopWidth: 1,
    borderTopColor: '#262626',
    paddingBottom: 12,
    // upward shadow so it feels like a raised tray
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  speedSliderOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: '100%',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e1e1e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 16,
  },
  speedOverlayLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#aaaaaa',
    width: 34,
    textAlign: 'center',
  },
  speedOverlaySlider: {
    flex: 1,
    height: 30,
  },
  playRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 8,
  },
  sideSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonPressed: {
    backgroundColor: '#cccccc',
  },
  playIcon: {
    fontSize: 28,
    color: '#0d0d0d',
    marginLeft: 3,
  },
  pauseIconContainer: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: {
    width: 5,
    height: 22,
    borderRadius: 2.5,
    backgroundColor: '#0d0d0d',
  },
  translationToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444444',
  },
  translationToggleActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  translationToggleIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 0.5,
  },
  translationToggleIconActive: {
    color: '#0d0d0d',
  },
  speedButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  speedButtonActive: {
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  speedButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  speedButtonTextActive: {
    color: '#ffffff',
  },
});
