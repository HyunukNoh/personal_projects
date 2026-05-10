import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  isPlaying: boolean;
  isRepeating: boolean;
  onLinePress: (line: LyricLine) => void;
  onToggleRepeat: () => void;
}

interface SelectedWord {
  lineId: number;
  fragmentId: number;
}

let globalShowTranslation = true;

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
  isPlaying,
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

  const [showTranslation, setShowTranslationState] = useState(globalShowTranslation);
  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);

  const toggleTranslation = useCallback(() => {
    setShowTranslationState((v) => {
      const next = !v;
      globalShowTranslation = next;
      return next;
    });
  }, []);

  useEffect(() => {
    setSelectedWord(null);
  }, [activeIndex]);

  const handleWordPress = useCallback((lineId: number, fragmentId: number) => {
    setSelectedWord((prev) => {
      if (prev?.lineId === lineId && prev?.fragmentId === fragmentId) {
        return null;
      }
      return { lineId, fragmentId };
    });
  }, []);

  const animateLine = useCallback(
    (index: number, toActive: boolean) => {
      if (isRepeating) {
        scaleAnims[index].setValue(toActive ? 1.0 : 0.85);
        opacityAnims[index].setValue(toActive ? 1.0 : 0.3);
        return;
      }
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
    [scaleAnims, opacityAnims, isRepeating]
  );

  useEffect(() => {
    if (activeIndex === prevActiveIndex.current) return;

    if (prevActiveIndex.current >= 0 && prevActiveIndex.current < lines.length) {
      animateLine(prevActiveIndex.current, false);
    }
    if (activeIndex >= 0 && activeIndex < lines.length) {
      animateLine(activeIndex, true);

      if (!isRepeating) {
        const y = lineYPositions.current[activeIndex];
        const lineH = lineHeights.current[activeIndex] ?? 80;
        if (y !== undefined) {
          const targetY = y - containerHeight / 2 + lineH / 2;
          scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
        }
      }
    }

    prevActiveIndex.current = activeIndex;
  }, [activeIndex, animateLine, containerHeight, lines.length, isRepeating]);

  // While loop is on, kill any in-flight transitions and pin every line to its
  // final scale/opacity. Re-runs if activeIndex shifts during a repeat seek so
  // we never see a transition while looping.
  useEffect(() => {
    if (!isRepeating) return;
    for (let i = 0; i < lines.length; i++) {
      scaleAnims[i].stopAnimation();
      opacityAnims[i].stopAnimation();
      if (i === activeIndex) {
        scaleAnims[i].setValue(1.0);
        opacityAnims[i].setValue(1.0);
      } else {
        scaleAnims[i].setValue(0.85);
        opacityAnims[i].setValue(0.3);
      }
    }
  }, [isRepeating, activeIndex, lines.length, scaleAnims, opacityAnims]);

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
        const hasFragments = line.fragments && line.fragments.length > 0;
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
              <View style={styles.bubbleAnchor}>
                {hasFragments ? (
                  <View style={styles.fragmentRow}>
                    {line.fragments.map((f) => {
                      const isWordActive =
                        isPlaying &&
                        currentMs >= f.timestamp_start * 1000 &&
                        currentMs < f.timestamp_end * 1000;
                      const isSelected =
                        isActive &&
                        selectedWord?.lineId === line.id &&
                        selectedWord?.fragmentId === f.id;
                      const components = f.components ?? [];
                      const showBubble = isSelected && components.length > 0;
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => {
                            if (!isActive) {
                              onLinePress(line);
                              return;
                            }
                            handleWordPress(line.id, f.id);
                          }}
                          style={[
                            styles.fragmentCol,
                            isSelected && styles.fragmentColSelected,
                          ]}
                          hitSlop={4}
                        >
                          {showBubble ? (
                            <View style={styles.wordBubbleAnchor} pointerEvents="none">
                              <View style={styles.wordBubble}>
                                {components.map((c, ci) => (
                                  <View
                                    key={ci}
                                    style={[
                                      styles.componentItem,
                                      ci > 0 && styles.componentItemDivider,
                                    ]}
                                  >
                                    <Text style={styles.componentHighlight}>
                                      {c.highlight}
                                    </Text>
                                    <Text style={styles.componentMeaning}>
                                      {c.meaning}
                                    </Text>
                                  </View>
                                ))}
                                <View style={styles.wordBubbleArrow} />
                              </View>
                            </View>
                          ) : null}
                          <Text
                            style={[
                              styles.originalWord,
                              isWordActive && styles.originalWordActive,
                            ]}
                          >
                            {f.word}
                          </Text>
                          <Text
                            style={[
                              styles.literalWord,
                              isWordActive && styles.literalWordActive,
                            ]}
                          >
                            {f.meaning}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.originalWord}>{line.text}</Text>
                )}
              </View>
              {isActive && isRepeating && showTranslation && line.translation ? (
                <Text style={styles.translationLine}>{line.translation}</Text>
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

                {isRepeating && (
                  <Pressable
                    onPress={toggleTranslation}
                    style={[
                      styles.repeatButton,
                      showTranslation && styles.repeatButtonActive,
                    ]}
                    hitSlop={10}
                  >
                    <Text
                      style={[
                        styles.translationToggleIcon,
                        showTranslation && styles.repeatIconActive,
                      ]}
                    >
                      ⇄
                    </Text>
                  </Pressable>
                )}
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
  },
  bubbleAnchor: {
    position: 'relative',
    alignItems: 'center',
    width: '100%',
  },
  fragmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 8,
    columnGap: 10,
  },
  fragmentCol: {
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  fragmentColSelected: {
    backgroundColor: 'rgba(255, 217, 102, 0.12)',
  },
  wordBubbleAnchor: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  wordBubble: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    alignItems: 'center',
    minWidth: 90,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  wordBubbleArrow: {
    position: 'absolute',
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1a1a1a',
  },
  componentItem: {
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  componentItemDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  componentHighlight: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffd966',
    lineHeight: 22,
  },
  componentMeaning: {
    fontSize: 13,
    color: '#dddddd',
    marginTop: 2,
    lineHeight: 16,
    textAlign: 'center',
  },
  originalWord: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 34,
    textAlign: 'center',
  },
  originalWordActive: {
    color: '#ffd966',
  },
  literalWord: {
    fontSize: 16,
    color: '#bbbbbb',
    lineHeight: 22,
    textAlign: 'center',
  },
  literalWordActive: {
    color: '#ffd966',
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  translationToggleIcon: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  translationLine: {
    marginTop: 10,
    fontSize: 15,
    color: '#dddddd',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
});
