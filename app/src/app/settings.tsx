// Settings: the configurable beacon and GPS values.

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DEFAULT_SETTINGS, SETTING_FIELDS, type Settings } from '../beacons/settings';
import { useStore } from '../lib/StoreProvider';
import { useTheme } from '../lib/theme';
import { Button, Card } from '../lib/ui';

type Draft = Record<keyof Settings, string>;

const toDraft = (settings: Settings): Draft =>
  Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Draft;

export default function SettingsScreen() {
  const theme = useTheme();
  const { store, changed } = useStore();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    store.getSettings().then((s) => setDraft(toDraft(s)));
  }, [store]);

  if (!draft) return null;

  const save = async () => {
    const found = await store.saveSettings(draft);
    setProblems(found);
    setMessage(found.length === 0 ? 'Saved.' : null);
    if (found.length === 0) changed();
  };

  const reset = async () => {
    await store.resetSettings();
    setDraft(toDraft(DEFAULT_SETTINGS));
    setProblems([]);
    setMessage('Back to the default values.');
    changed();
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={{ color: theme.muted }}>
        A beacon is dropped when the first of the time, distance or turn rules is met.
      </Text>
      {SETTING_FIELDS.map((field) => (
        <Card key={field.key}>
          <Text nativeID={`label-${field.key}`} style={[styles.fieldLabel, { color: theme.text }]}>
            {field.label}
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              id={`setting-${field.key}`}
              accessibilityLabelledBy={`label-${field.key}`}
              value={draft[field.key]}
              onChangeText={(text) => {
                setDraft({ ...draft, [field.key]: text });
                setMessage(null);
              }}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            />
            <Text style={[styles.unit, { color: theme.muted }]}>{field.unit}</Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 13 }}>
            {field.help} Default {DEFAULT_SETTINGS[field.key]} {field.unit}, allowed {field.min}–{field.max}.
          </Text>
        </Card>
      ))}
      {problems.map((p) => (
        <Text key={p} style={{ color: theme.danger }}>
          {p}
        </Text>
      ))}
      {message && <Text style={{ color: theme.accent }}>{message}</Text>}
      <Button label="Save settings" onPress={save} />
      <Button label="Reset to defaults" kind="secondary" onPress={reset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  fieldLabel: { fontSize: 16, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontVariant: ['tabular-nums'] },
  unit: { width: 36, fontSize: 15 },
});
