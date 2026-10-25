// Confidence screen: how sure the app is of your position right now, where
// the position comes from (GPS, or steps and the compass), and what dead
// reckoning has learned. Everything shown is real data from the hike
// (HikeProvider.tsx); the design is the frontend team's.

import { useEffect, useState } from 'react';

import moleQrSign from '../../assets/images/mole-qr-sign.jpg';
import { DEFAULT_SETTINGS } from '../../beacons/settings';
import { formatAccuracy, formatBearing, formatTime } from '../../lib/format';
import { useStore } from '../../lib/StoreProvider';
import { confidenceGrade, confidenceScore } from '../../tracking/confidence';
import { type TimelineEvent, useHike } from '../../tracking/HikeProvider';
import { type SensorStatus, blockedSensorHelp } from '../../tracking/sensors';
import { useSensorCheck } from '../../tracking/useSensorCheck';
import { GpsStatusBanner } from '../hike/HikeUi';

interface ConfidenceCalibrationScreenProps {
  isDark: boolean;
  onBack: () => void;
  onOpenDebug: () => void;
}

type Badge = { text: string; tone: 'good' | 'warn' | 'off' };

function sensorBadge(status: SensorStatus): Badge {
  if (status === 'active') return { text: 'ACTIVE', tone: 'good' };
  if (status === 'waiting') return { text: 'STARTING', tone: 'warn' };
  if (status === 'needs-permission') return { text: 'TAP TO ALLOW', tone: 'warn' };
  if (status === 'denied') return { text: 'BLOCKED', tone: 'warn' };
  if (status === 'unavailable') return { text: 'NOT ON DEVICE', tone: 'off' };
  return { text: 'OFF', tone: 'off' };
}

function timelineText(event: TimelineEvent): { title: string; detail: string; value: string; colour: string } {
  if (event.kind === 'gps-first') {
    return { title: 'First GPS fix', detail: 'Hike tracking started', value: formatAccuracy(event.accuracyM), colour: 'emerald' };
  }
  if (event.kind === 'gps-lost') {
    return { title: 'GPS lost', detail: 'Switched to steps and the compass', value: 'estimating', colour: 'amber' };
  }
  return {
    title: 'GPS is back',
    detail: `The estimate was ${Math.round(event.errorM)} m off (it said up to ${formatAccuracy(event.estimatedAccuracyM)})`,
    value: `${Math.round(event.errorM)} m`,
    colour: 'cyan',
  };
}

