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
  /** literal = word meanings below each word; none = no translation */
  translationMode: 'literal' | 'none';
  /** show contextual (sentence) translation below the active line */
  showContextual: boolean;
  onLinePress: (line: LyricLine) => void;
  onToggleRepeat: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
}

interface SelectedWord {
  lineId: number;
  fragmentId: number;
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
  isPlaying,
  isRepeating,
  translationMode,
  showContextual,
  onLinePress,
  onToggleRepeat,
  onPrevLine,
  onNextLine,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lineYPositions = useRef<number[]>([]);
  const lineHeights = useRef<number[]>([]);
  const prevActiveIndex = useRef<number>(-1);
  const needsScrollRef = useRef(false);

  const scaleAnims = useRef<Animated.Value[]>(
    lines.map(() => new Animated.Value(0.85))
  ).current;
  const opacityAnims = useRef<Animated.Value[]>(
    lines.map(() => new Animated.Value(0.3))
  ).current;

  const activeIndex = getActiveIndex(lines, currentMs);

  const [selectedWord, setSelectedWord] = useState<SelectedWord | null>(null);

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
      // Don't scroll here — active line is about to expand so positions are stale.
      // Set a flag and let onLayout scroll once the new layout has settled.
      needsScrollRef.current = true;
    }

    prevActiveIndex.current = activeIndex;
  }, [activeIndex, animateLine, lines.length]);

  // Re-center when translation display changes (line height may shift).
  useEffect(() => {
    needsScrollRef.current = true;
  }, [translationMode, showContextual]);

  // While repeating, kill in-flight transitions and pin each line to its final value.
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

        // Bubble: find which fragment (if any) is selected on this active line
        const selFrag =
          isActive && selectedWord?.lineId === line.id
            ? (line.fragments?.find((f) => f.id === selectedWord?.fragmentId) ?? null)
            : null;
        const bubbleComponents = selFrag?.components ?? [];
        const showBubble = selFrag != null && (bubbleComponents.length > 0 || !!selFrag.meaning);

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
              const { y, height } = e.nativeEvent.layout;
              lineYPositions.current[index] = y;
              lineHeights.current[index] = height;
              // Scroll after layout settles so we use the correct expanded position.
              if (needsScrollRef.current && index === activeIndex) {
                needsScrollRef.current = false;
                const targetY = y - containerHeight / 2 + height / 2;
                scrollRef.current?.scrollTo({ y: Math.max(0, targetY), animated: true });
              }
            }}
          >
            <Pressable onPress={() => onLinePress(line)} style={styles.textBlock}>
              <View style={styles.bubbleAnchor}>
                {translationMode === 'literal' && isActive && hasFragments ? (
                  // ── Literal mode: word columns with meaning below, per-word bubble ──
                  <View style={styles.fragmentRow}>
                    {line.fragments.map((f) => {
                      const isWordActive =
                        isPlaying &&
                        currentMs >= f.timestamp_start * 1000 &&
                        currentMs < f.timestamp_end * 1000;
                      const isSelected =
                        selectedWord?.lineId === line.id &&
                        selectedWord?.fragmentId === f.id;
                      const components = f.components ?? [];
                      // In literal mode bubble only shows component breakdown
                      // (basic meaning is already visible below the word)
                      const showWordBubble = isSelected && components.length > 0;
                      return (
                        <Pressable
                          key={f.id}
                          onPress={() => handleWordPress(line.id, f.id)}
                          style={[
                            styles.fragmentCol,
                            isSelected && styles.fragmentColSelected,
                          ]}
                          hitSlop={4}
                        >
                          {showWordBubble && (
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
                                    <Text style={styles.componentHighlight}>{c.highlight}</Text>
                                    <Text style={styles.componentMeaning}>{c.meaning}</Text>
                                  </View>
                                ))}
                                <View style={styles.wordBubbleArrow} />
                              </View>
                            </View>
                          )}
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
                  // ── Contextual / none mode: single-line text, inline word taps ──
                  <>
                    {/* Above-line bubble for selected word */}
                    {showBubble && selFrag && (
                      <View style={styles.wordBubbleAnchor} pointerEvents="none">
                        <View style={styles.wordBubble}>
                          {bubbleComponents.length > 0 ? (
                            bubbleComponents.map((c, ci) => (
                              <View
                                key={ci}
                                style={[
                                  styles.componentItem,
                                  ci > 0 && styles.componentItemDivider,
                                ]}
                              >
                                <Text style={styles.componentHighlight}>{c.highlight}</Text>
                                <Text style={styles.componentMeaning}>{c.meaning}</Text>
                              </View>
                            ))
                          ) : (
                            <View style={styles.componentItem}>
                              <Text style={styles.componentHighlight}>{selFrag.word}</Text>
                              <Text style={styles.componentMeaning}>{selFrag.meaning}</Text>
                            </View>
                          )}
                          <View style={styles.wordBubbleArrow} />
                        </View>
                      </View>
                    )}

                    {isActive && hasFragments ? (
                      <Text style={styles.originalWord}>
                        {line.fragments.map((f, i) => {
                          const isWordActive =
                            isPlaying &&
                            currentMs >= f.timestamp_start * 1000 &&
                            currentMs < f.timestamp_end * 1000;
                          const isSelected =
                            selectedWord?.lineId === line.id &&
                            selectedWord?.fragmentId === f.id;
                          return (
                            <React.Fragment key={f.id}>
                              <Text
                                onPress={() => handleWordPress(line.id, f.id)}
                                style={(isWordActive || isSelected) ? styles.originalWordActive : undefined}
                              >
                                {f.word}
                              </Text>
                              {i < line.fragments.length - 1 ? ' ' : ''}
                            </React.Fragment>
                          );
                        })}
                      </Text>
                    ) : (
                      <Text style={styles.originalWord}>{line.text}</Text>
                    )}
                  </>
                )}
              </View>

              {/* Contextual translation — shown when the ⇄ button is toggled on */}
              {isActive && showContextual && line.translation ? (
                <Text style={styles.translationLine}>{line.translation}</Text>
              ) : null}
            </Pressable>

            {isActive && (
              <View style={styles.repeatRow}>
                {isRepeating && (
                  <Pressable
                    onPress={onPrevLine}
                    style={[styles.arrowButton, index === 0 && styles.arrowButtonDisabled]}
                    hitSlop={10}
                    disabled={index === 0}
                  >
                    <Text style={styles.arrowIcon}>‹</Text>
                  </Pressable>
                )}

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
                    onPress={onNextLine}
                    style={[
                      styles.arrowButton,
                      index === lines.length - 1 && styles.arrowButtonDisabled,
                    ]}
                    hitSlop={10}
                    disabled={index === lines.length - 1}
                  >
                    <Text style={styles.arrowIcon}>›</Text>
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
    rowGap: 10,
    columnGap: 12,
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
  literalWord: {
    fontSize: 15,
    color: '#aaaaaa',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 2,
  },
  literalWordActive: {
    color: '#ffd966',
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
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
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
  arrowButton: {
    width: 32,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#444444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.3,
  },
  arrowIcon: {
    fontSize: 22,
    color: '#cccccc',
    lineHeight: 24,
    marginTop: -2,
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
