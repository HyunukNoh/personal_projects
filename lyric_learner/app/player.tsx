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
import ProgressSlider from '../src/components/ProgressSlider';
import SONGS from '../src/data/songs_manifest';
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

export default function PlayerScreen() {
  const { songId } = useLocalSearchParams<{ songId: string }>();
  const song = SONGS.find((s) => s.id === songId) ?? SONGS[0];
  const lines = song.translationData.lines;

  const soundRef = useRef<Audio.Sound | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // refs for stable access inside the polling interval (no stale closure)
  const isRepeatingRef = useRef(false);
  const linesRef = useRef(lines);
  const lastRepeatSeekRef = useRef(0);
  const positionMsRef = useRef(0);
  const repeatLineIndexRef = useRef(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [lyricsHeight, setLyricsHeight] = useState(400);

  // keep refs in sync with state
  useEffect(() => { isRepeatingRef.current = isRepeating; }, [isRepeating]);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    let sound: Audio.Sound;
    (async () => {
      const { sound: s } = await Audio.Sound.createAsync(song.audioAsset, {
        shouldPlay: false,
      });
      sound = s;
      soundRef.current = s;

      const status = await s.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        setDurationMs(status.durationMillis);
      }
    })();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sound?.unloadAsync();
    };
  }, [song.audioAsset]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const status: AVPlaybackStatus =
        (await soundRef.current?.getStatusAsync()) ?? { isLoaded: false };
      if (!status.isLoaded) return;

      const pos = status.positionMillis ?? 0;
      positionMsRef.current = pos;
      setPositionMs(pos);
      if (status.durationMillis) setDurationMs(status.durationMillis);

      // repeat: when the locked line ends, jump straight back to its start —
      // no tail/lead-in buffers, otherwise pos crosses into the adjacent line
      // and flips activeIndex, which is what was causing the visual transition.
      if (isRepeatingRef.current && Date.now() - lastRepeatSeekRef.current > 300) {
        const lockedIdx = repeatLineIndexRef.current;
        if (lockedIdx >= 0 && lockedIdx < linesRef.current.length) {
          const lockedLine = linesRef.current[lockedIdx];
          const endMs = lockedLine.timestamp_end * 1000;
          const startMs = lockedLine.timestamp_start * 1000;
          if (pos >= endMs) {
            lastRepeatSeekRef.current = Date.now();
            positionMsRef.current = startMs;
            await soundRef.current?.setPositionAsync(startMs);
            setPositionMs(startMs);
            return;
          }
        }
      }

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

    // if loop is on, re-lock the loop to the newly tapped line so we don't
    // immediately yank pos back to the previously looped line
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

  const handleLyricsLayout = useCallback((e: LayoutChangeEvent) => {
    setLyricsHeight(e.nativeEvent.layout.height);
  }, []);

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
          onLinePress={handleLinePress}
          onToggleRepeat={handleToggleRepeat}
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <ProgressSlider
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={handleSeek}
        />
        <Pressable
          onPress={togglePlayPause}
          style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        >
          <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
        </Pressable>
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
  controls: {
    paddingBottom: 12,
  },
  playButton: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  playButtonPressed: {
    backgroundColor: '#cccccc',
  },
  playIcon: {
    fontSize: 28,
    color: '#0d0d0d',
    marginLeft: 3,
  },
});
