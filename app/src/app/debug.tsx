// Debug screen: lists saved beacons and lets you add test ones, so storage can
// be tested without going outside. Later milestones add "simulate GPS loss" here.

import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { destinationPoint } from '../geo/distance';
import { formatAccuracy, formatCoordinates, formatTime } from '../lib/format';
import { useStore } from '../lib/StoreProvider';
import { useTheme } from '../lib/theme';
import { Button, Card, Label } from '../lib/ui';
import { useHikeData } from '../lib/useHikeData';

// Test beacons start at the big Haukkalampi parking area in Nuuksio.
const TEST_START = { lat: 60.30954, lon: 24.52085 };

export default function DebugScreen() {
  const theme = useTheme();
  const { store, changed } = useStore();
  // Show the hike in progress, or else the most recent one.
  const { hike, beacons } = useHikeData({ orLatest: true });

  const addTestBeacon = async () => {
    const target = (await store.getCurrentHike()) ?? (await store.startHike(Date.now()));
    const existing = await store.listBeacons(target.id);
    // Each test beacon is 150 m further along a path heading north-east, and
    // every third one is "estimated", so both kinds show up in the list.
    const n = existing.length;
    const position = destinationPoint(TEST_START, n * 150, 45);
    const estimated = n % 3 === 2;
    await store.addBeacon({
      hikeId: target.id,
      timestamp: Date.now(),
      lat: position.lat,
      lon: position.lon,
      source: estimated ? 'estimated' : 'gps',
      accuracyM: estimated ? 30 + n * 5 : 8,
      reason: n === 0 ? 'start' : 'manual',
      note: n === 0 ? 'Test: start of the hike' : null,
    });
    changed();
  };

  const deleteEverything = () => {
    Alert.alert('Delete all data?', 'This deletes every hike, beacon and setting on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          await store.deleteEverything();
          changed();
        },
      },
    ]);
  };

  return (
    <FlatList
      data={beacons}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.page}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={{ color: theme.muted }}>
            {hike
              ? `${hike.status === 'ended' ? 'Last hike' : 'Hike in progress'}, started ${formatTime(hike.startedAt)}: ${beacons.length} beacon(s).`
              : 'No hikes saved yet.'}{' '}
            Close the app completely and open it again: everything here should still be listed.
          </Text>
          <Button label="Add test beacon" onPress={addTestBeacon} />
          <Button label="Delete all data" kind="danger" onPress={deleteEverything} />
        </View>
      }
      renderItem={({ item, index }) => (
        <Card style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={[styles.title, { color: theme.text }]}>
              #{index + 1} · {formatTime(item.timestamp)}
            </Text>
            <Text style={{ color: item.source === 'gps' ? theme.accent : theme.estimated, fontWeight: '600' }}>
              {item.source === 'gps' ? 'GPS' : 'Estimated'} {formatAccuracy(item.accuracyM)}
            </Text>
          </View>
          <Label>Reason: {item.reason}</Label>
          <Text style={[styles.mono, { color: theme.muted }]}>{formatCoordinates(item.lat, item.lon)}</Text>
          {item.note && <Text style={{ color: theme.text }}>“{item.note}”</Text>}
        </Card>
      )}
      ListEmptyComponent={<Text style={{ color: theme.muted }}>No beacons yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  header: { gap: 10, marginBottom: 6 },
  row: { gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mono: { fontVariant: ['tabular-nums'], fontSize: 13 },
});
