import { FlatList, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import SONGS from '../src/data/songs_manifest';
import { SongManifestEntry } from '../src/types';

export default function SongListScreen() {
  const renderItem = ({ item }: { item: SongManifestEntry }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(`/player?songId=${item.id}`)}
    >
      <View style={styles.albumArt}>
        <Text style={styles.albumArtEmoji}>🎵</Text>
      </View>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.songInfo.song_english}
        </Text>
        <Text style={styles.artistName} numberOfLines={1}>
          {item.songInfo.artist_english}
        </Text>
        <Text style={styles.songOriginal} numberOfLines={1}>
          {item.songInfo.song_original} · {item.songInfo.artist_original}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lyric Learner</Text>
        <Text style={styles.headerSub}>Korean songs with translations</Text>
      </View>
      <FlatList
        data={SONGS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: '#1a1a1a',
  },
  albumArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  albumArtEmoji: {
    fontSize: 24,
  },
  songInfo: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  artistName: {
    fontSize: 13,
    color: '#aaaaaa',
  },
  songOriginal: {
    fontSize: 12,
    color: '#555555',
  },
  chevron: {
    fontSize: 22,
    color: '#444444',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 78,
  },
});
