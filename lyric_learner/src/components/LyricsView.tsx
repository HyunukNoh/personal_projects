import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LyricLine } from '../types';

interface Props {
  lines: LyricLine[];
  currentMs: number;
  containerHeight: number;
  isRepeating: boolean;
  onLinePress: (line: LyricLine) => void;
  onToggleRepeat: () => void;
}

function getActiveIndex(lines: LyricLine[], currentMs: number): number {
  const currentSec = currentMs / 1000;
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentSec >= lines[i].timestamp_start) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}

export default function LyricsView({
  lines,
  currentMs,
  containerHeight,
  isRepeating,
  onLinePress,
  onToggleRepeat,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lineYPositions = useRef<number[]>([]);
  const lineHeights = useRef<number[]>([]);
  const prevActiveIndex = useRef<number>(-1);

  const scaleAnims = useRef<Animated.Value[]>(
    lines.map(() => new Animated.Value(0.85))
  ).current;
  const opacityAnims = useRef<Animated.Value[]>(
    lines.map(() => new Animated.Value(0.3))
  ).current;

  const activeIndex = getActiveIndex(lines, currentMs);

  const animateLine = useCallback(
    (index: number, toActive: boolean) => {
      Animated.parallel([
        Animated.spring(scaleAnims[index], {
          toValue: toActive ? 1.0 : 0.85,
          useNativeDriver: true,
          damping: 15,
          stiffness: 200,
        }),
        Animated.timing(opacityAnims[index], {
          toValue: toActive ? 1.0 : 0.3,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [scaleAnims, opacityAnims]
  );

  useEffect(() => {
    if (activeIndex === prevActiveIndex.current) return;

    if (prevActiveIndex.current >= 0 && prevActiveIndex.current < lines.length) {
      animateLine(prevActiveIndex.current, false);
    }
    if (activeIndex >= 0 && activeIndex < lines.length) {
      animateLine(activeIndex, true);

      const y = lineYPositions.current[activeIndex];
      const lineH = lineHeights.current[activeIndex] ?? 80;
      if (y !== undefined) {
        const targetY = y - containerHeight / 2 + lineH / 2;
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
      }
    }

    prevActiveIndex.current = activeIndex;
  }, [activeIndex, animateLine, containerHeight, lines.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingVertical: containerHeight / 2 }]}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
    >
      {lines.map((line, index) => {
        const isActive = index === activeIndex;
        return (
          <Animated.View
            key={line.id}
            style={[
              styles.lineContainer,
              {
                transform: [{ scale: scaleAnims[index] }],
                opacity: opacityAnims[index],
              },
            ]}
            onLayout={(e) => {
              lineYPositions.current[index] = e.nativeEvent.layout.y;
              lineHeights.current[index] = e.nativeEvent.layout.height;
            }}
          >
            <Pressable onPress={() => onLinePress(line)} style={styles.textBlock}>
              <Text style={styles.originalText}>{line.text}</Text>
              {line.translation ? (
                <Text style={styles.translationText}>{line.translation}</Text>
              ) : null}
              {line.translation_literal ? (
                <Text style={styles.literalText}>{line.translation_literal}</Text>
              ) : null}
            </Pressable>

            {isActive && (
              <View style={styles.repeatRow}>
                <Pressable
                  onPress={onToggleRepeat}
                  style={[styles.repeatButton, isRepeating && styles.repeatButtonActive]}
                  hitSlop={10}
                >
                  <Text style={[styles.repeatIcon, isRepeating && styles.repeatIconActive]}>
                    ↺
                  </Text>
                </Pressable>
              </View>
            )}
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    gap: 32,
  },
  lineContainer: {
    alignItems: 'center',
    gap: 8,
  },
  textBlock: {
    alignItems: 'center',
    gap: 6,
  },
  originalText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 34,
    textAlign: 'center',
  },
  translationText: {
    fontSize: 16,
    color: '#888888',
    lineHeight: 22,
    textAlign: 'center',
  },
  literalText: {
    fontSize: 13,
    color: '#555555',
    fontStyle: 'italic',
    lineHeight: 19,
    textAlign: 'center',
  },
  repeatRow: {
    alignItems: 'center',
    marginTop: 2,
  },
  repeatButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444444',
  },
  repeatButtonActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  repeatIcon: {
    fontSize: 16,
    color: '#666666',
  },
  repeatIconActive: {
    color: '#0d0d0d',
  },
});
