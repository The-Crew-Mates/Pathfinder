// Debug screen: shows what's saved on this device and lets you add test data,
// so beacon storage can be tested without going outside. It can also pretend
// GPS is lost during a walk, and replay a recorded walk, to test dead reckoning.
//
// Open it with "Debug tools" at the bottom of the Confidence screen, or by
// adding #debug to the address.

import { useEffect, useState } from 'react';

import { DEFAULT_SETTINGS, SETTING_FIELDS, type Settings } from '../../beacons/settings';
import { storageUsedBytes } from '../../beacons/persistence';
import type { Beacon, Hike } from '../../beacons/types';
import { DEFAULT_STEP_LENGTH_M } from '../../geo/deadReckoning';
import { destinationPoint } from '../../geo/distance';
import { formatAccuracy, formatCoordinates, formatTime } from '../../lib/format';
import { useStore } from '../../lib/StoreProvider';
import { useHikeData } from '../../lib/useHikeData';
import { useHike } from '../../tracking/HikeProvider';
import { type ReplayReport, replay } from '../../tracking/recording';
import type { SensorStatus } from '../../tracking/sensors';

// Test beacons start at the big Haukkalampi parking area in Nuuksio.
const TEST_START = { lat: 60.30954, lon: 24.52085 };

interface DebugScreenProps {
  isDark: boolean;
  onBack: () => void;
}