export function ConfidenceCalibrationScreen({ isDark, onBack, onOpenDebug }: ConfidenceCalibrationScreenProps) {
  const [techOpen, setTechOpen] = useState<boolean>(false);
  const { hike, gps, position, sensors: hikeSensors, calibration, distanceSinceFixM, timeline, lastFix, steps, enableSensors } =
    useHike();
  const deadReckoningErrorPercent = useErrorPercent();
  const savedStepLength = useLearnedStepLength();
  // Without a hike, "Check sensors" runs the sensors for a moment instead.
  const check = useSensorCheck();
  const sensors = hike ? hikeSensors : check.status;
  const turnOnSensors = () => void (hike ? enableSensors() : check.start());
  const blocked = sensors.motion === 'denied' || sensors.compass === 'denied';

  const score = position ? confidenceScore(position.accuracyM) : 0;
  const grade = confidenceGrade(score);
  const estimated = position?.source === 'estimated';
  const weak = score < 50;

  const radiusText = !hike
    ? 'No hike running'
    : position
      ? `${formatAccuracy(position.accuracyM)} ${estimated ? 'estimated radius' : 'GPS accuracy'}`
      : 'Waiting for GPS';
  const primarySource = !position ? '—' : estimated ? 'Steps & Compass' : 'Satellite GPS';
  const subsource = !position
    ? 'No position yet'
    : estimated
      ? `${Math.round(distanceSinceFixM)} m walked since GPS`
      : `Fix at ${formatTime(position.timestamp)}`;

  // SVG circular gauge (Circumference of r=50 is 2*PI*50 = 314.159)
  const circumference = 314.159;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const strokeColor = weak ? '#d97706' : score >= 90 ? '#059669' : '#175c45';

  const gpsBadge: Badge =
    gps === 'good'
      ? { text: 'ACTIVE', tone: 'good' }
      : gps === 'searching'
        ? { text: 'SEARCHING', tone: 'warn' }
        : gps === 'lost'
          ? { text: 'LOST', tone: 'warn' }
          : gps === 'denied'
            ? { text: 'BLOCKED', tone: 'warn' }
            : { text: 'OFF', tone: 'off' };
  // Dead reckoning needs both sensors; it's ready once it has learned the step length.
  const sensorsWork = sensors.motion === 'active' && sensors.compass === 'active';
  const stepLengthKnown = hike ? calibration.stepLengthSamples > 0 || savedStepLength !== null : savedStepLength !== null;
  const deadReckoningBadge: Badge = estimated
    ? { text: 'ESTIMATING', tone: 'good' }
    : !hike
      ? { text: 'OFF', tone: 'off' }
      : !sensorsWork
        ? { text: 'NEEDS SENSORS', tone: 'warn' }
        : stepLengthKnown
          ? { text: 'READY', tone: 'good' }
          : { text: 'LEARNING', tone: 'warn' };
  const sources: { icon: string; name: string; detail: string; badge: Badge; fixable?: boolean }[] = [
    {
      icon: 'directions_walk',
      name: 'Step counter',
      detail: hike
        ? steps > 0
          ? `${steps} steps this hike`
          : 'Counts steps from the motion sensor'
        : check.steps > 0
          ? `${check.steps} steps counted`
          : sensors.motion === 'active'
            ? 'Working. Walk a few steps to try it'
            : 'Counts steps from the motion sensor',
      badge: sensorBadge(sensors.motion),
      fixable: sensors.motion === 'needs-permission' || sensors.motion === 'denied',
    },
    {
      icon: 'explore',
      name: 'Compass',
      detail: hike
        ? calibration.headingSamples > 0
          ? 'Walking direction learned'
          : 'Learning how you hold the phone'
        : check.heading !== null
          ? `Pointing ${formatBearing(check.heading)} (magnetic)`
          : 'Shows which way the phone points',
      badge: sensorBadge(sensors.compass),
      fixable: sensors.compass === 'needs-permission' || sensors.compass === 'denied',
    },
    {
      icon: 'satellite_alt',
      name: 'Satellite GPS',
      detail: lastFix ? `Last fix ${formatTime(lastFix.timestamp)}` : hike ? 'No fix yet' : 'Starts with a hike',
      badge: gpsBadge,
    },
    {
      icon: 'timeline',
      name: 'Dead reckoning',
      detail: estimated
        ? `${Math.round(distanceSinceFixM)} m since GPS`
        : stepLengthKnown
          ? `Step length ${(hike && calibration.stepLengthSamples > 0 ? calibration.stepLengthM : savedStepLength ?? calibration.stepLengthM).toFixed(2)} m`
          : 'Learns your step length with GPS',
      badge: deadReckoningBadge,
    },
  ];
  const live = sources.filter((s) => s.badge.tone === 'good').length;

  const badgeClass = (tone: Badge['tone']) =>
    tone === 'good'
      ? 'bg-[#aef1d2] text-[#04513b]'
      : tone === 'warn'
        ? 'bg-amber-300 text-amber-950'
        : isDark
          ? 'bg-slate-700/60 text-slate-300'
          : 'bg-slate-200 text-slate-700';
  const panel = isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200';
  const inner = isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200';

  const tip = !hike
    ? '“Tap Check sensors to see if your step counter and compass work, then start a hike on the Live screen. I’ll tell you here how sure I am of where we are.”'
    : estimated
      ? `“No GPS right now, so I’m counting steps and following the compass. Every 100 m we walk makes me about ${deadReckoningErrorPercent} m less sure, until GPS is back.”`
      : calibration.stepLengthSamples === 0
        ? '“Walk a few minutes with GPS so I can learn your step length. Then I can keep going if GPS drops.”'
        : '“I know your step length now. If GPS drops under the trees, I’ll keep estimating where we are.”';

  return (
    <div className={`flex flex-col w-full min-h-screen ${isDark ? 'bg-[#0b1311] text-[#e6f4ef]' : 'bg-[#effcf7] text-[#121e1b]'}`}>
      {/* Top Navigation & Status Chrome */}
      <header
        className={`fixed top-0 w-full z-40 pt-safe backdrop-blur-xl border-b transition-colors ${
          isDark ? 'bg-[#0b1311]/95 border-[#233a32]' : 'bg-[#effcf7]/95 border-surface-container-highest/60'
        }`}
      >
        <div className="flex flex-col">
          {/* Live GPS status (HikeUi.tsx) */}
          <GpsStatusBanner isDark={isDark} />

          {/* Header Bar */}
          <div className="h-14 px-3 flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              <button
                aria-label="Go Back"
                onClick={onBack}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 cursor-pointer ${
                  isDark ? 'text-white hover:bg-[#1b2b25]' : 'text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">arrow_back_ios_new</span>
              </button>
              <div className="flex flex-col min-w-0">
                <h1 className="font-headline-sm text-[16px] font-bold truncate leading-tight">Pathfinder Confidence</h1>
                <span className="font-space text-[11px] text-[#92d4b7] uppercase tracking-wider">
                  {hike ? (estimated ? 'Estimated position' : 'GPS position') : 'Not tracking'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pr-1 shrink-0">
              <button
                aria-label="Beacon and GPS settings"
                title="Beacon and GPS settings"
                onClick={onOpenDebug}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors border cursor-pointer ${
                  isDark
                    ? 'bg-[#162520] text-[#aef1d2] hover:bg-[#1e342c] border-[#233a32]'
                    : 'bg-white text-emerald-800 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full pt-24 pb-28">
        <div className="flex flex-col w-full px-3.5 gap-3.5">
          {/* Circular Dial & Telemetry Card */}
          <div className={`relative rounded-3xl p-5 shadow-xl border flex flex-col gap-4 ${panel}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[20px] text-emerald-400">verified</span>
                <span className="font-space text-[12px] text-[#92d4b7] tracking-wider uppercase font-bold">Confidence Rating</span>
              </div>
              {position && (
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-space text-[11px] font-bold tracking-wide shadow-sm border ${
                    weak ? 'bg-amber-900/60 text-amber-200 border-amber-600' : 'bg-[#1b3b2f] text-[#aef1d2] border-[#286952]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${estimated ? 'animate-pulse' : ''} ${weak ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span>
                    GRADE {grade.letter} ({grade.text.toUpperCase()})
                  </span>
                </span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center my-1">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                  <circle className={isDark ? 'text-[#1d2d27]' : 'text-slate-100'} cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="font-space text-[46px] leading-none tracking-tight font-black">{position ? score : '—'}</span>
                  <span className="font-space text-[10px] uppercase tracking-widest text-[#92d4b7] font-semibold mt-0.5">/ 100 CONFIDENCE</span>
                  <span
                    className={`font-space text-[11px] font-bold mt-1 px-2.5 py-0.5 rounded-full border ${
                      weak && position ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-[#172b23] text-[#aef1d2] border-[#233a32]'
                    }`}
                  >
                    {radiusText}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className={`rounded-2xl p-3 flex items-center gap-3 border ${inner}`}>
                <div className="w-10 h-10 rounded-full bg-[#101b17] flex items-center justify-center shrink-0 text-[#aef1d2] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[22px]">target</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-space text-[10px] uppercase tracking-wider text-[#92d4b7] font-semibold">Uncertainty</span>
                  <span className="font-headline-sm text-[17px] font-extrabold truncate">
                    {position ? `${formatAccuracy(position.accuracyM).replace('±', '± ')}` : '—'}
                  </span>
                </div>
              </div>

              <div className={`rounded-2xl p-3 flex items-center gap-3 border ${inner}`}>
                <div className="w-10 h-10 rounded-full bg-[#101b17] flex items-center justify-center shrink-0 text-[#92d4b7] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[22px]">{estimated ? 'directions_walk' : 'satellite_alt'}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-space text-[10px] uppercase tracking-wider text-[#92d4b7] font-semibold">Position Source</span>
                  <span className="font-headline-sm text-[14px] font-bold truncate leading-snug">{primarySource}</span>
                  <span className="font-space text-[10px] text-emerald-400 font-medium">{subsource}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Positioning Source Stack Card */}
          <div className={`rounded-3xl p-4 shadow-sm border flex flex-col gap-2.5 ${panel}`}>
            <div className="flex items-center justify-between px-1">
              <span className="font-space text-[11px] uppercase tracking-wider text-[#92d4b7] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">hub</span>
                Positioning Sources
              </span>
              <span className="font-space text-[11px] font-bold text-[#aef1d2]">
                {live} OF {sources.length} LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {sources.map((source) => (
                <div
                  key={source.name}
                  className={`p-2.5 rounded-2xl border flex flex-col gap-1 ${inner} ${source.badge.tone === 'off' ? 'opacity-80' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`material-symbols-outlined text-[18px] ${source.badge.tone === 'off' ? 'text-slate-400' : 'text-emerald-400'}`}>
                      {source.icon}
                    </span>
                    {source.fixable ? (
                      // A blocked or not-yet-allowed sensor: tap the badge to turn it on.
                      <button
                        onClick={turnOnSensors}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-right underline underline-offset-2 cursor-pointer active:scale-95 ${badgeClass(source.badge.tone)}`}
                      >
                        {source.badge.text === 'BLOCKED' ? 'BLOCKED · RETRY' : source.badge.text}
                      </button>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-right ${badgeClass(source.badge.tone)}`}>
                        {source.badge.text}
                      </span>
                    )}
                  </div>
                  <span className="font-body-sm text-[13px] font-bold">{source.name}</span>
                  <span className="font-space text-[10px] text-[#92d4b7]">{source.detail}</span>
                </div>
              ))}
            </div>

            {/* How to unblock a sensor on this phone */}
            {blocked && (
              <p className={`px-1 text-[12px] leading-snug ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>{blockedSensorHelp()}</p>
            )}

            {/* Without a hike: try the sensors before heading out */}
            {!hike && (
              <button
                onClick={() => void check.start()}
                disabled={check.running}
                className={`w-full py-2.5 rounded-xl border font-space text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 ${
                  isDark ? 'bg-[#182823] text-[#CFE4DC] border-[#24413a]' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">sensors</span>
                {check.running ? 'Checking… walk a few steps and turn around' : 'Check sensors'}
              </button>
            )}
          </div>

          {/* Technical Diagnostics Accordion */}
          <div className={`rounded-3xl border shadow-sm overflow-hidden transition-all ${panel}`}>
            <button onClick={() => setTechOpen((prev) => !prev)} className="w-full p-4 flex items-center justify-between text-left cursor-pointer">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#1e2e28] flex items-center justify-center text-[#aef1d2] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[18px]">developer_board</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-[14px] font-bold">Dead Reckoning Details</span>
                  <span className="font-space text-[11px] text-[#92d4b7]">What’s been learned, and the GPS timeline</span>
                </div>
              </div>
              <span className={`material-symbols-outlined text-[22px] text-slate-400 transition-transform duration-300 ${techOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {techOpen && (
              <div
                className={`border-t p-4 flex flex-col gap-3.5 animate-in fade-in ${
                  isDark ? 'border-[#233a32] bg-[#0f1815]' : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Metric
                    isDark={isDark}
                    label="Step length"
                    value={`${(calibration.stepLengthSamples > 0 ? calibration.stepLengthM : savedStepLength ?? calibration.stepLengthM).toFixed(2)} m`}
                    note={calibration.stepLengthSamples > 0 ? 'learned' : savedStepLength !== null ? 'from earlier hikes' : 'default'}
                  />
                  <Metric
                    isDark={isDark}
                    label="Phone vs. walking"
                    value={`${calibration.headingOffset > 0 ? '+' : ''}${Math.round(calibration.headingOffset)}°`}
                    note={calibration.headingSamples > 0 ? 'learned' : 'not learned'}
                  />
                  <Metric isDark={isDark} label="Drift" value={`+${deadReckoningErrorPercent} m / 100 m`} note="while estimating" />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <span className="font-space text-[11px] text-slate-400 uppercase tracking-wider font-bold">GPS Timeline</span>
                  {timeline.length === 0 ? (
                    <p className="text-[13px] text-slate-400">Nothing yet this hike.</p>
                  ) : (
                    <div className="relative pl-5 flex flex-col gap-3 py-1">
                      <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-slate-700/60" />
                      {timeline.map((event, i) => {
                        const text = timelineText(event);
                        const dot = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', cyan: 'bg-cyan-400' }[text.colour];
                        const valueColour = { emerald: 'text-emerald-400', amber: 'text-amber-400', cyan: 'text-cyan-300' }[text.colour];
                        return (
                          <div key={`${event.kind}-${event.at}-${i}`} className="relative flex items-start justify-between gap-2 text-body-sm">
                            <div className={`absolute -left-5 top-1 w-3 h-3 rounded-full ${dot} ring-4 ring-[#14201c]`} />
                            <div>
                              <p className="font-body-sm text-[13px] font-semibold">
                                {formatTime(event.at)} • {text.title}
                              </p>
                              <p className="text-[11px] text-slate-400">{text.detail}</p>
                            </div>
                            <span className={`font-space text-[11px] font-bold shrink-0 ${valueColour}`}>{text.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Pathfinder mascot card */}
          <div className={`relative rounded-3xl p-4 shadow-sm border flex items-center gap-3.5 overflow-hidden ${panel}`}>
            <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-[#fafaf7] p-1 flex items-center justify-center shadow-md border border-[#233a32]">
              <img alt="The Pathfinder mole holding a wooden trail marker sign" className="w-full h-full object-contain" src={moleQrSign} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="inline-flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">eco</span>
                <span className="font-space text-[10px] font-bold text-[#aef1d2] uppercase tracking-wide">Pathfinder's Trail Tip</span>
              </div>
              <p className="font-body-md text-[13px] font-semibold leading-snug">{tip}</p>
            </div>
          </div>
        </div>

        {/* Debug tools: saved beacons, test data, settings, GPS loss and replays (DebugScreen.tsx) */}
        <button
          onClick={onOpenDebug}
          className={`mx-auto mt-4 mb-6 px-4 py-2 rounded-full font-space text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer ${
            isDark ? 'text-[#8fa39b] hover:text-[#aef1d2]' : 'text-slate-500 hover:text-emerald-800'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">developer_board</span>
          Debug tools
        </button>
      </main>
    </div>
  );
}

/** The "Estimate uncertainty growth" setting, in % of the distance walked. */
function useErrorPercent(): number {
  const context = useStore();
  const [percent, setPercent] = useState(DEFAULT_SETTINGS.deadReckoningErrorPercent);
  const version = context?.version;
  useEffect(() => {
    context?.store.getSettings().then((s) => setPercent(s.deadReckoningErrorPercent));
  }, [context, version]);
  return percent;
}

/** The step length learned on earlier hikes (saved on the phone), or null if nothing has been learned yet. */
function useLearnedStepLength(): number | null {
  const context = useStore();
  const [metres, setMetres] = useState<number | null>(null);
  const version = context?.version;
  useEffect(() => {
    context?.store.getLearnedStepLength().then(setMetres);
  }, [context, version]);
  return metres;
}

function Metric({ isDark, label, value, note }: { isDark: boolean; label: string; value: string; note: string }) {
  return (
    <div
      className={`rounded-xl p-2.5 border flex items-center justify-between sm:flex-col sm:items-start ${
        isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
      }`}
    >
      <span className="text-[12px] text-slate-400">{label}</span>
      <span className="font-space text-[16px] font-bold text-emerald-400">
        {value} <span className="text-[11px] text-slate-400 font-medium">{note}</span>
      </span>
    </div>
  );
}
