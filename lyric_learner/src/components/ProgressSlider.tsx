import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';

interface Props {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function ProgressSlider({ positionMs, durationMs, onSeek }: Props) {
  const safeDuration = durationMs > 0 ? durationMs : 1;

  return (
    <View style={styles.container}>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={safeDuration}
        value={positionMs}
        onSlidingComplete={(val) => onSeek(val)}
        minimumTrackTintColor="#ffffff"
        maximumTrackTintColor="#333333"
        thumbTintColor="#ffffff"
      />
      <View style={styles.times}>
        <Text style={styles.timeText}>{formatTime(positionMs)}</Text>
        <Text style={styles.timeText}>{formatTime(durationMs)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    paddingHorizontal: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#666666',
  },
});