export function DebugScreen({ isDark, onBack }: DebugScreenProps) {
  const context = useStore();
  const { hike, beacons, loading } = useHikeData({ orLatest: true });
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const version = context?.version;
  useEffect(() => {
    let stillWanted = true;
    storageUsedBytes().then((bytes) => {
      if (stillWanted) setUsedBytes(bytes);
    });
    return () => {
      stillWanted = false;
    };
  }, [version]);

  const card = `rounded-3xl p-4 shadow-sm border flex flex-col gap-3 ${
    isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
  }`;
  const label = 'font-space text-[11px] uppercase tracking-wider text-[#92d4b7] font-bold';
  const muted = isDark ? 'text-[#8fa39b]' : 'text-slate-500';
  const button = (kind: 'primary' | 'secondary' | 'danger') =>
    `px-4 py-3 rounded-xl font-space text-[13px] font-bold border active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 ${
      kind === 'primary'
        ? 'bg-[#34d399] text-[#062a1d] border-[#34d399]'
        : kind === 'danger'
          ? 'text-[#f87171] border-[#7f1d1d] bg-transparent'
          : `bg-transparent ${isDark ? 'text-[#aef1d2] border-[#233a32]' : 'text-emerald-800 border-slate-300'}`
    }`;

  /** Run a store action, report errors, and tell the screens data changed. */
  const run = async (action: () => Promise<string | void>) => {
    if (!context) return;
    try {
      const result = await action();
      setMessage(result ?? null);
      context.changed();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const addTestBeacon = () =>
    run(async () => {
      const store = context!.store;
      const target = (await store.getCurrentHike()) ?? (await store.startHike(Date.now()));
      const n = (await store.listBeacons(target.id)).length;
      // Each test beacon is 150 m further along a path heading north-east, and
      // every third one is "estimated", so both kinds show up in the list.
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
      return `Test beacon #${n + 1} saved.`;
    });

  const attachPhoto = (file: File | undefined) => {
    const last = beacons.at(-1);
    if (!file || !last) return;
    run(async () => {
      await context!.store.setBeaconPhoto(last.id, { type: file.type || 'image/jpeg', data: await file.arrayBuffer() });
      return `Photo (${Math.round(file.size / 1024)} KB) saved on beacon #${beacons.length}.`;
    });
  };

  const deleteEverything = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    run(async () => {
      await context!.store.deleteEverything();
      return 'Everything on this device was deleted.';
    });
  };

  const persistenceText = {
    checking: 'Checking…',
    persistent: 'Kept permanently: the browser won’t delete it to free space.',
    'best-effort': 'Not guaranteed: the browser may delete it if the phone runs out of space. Adding the app to the home screen usually fixes this.',
    unsupported: 'This browser can’t promise to keep it.',
  }[context?.persistence ?? 'checking'];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b1311] text-white' : 'bg-[#effcf7] text-slate-900'}`}>
      <div className="h-14 px-3 flex items-center gap-1 pt-safe">
        <button
          aria-label="Go back"
          onClick={onBack}
          className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
            isDark ? 'text-white hover:bg-[#1b2b25]' : 'text-slate-800 hover:bg-slate-200'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back_ios_new</span>
        </button>
        <div className="flex flex-col min-w-0">
          <h1 className="text-[16px] font-bold leading-tight">Pathfinder Debug Tools</h1>
          <span className={label}>Beacons saved on this device</span>
        </div>
      </div>

      <div className="px-4 pb-24 flex flex-col gap-4">
        {!context ? (
          <p className={muted}>Opening storage…</p>
        ) : (
          <>
            <section className={card}>
              <span className={label}>Storage</span>
              <p className="text-[14px]">{persistenceText}</p>
              {usedBytes !== null && (
                <p className={`text-[13px] ${muted}`}>Using {(usedBytes / 1024).toFixed(0)} KB on this device.</p>
              )}
              <p className={`text-[13px] ${muted}`}>
                Close the app completely and open it again: everything below should still be here.
              </p>
            </section>

            <section className={card}>
              <span className={label}>Hike</span>
              <p className="text-[14px]">
                {loading
                  ? 'Loading…'
                  : hike
                    ? hike.replayOf
                      ? `Replay made ${formatTime(hike.startedAt)}: ${beacons.length} beacon(s).`
                      : `${hike.status === 'ended' ? 'Last hike' : hike.status === 'paused' ? 'Paused hike' : 'Hike in progress'}, started ${formatTime(hike.startedAt)}: ${beacons.length} beacon(s).`
                    : 'No hikes saved yet.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className={button('primary')} onClick={addTestBeacon}>
                  Add test beacon
                </button>
                {hike && hike.status !== 'ended' && (
                  <button
                    className={button('secondary')}
                    onClick={() => run(async () => context.store.setHikeStatus(hike.id, 'ended', Date.now()).then(() => 'Hike ended.'))}
                  >
                    End hike
                  </button>
                )}
                <label className={`${button('secondary')} ${beacons.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
                  Photo on last beacon
                  <input
                    id="debug-photo"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      attachPhoto(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <button className={button('danger')} onClick={deleteEverything}>
                {confirmingDelete ? 'Tap again to delete all data on this device' : 'Delete all data'}
              </button>
              {message && <p className="text-[13px] text-[#34d399]">{message}</p>}
            </section>

            <DeadReckoningCard card={card} label={label} muted={muted} button={button} />
            <ReplayCard card={card} label={label} muted={muted} button={button} isDark={isDark} />

            <section className="flex flex-col gap-2">
              <span className={`${label} px-1`}>Beacons ({beacons.length})</span>
              {beacons.length === 0 && <p className={`text-[14px] px-1 ${muted}`}>No beacons yet.</p>}
              {beacons.map((beacon, index) => (
                <BeaconRow key={beacon.id} beacon={beacon} number={index + 1} isDark={isDark} />
              ))}
            </section>

            <SettingsForm isDark={isDark} card={card} label={label} muted={muted} button={button} />
          </>
        )}
      </div>
    </div>
  );
}

function BeaconRow({ beacon, number, isDark }: { beacon: Beacon; number: number; isDark: boolean }) {
  const context = useStore();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!beacon.hasPhoto || !context) return;
    let url: string | null = null;
    let stillWanted = true;
    context.store.getBeaconPhoto(beacon.id).then((blob) => {
      if (!blob || !stillWanted) return;
      url = URL.createObjectURL(blob);
      setPhotoUrl(url);
    });
    return () => {
      stillWanted = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [beacon.id, beacon.hasPhoto, context]);

  const gps = beacon.source === 'gps';
  return (
    <div
      className={`rounded-2xl p-3 border flex gap-3 ${isDark ? 'bg-[#121c19] border-[#1e302a]' : 'bg-white border-slate-200'}`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="font-space text-[14px] font-bold tabular-nums">
            #{number} · {formatTime(beacon.timestamp)}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full font-space text-[11px] font-bold border ${
              gps ? 'text-[#34d399] border-[#1f4d3b]' : 'text-amber-300 border-amber-800'
            }`}
          >
            {gps ? 'GPS' : 'Estimated'} {formatAccuracy(beacon.accuracyM)}
          </span>
        </div>
        <span className="font-space text-[11px] uppercase tracking-wider text-[#92d4b7]">Reason: {beacon.reason}</span>
        <span className={`font-space text-[12px] tabular-nums ${isDark ? 'text-[#8fa39b]' : 'text-slate-500'}`}>
          {formatCoordinates(beacon.lat, beacon.lon)}
        </span>
        {beacon.note && <span className="text-[13px]">“{beacon.note}”</span>}
      </div>
      {photoUrl && <img src={photoUrl} alt={`Photo at beacon ${number}`} className="w-16 h-16 rounded-xl object-cover" />}
    </div>
  );
}

type CardStyles = {
  card: string;
  label: string;
  muted: string;
  button: (kind: 'primary' | 'secondary' | 'danger') => string;
};

const SENSOR_TEXT: Record<SensorStatus, string> = {
  off: 'off (no hike)',
  waiting: 'starting…',
  active: 'working',
  unavailable: 'not on this device',
  'needs-permission': 'needs a tap to allow',
  denied: 'blocked',
};

/** Sensors, what dead reckoning has learned, and the "Simulate GPS loss" switch. */
function DeadReckoningCard({ card, label, muted, button }: CardStyles) {
  const { hike, sensors, steps, calibration, position, simulatingGpsLoss, truth, setSimulateGpsLoss } = useHike();
  const offset = Math.round(calibration.headingOffset);
  return (
    <section className={card}>
      <span className={label}>Dead reckoning</span>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]">
        <span className={muted}>Step counter</span>
        <span>{SENSOR_TEXT[sensors.motion]}</span>
        <span className={muted}>Compass</span>
        <span>{SENSOR_TEXT[sensors.compass]}</span>
        <span className={muted}>Steps this hike</span>
        <span className="tabular-nums">{steps}</span>
        <span className={muted}>Step length</span>
        <span className="tabular-nums">
          {calibration.stepLengthM.toFixed(2)} m{' '}
          <span className={muted}>
            {calibration.stepLengthSamples > 0 ? `(learned ×${calibration.stepLengthSamples})` : '(not learned yet)'}
          </span>
        </span>
        <span className={muted}>Phone vs. walking</span>
        <span className="tabular-nums">
          {offset > 0 ? '+' : ''}
          {offset}°{' '}
          <span className={muted}>{calibration.headingSamples > 0 ? `(learned ×${calibration.headingSamples})` : '(not learned yet)'}</span>
        </span>
        <span className={muted}>Position</span>
        <span>{position ? `${position.source === 'gps' ? 'GPS' : 'Estimated'} ${formatAccuracy(position.accuracyM)}` : '—'}</span>
      </div>
      <p className={`text-[13px] ${muted}`}>
        Learning needs a few minutes of walking with GPS: it compares your steps and compass with where GPS says you went.
      </p>
      <button
        className={button(simulatingGpsLoss ? 'danger' : 'primary')}
        disabled={!hike || hike.status !== 'active'}
        onClick={() => setSimulateGpsLoss(!simulatingGpsLoss)}
      >
        {simulatingGpsLoss ? 'Stop simulating: use GPS again' : 'Simulate GPS loss'}
      </button>
      {!hike && <p className={`text-[13px] ${muted}`}>Start a hike on the Live screen to simulate GPS loss.</p>}
      {simulatingGpsLoss && (
        <p className="text-[14px] text-amber-300">
          {truth
            ? `Real GPS (${formatTime(truth.at)}): the estimate is ${Math.round(truth.errorM)} m away. It says it could be up to ${formatAccuracy(truth.estimatedAccuracyM)} off.`
            : 'GPS is hidden from the app, but still read in the background so the estimate can be checked. The first check comes with the next GPS fix.'}
        </p>
      )}
    </section>
  );
}

/** Replay a recorded walk with dead reckoning, optionally hiding GPS for a stretch. */
function ReplayCard({ card, label, muted, button, isDark }: CardStyles & { isDark: boolean }) {
  const context = useStore();
  const { hike: current } = useHike();
  const [recorded, setRecorded] = useState<Hike[]>([]);
  const [chosen, setChosen] = useState<string>('');
  const [duration, setDuration] = useState<{ from: number; to: number } | null>(null);
  const [hideFrom, setHideFrom] = useState('');
  const [hideTo, setHideTo] = useState('');
  const [report, setReport] = useState<ReplayReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const version = context?.version;
  useEffect(() => {
    if (!context) return;
    let stillWanted = true;
    (async () => {
      const hikes = (await context.store.listHikes()).filter((h) => h.status === 'ended' && !h.replayOf);
      const withReadings: Hike[] = [];
      for (const h of hikes) if (await context.store.hasReadings(h.id)) withReadings.push(h);
      if (stillWanted) setRecorded(withReadings);
    })();
    return () => {
      stillWanted = false;
    };
  }, [context, version]);

  // When a walk is chosen, find how long it was and suggest hiding GPS for its middle third.
  useEffect(() => {
    if (!context || !chosen) return;
    let stillWanted = true;
    context.store.getReadings(chosen).then((readings) => {
      if (!stillWanted || readings.length === 0) return;
      const from = readings[0].t;
      const to = readings.at(-1)!.t;
      const minutes = (to - from) / 60_000;
      setDuration({ from, to });
      setHideFrom(String(Math.round(minutes / 3)));
      setHideTo(String(Math.round((2 * minutes) / 3)));
      setReport(null);
    });
    return () => {
      stillWanted = false;
    };
  }, [context, chosen]);

  if (!context) return null;
  const busy = current !== null;

  const run = async () => {
    try {
      const { store } = context;
      const readings = await store.getReadings(chosen);
      const settings = await store.getSettings();
      const stepLengthM = (await store.getLearnedStepLength()) ?? DEFAULT_STEP_LENGTH_M;
      const from = Number(hideFrom.replace(',', '.'));
      const to = Number(hideTo.replace(',', '.'));
      const start = readings[0]?.t ?? 0;
      const hideGps =
        hideFrom.trim() !== '' && hideTo.trim() !== '' && Number.isFinite(from) && Number.isFinite(to) && to > from
          ? { from: start + from * 60_000, to: start + to * 60_000 }
          : null;
      const result = replay(readings, { settings, stepLengthM, hideGps });
      const saved = await store.addReplayHike(chosen, Date.now());
      for (const drop of result.drops) {
        await store.addBeacon({
          hikeId: saved.id,
          timestamp: drop.timestamp,
          lat: drop.position.lat,
          lon: drop.position.lon,
          source: drop.source,
          accuracyM: drop.accuracyM,
          reason: drop.reason,
        });
      }
      setReport(result);
      setMessage(
        `Replayed with GPS ${hideGps ? `hidden from minute ${from} to ${to}` : 'as recorded'}. Its beacons are listed below.`,
      );
      context.changed();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const input = `w-20 rounded-xl px-3 py-2 border font-space text-[15px] tabular-nums ${
    isDark ? 'bg-[#0b1311] border-[#233a32] text-white' : 'bg-white border-slate-300 text-slate-900'
  }`;
  return (
    <section className={card}>
      <span className={label}>Replay a recorded walk</span>
      <p className={`text-[13px] ${muted}`}>
        Every hike records its GPS positions, steps and compass. Replaying one runs dead reckoning again with the current
        settings, and can hide GPS for a stretch to see how far off the estimate would have been.
      </p>
      {recorded.length === 0 ? (
        <p className={`text-[14px] ${muted}`}>No recorded walks yet. Hikes record automatically; end one to replay it.</p>
      ) : (
        <>
          <select
            aria-label="Recorded walk"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className={`rounded-xl px-3 py-2 border text-[14px] ${isDark ? 'bg-[#0b1311] border-[#233a32] text-white' : 'bg-white border-slate-300'}`}
          >
            <option value="">Choose a walk…</option>
            {recorded.map((h) => (
              <option key={h.id} value={h.id}>
                {formatTime(h.startedAt)}
                {h.endedAt ? ` (${Math.round((h.endedAt - h.startedAt) / 60_000)} min)` : ''}
              </option>
            ))}
          </select>
          {chosen && duration && (
            <div className="flex items-center gap-2 flex-wrap text-[14px]">
              <span>Hide GPS from minute</span>
              <input aria-label="Hide GPS from minute" inputMode="decimal" className={input} value={hideFrom} onChange={(e) => setHideFrom(e.target.value)} />
              <span>to</span>
              <input aria-label="Hide GPS to minute" inputMode="decimal" className={input} value={hideTo} onChange={(e) => setHideTo(e.target.value)} />
              <span className={muted}>of {Math.round((duration.to - duration.from) / 60_000)}</span>
            </div>
          )}
          <button className={button('primary')} disabled={!chosen || busy} onClick={() => void run()}>
            Replay
          </button>
          {busy && <p className={`text-[13px] ${muted}`}>End the current hike first: a replay is saved as a hike of its own.</p>}
        </>
      )}
      {message && <p className="text-[13px] text-[#34d399]">{message}</p>}
      {report && <ReplayResult report={report} muted={muted} />}
    </section>
  );
}

function ReplayResult({ report, muted }: { report: ReplayReport; muted: string }) {
  const estimated = report.drops.filter((d) => d.source === 'estimated').length;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]">
      <span className={muted}>Steps</span>
      <span className="tabular-nums">{report.steps}</span>
      <span className={muted}>Step length learned</span>
      <span className="tabular-nums">{report.calibration.stepLengthM.toFixed(2)} m</span>
      <span className={muted}>Phone vs. walking</span>
      <span className="tabular-nums">{Math.round(report.calibration.headingOffset)}°</span>
      <span className={muted}>Beacons</span>
      <span className="tabular-nums">
        {report.drops.length} ({estimated} estimated)
      </span>
      <span className={muted}>Hidden GPS fixes</span>
      <span className="tabular-nums">{report.hiddenFixes}</span>
      <span className={muted}>Worst error</span>
      <span className="tabular-nums">{report.worstErrorM === null ? '—' : `${Math.round(report.worstErrorM)} m`}</span>
      {report.returns.map((r) => (
        <div key={r.at} className="contents">
          <span className={muted}>GPS back {formatTime(r.at)}</span>
          <span className="tabular-nums">
            {Math.round(r.errorM)} m off <span className={muted}>(said {formatAccuracy(r.estimatedAccuracyM)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

type SettingsFormProps = {
  isDark: boolean;
  card: string;
  label: string;
  muted: string;
  button: (kind: 'primary' | 'secondary' | 'danger') => string;
};

function SettingsForm({ isDark, card, label, muted, button }: SettingsFormProps) {
  const context = useStore();
  const [draft, setDraft] = useState<Record<keyof Settings, string> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const toDraft = (settings: Settings) =>
    Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])) as Record<keyof Settings, string>;

  useEffect(() => {
    if (!context) return;
    let stillWanted = true;
    context.store.getSettings().then((s) => {
      if (stillWanted) setDraft(toDraft(s));
    });
    return () => {
      stillWanted = false;
    };
  }, [context]);

  if (!context || !draft) return null;

  const save = async () => {
    const found = await context.store.saveSettings(draft);
    setProblems(found);
    setMessage(found.length === 0 ? 'Settings saved.' : null);
  };

  const reset = async () => {
    await context.store.resetSettings();
    setDraft(toDraft(DEFAULT_SETTINGS));
    setProblems([]);
    setMessage('Back to the default values.');
  };

  return (
    <section className={card}>
      <span className={label}>Settings</span>
      <p className={`text-[13px] ${muted}`}>A beacon is dropped when the first of the time, distance or turn rules is met.</p>
      {SETTING_FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <label htmlFor={`setting-${field.key}`} className="text-[14px] font-semibold">
            {field.label}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`setting-${field.key}`}
              inputMode="decimal"
              value={draft[field.key]}
              onChange={(e) => {
                setDraft({ ...draft, [field.key]: e.target.value });
                setMessage(null);
              }}
              className={`flex-1 min-w-0 rounded-xl px-3 py-2 border font-space text-[15px] tabular-nums ${
                isDark ? 'bg-[#0b1311] border-[#233a32] text-white' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <span className={`w-9 font-space text-[13px] ${muted}`}>{field.unit}</span>
          </div>
          <span className={`text-[12px] ${muted}`}>
            {field.help} Default {DEFAULT_SETTINGS[field.key]} {field.unit}, allowed {field.min}–{field.max}.
          </span>
        </div>
      ))}
      {problems.map((p) => (
        <p key={p} className="text-[13px] text-[#f87171]">
          {p}
        </p>
      ))}
      {message && <p className="text-[13px] text-[#34d399]">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={button('primary')} onClick={save}>
          Save settings
        </button>
        <button className={button('secondary')} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </section>
  );
}
