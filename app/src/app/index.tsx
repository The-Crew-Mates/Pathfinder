// The hike screen: start and end a hike, and see how many beacons are saved.

import { Link } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatTime } from '../lib/format';
import { useStore } from '../lib/StoreProvider';
import { useTheme } from '../lib/theme';
import { Button, Card, Label } from '../lib/ui';
import { useHikeData } from '../lib/useHikeData';

export default function HikeScreen() {
  const theme = useTheme();
  const { store, changed } = useStore();
  const { hike, beacons } = useHikeData();

  const start = async () => {
    try {
      await store.startHike(Date.now());
      changed();
    } catch (e) {
      Alert.alert('Couldn’t start the hike', e instanceof Error ? e.message : String(e));
    }
  };

  const end = () => {
    if (!hike) return;
    Alert.alert('End this hike?', 'Its beacons stay saved, but no new ones will be dropped.', [
      { text: 'Keep hiking', style: 'cancel' },
      {
        text: 'End hike',
        style: 'destructive',
        onPress: async () => {
          await store.setHikeStatus(hike.id, 'ended', Date.now());
          changed();
        },
      },
    ]);
  };

  const last = beacons.at(-1);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card>
        <Label>{hike ? 'Hike in progress' : 'No hike in progress'}</Label>
        {hike ? (
          <>
            <Text style={[styles.big, { color: theme.text }]}>
              {beacons.length} {beacons.length === 1 ? 'beacon' : 'beacons'} saved
            </Text>
            <Text style={{ color: theme.muted }}>
              Started {formatTime(hike.startedAt)}
              {last ? ` · last beacon ${formatTime(last.timestamp)}` : ''}
            </Text>
            <Button label="End hike" kind="danger" onPress={end} />
          </>
        ) : (
          <>
            <Text style={{ color: theme.text }}>
              Start a hike and Pathfinder saves beacons along your way, so you can find your way back without GPS.
            </Text>
            <Button label="Start hike" onPress={start} />
          </>
        )}
      </Card>

      <Card>
        <Label>Retrace</Label>
        <Text style={{ color: theme.muted }}>
          Walk back beacon by beacon with the compass. Coming in a later version.
        </Text>
        <Button label="Retrace my steps" kind="secondary" disabled onPress={() => {}} />
      </Card>

      <Text style={[styles.devNote, { color: theme.muted }]}>
        This version saves beacons but doesn’t drop them automatically yet. Add test beacons on the Debug screen.
      </Text>

      <View style={styles.links}>
        <Link href="/debug" style={[styles.link, { color: theme.accent }]}>
          Debug: beacons
        </Link>
        <Link href="/settings" style={[styles.link, { color: theme.accent }]}>
          Settings
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  big: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  devNote: { fontSize: 13, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  link: { fontSize: 16, fontWeight: '600', paddingVertical: 8 },
});
