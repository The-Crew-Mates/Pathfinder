// Hike mode on the Live Navigation screen: the GPS status bar at the top, the
// mascot's message, and the panel to start/end a hike and drop beacons.
// Styled to match the frontend team's design.

import { useState } from 'react';

import { formatAccuracy, formatTime } from '../../lib/format';
import { type HikeContextValueForUi, useHike } from '../../tracking/HikeProvider';

function minutesAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

/** The thin bar at the very top: what GPS is doing right now, and the battery. */
export function GpsStatusBanner({ isDark }: { isDark: boolean }) {
  const { hike, gps, gpsBack, lastFix, position, battery } = useHike();

  const tone: 'neutral' | 'good' | 'warn' | 'bad' = !hike
    ? 'neutral'
    : gps === 'good'
      ? 'good'
      : gps === 'denied' || gps === 'unsupported'
        ? 'bad'
        : 'warn';
  const text = !hike
    ? 'Not tracking · Start a hike below'
    : gps === 'good'
      ? `${gpsBack ? 'GPS is back' : 'GPS'} ${lastFix ? formatAccuracy(lastFix.accuracyM) : ''} · Tracking`
      : gps === 'searching'
        ? 'Finding GPS…'
        : gps === 'lost'
          ? position?.source === 'estimated'
            ? `GPS lost · estimated ${formatAccuracy(position.accuracyM)}`
            : `GPS lost · last fix ${lastFix ? minutesAgo(lastFix.timestamp) : 'never'}`
          : gps === 'denied'
            ? 'Location blocked'
            : gps === 'unsupported'
              ? 'No GPS in this browser'
              : 'Starting…';

  const colours = {
    neutral: isDark ? 'bg-white/5 border-white/10 text-[#8fa39b]' : 'bg-slate-500/10 border-slate-300 text-slate-600',
    good: isDark ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800',
    warn: isDark ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-700',
    bad: isDark ? 'bg-red-500/15 border-red-500/30 text-red-300' : 'bg-red-500/10 border-red-500/20 text-red-700',
  }[tone];

  return (
    <div className={`h-6 px-4 flex items-center justify-between font-space text-[11px] border-b ${colours}`} role="status">
      <div className="flex items-center gap-1.5 font-bold tracking-wide uppercase min-w-0">
        {(tone === 'warn' || gpsBack) && <span className="h-2 w-2 rounded-full bg-current inline-block animate-ping shrink-0" />}
        <span className="material-symbols-outlined text-[14px]">{tone === 'good' || tone === 'neutral' ? 'satellite_alt' : 'gps_off'}</span>
        <span className="truncate">{text}</span>
      </div>
      {battery && (
        <div className="flex items-center gap-0.5 font-semibold shrink-0" title="Battery">
          <span className="tabular-nums">{battery.percent}%</span>
          <span className="material-symbols-outlined text-[14px]">{battery.charging ? 'battery_charging_90' : 'battery_5_bar'}</span>
        </div>
      )}
    </div>
  );
}

/** What the mascot says, and the label next to its name, for the current hike state. */
export function scoutMessage(
  state: Pick<HikeContextValueForUi, 'hike' | 'gps' | 'gpsBack' | 'beacons' | 'position' | 'sensors'>,
): {
  badge: string;
  text: string;
} {
  const { hike, gps, gpsBack, beacons, position, sensors } = state;
  if (!hike) {
    return { badge: 'Ready', text: '“Start a hike and I’ll drop beacons along the way, so we can always find our way back.”' };
  }
  if (gps === 'denied') {
    return { badge: 'Location blocked', text: '“I can’t see where we are. Allow location for this site, then start again.”' };
  }
  if (gps === 'unsupported') return { badge: 'No GPS', text: '“This browser can’t use GPS, so I can’t drop beacons here.”' };
  if (gps === 'searching') return { badge: 'Finding GPS', text: '“Looking for satellites… Stand in the open for a moment if you can.”' };
  if (gps === 'lost' && position?.source === 'estimated' && sensors.motion === 'active') {
    return {
      badge: 'Estimating',
      text: `“No GPS, so I’m counting your steps and following the compass. We’re within about ${Math.round(position.accuracyM)} m of the dot.”`,
    };
  }
  if (gps === 'lost') return { badge: 'GPS lost', text: '“I’ve lost GPS. Your beacons are safe, and I’ll keep looking for a signal.”' };
  if (gpsBack) return { badge: 'GPS is back', text: '“GPS is back! Our position is precise again.”' };
  const n = beacons.length;
  return { badge: 'Tracking', text: `“Got you! ${n} ${n === 1 ? 'beacon' : 'beacons'} saved so far. I’ll keep dropping them as we go.”` };
}

/** Start or end a hike, see how it's going, and drop a beacon by hand. */
export function HikePanel({ isDark }: { isDark: boolean }) {
  const { hike, beacons, gps, lastFix, position, sensors, wakeLock, problem, startHike, endHike, dropBeaconHere, enableSensors } =
    useHike();
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const card = `w-full p-3 rounded-2xl backdrop-blur-md border shadow-md flex flex-col gap-2.5 ${
    isDark ? 'bg-[#111F1B]/95 border-[#1E362E]' : 'bg-white/90 border-slate-200'
  }`;
  const label = `font-space text-[10px] uppercase font-bold ${isDark ? 'text-[#8FA39B]' : 'text-slate-500'}`;
  const value = 'font-space text-[14px] font-bold tabular-nums';
  const primary =
    'w-full py-3 rounded-xl bg-[#10B981] text-[#064E3B] font-space text-[14px] font-extrabold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5';
  const secondary = `flex-1 py-2.5 rounded-xl border font-space text-[12px] font-bold active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1 ${
    isDark ? 'bg-[#182823] text-[#CFE4DC] border-[#24413a]' : 'bg-slate-100 text-slate-700 border-slate-200'
  }`;

  const last = beacons.at(-1);

  if (!hike) {
    return (
      <div className={card}>
        <span className={label}>Hike mode</span>
        <p className={`text-[13px] leading-snug ${isDark ? 'text-[#CFE4DC]' : 'text-slate-700'}`}>
          Pathfinder drops beacons along your way, so you can find your way back without GPS. Keep the app open:
          the screen stays on while you hike.
        </p>
        <button className={primary} onClick={() => void startHike()}>
          <span className="material-symbols-outlined text-[20px]">flag</span>
          Start hike
        </button>
        {problem && <p className="text-[12px] text-red-400">{problem}</p>}
      </div>
    );
  }

  const saveDrop = async () => {
    await dropBeaconHere(note.trim() || undefined, photo ?? undefined);
    setDropping(false);
    setNote('');
    setPhoto(null);
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <span className={label}>Hike in progress · since {formatTime(hike.startedAt)}</span>
        <span className={`${label} flex items-center gap-1`}>
          <span className="material-symbols-outlined text-[13px]">{wakeLock === 'on' ? 'check_circle' : 'warning'}</span>
          {wakeLock === 'on' ? 'Screen stays on' : 'Keep the screen on'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className={label}>Beacons</span>
          <span className={value}>{beacons.length}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className={label}>Last beacon</span>
          <span className={`${value} truncate`}>{last ? `${formatTime(last.timestamp)} · ${last.reason}` : '—'}</span>
        </div>
        <div className="flex flex-col">
          <span className={label}>{position?.source === 'estimated' ? 'Estimated' : 'GPS'}</span>
          <span className={value}>
            {position?.source === 'estimated'
              ? formatAccuracy(position.accuracyM)
              : gps === 'good' && lastFix
                ? formatAccuracy(lastFix.accuracyM)
                : gps === 'lost'
                  ? 'Lost'
                  : '…'}
          </span>
        </div>
      </div>

      {(sensors.motion === 'needs-permission' || sensors.motion === 'denied') && (
        <button className={secondary} onClick={() => void enableSensors()}>
          <span className="material-symbols-outlined text-[16px]">directions_walk</span>
          {sensors.motion === 'denied'
            ? 'Motion sensors blocked: tap to try again'
            : 'Tap to turn on step counting and the compass'}
        </button>
      )}

      {dropping ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="beacon-note" className={label}>
            Note for this beacon (optional)
          </label>
          <input
            id="beacon-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Big split rock, keep left"
            className={`rounded-xl px-3 py-2 border text-[14px] ${
              isDark ? 'bg-[#0b1311] border-[#24413a] text-white placeholder:text-[#5e7169]' : 'bg-white border-slate-300'
            }`}
          />
          <div className="flex gap-2">
            <label className={secondary}>
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              {photo ? 'Photo added' : 'Add photo'}
              <input
                id="beacon-photo"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className={secondary} onClick={() => setDropping(false)}>
              Cancel
            </button>
          </div>
          <button className={primary} onClick={() => void saveDrop()}>
            <span className="material-symbols-outlined text-[20px]">pin_drop</span>
            Save beacon here
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className={secondary} onClick={() => setDropping(true)}>
            <span className="material-symbols-outlined text-[16px]">pin_drop</span>
            Drop beacon here
          </button>
          <button
            className={`${secondary} ${confirmingEnd ? '!text-red-400 !border-red-900' : ''}`}
            onClick={() => {
              if (!confirmingEnd) {
                setConfirmingEnd(true);
                return;
              }
              setConfirmingEnd(false);
              void endHike();
            }}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            {confirmingEnd ? 'Tap again to end' : 'End hike'}
          </button>
        </div>
      )}
      {problem && <p className="text-[12px] text-red-400">{problem}</p>}
    </div>
  );
}
