// Backtrack screen: Retrace leads you back along your beacons, newest to
// oldest, to where the hike started (src/tracking/retrace.ts, run by
// HikeProvider.tsx). It works with GPS, and with the position estimated from
// steps and the compass when GPS is lost. The design is the frontend team's.

import { useState } from 'react';
import { distanceMeters, pathLength } from '../../geo/distance';
import { formatAccuracy, formatBearing, formatDistance, formatTime } from '../../lib/format';
import { type HikeContextValueForUi, useHike } from '../../tracking/HikeProvider';
import { WALKING_SPEED_KMH, turnInstruction } from '../../tracking/retrace';
import { playSafetyWhistle, playChirpSound } from '../../utils/audio';
import { GpsStatusBanner } from '../hike/HikeUi';
import { RealMap } from '../map/RealMap';
import mapTexture from '../../assets/images/map-texture.png';
import molePointing from '../../assets/images/mole-pointing.jpg';
import logoPlaceholder from '../../assets/images/logo-placeholder.jpg';

interface ActiveBacktrackScreenProps {
  isDark: boolean;
  onBack: () => void;
  onOpenCompass: () => void;
}

/** What the screen is showing: no hike, nothing to follow yet, ready, waiting for a position, guiding, or back at the start. */
type Phase = 'no-hike' | 'no-beacons' | 'ready' | 'waiting' | 'guiding' | 'finished';

function phaseOf({ hike, beacons, retrace, guidance }: HikeContextValueForUi): Phase {
  if (!hike) return 'no-hike';
  if (retrace?.finished) return 'finished';
  if (retrace) return guidance ? 'guiding' : 'waiting';
  return beacons.length === 0 ? 'no-beacons' : 'ready';
}

/** What the mole says. */
function navigatorMessage(phase: Phase, hike: HikeContextValueForUi): string {
  const { beacons, guidance, position } = hike;
  switch (phase) {
    case 'no-hike':
      return '“Start a hike on the Trail Nav tab. I’ll drop beacons as we go, and lead us back along them.”';
    case 'no-beacons':
      return '“No beacons yet. The first one drops as soon as GPS finds us.”';
    case 'ready':
      return `“${beacons.length} ${beacons.length === 1 ? 'beacon leads' : 'beacons lead'} back to the start. Tap Start retrace whenever you want to head back.”`;
    case 'waiting':
      return '“Waiting for our position… Stand in the open a moment so GPS can find us.”';
    case 'finished':
      return '“We made it! This is where the hike started.”';
  }
  const g = guidance!;
  const n = g.targetIndex + 1;
  if (g.offTrack) return `“Hold on! We’re walking away from beacon ${n}. Let’s turn around.”`;
  if (g.turn === null) return `“There’s no compass reading, so use a real compass: beacon ${n} is ${formatBearing(g.bearing)} from here.”`;
  if (position?.source === 'estimated') {
    return `“No GPS, so I’m following your steps and the compass. Beacon ${n} is about ${formatDistance(g.distanceM)} away.”`;
  }
  const after = g.targetIndex === 0 ? 'and that’s where we started' : `then ${g.targetIndex} more to the start`;
  return `“This way! Beacon ${n} is ${formatDistance(g.distanceM)} away, ${after}.”`;
}

/** "1.8" + "km", or "240" + "m", for the big numbers. */
function splitDistance(metres: number): [string, string] {
  return metres >= 1000 ? [(metres / 1000).toFixed(1), 'km'] : [String(Math.round(metres)), 'm'];
}

export function ActiveBacktrackScreen({ isDark, onBack }: ActiveBacktrackScreenProps) {
  const hikeState = useHike();
  const { beacons, position, phoneHeading, retrace, guidance: g, problem, startRetrace, stopRetrace, confirmAtBeacon } =
    hikeState;
  const phase = phaseOf(hikeState);
  const warn = phase === 'guiding' && g!.offTrack;

  const [isWhistling, setIsWhistling] = useState<boolean>(false);
  const [compassHudOpen, setCompassHudOpen] = useState<boolean>(false);
  const [mapLayer, setMapLayer] = useState<'topo' | 'satellite'>('topo');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [recenterCount, setRecenterCount] = useState(0);

  const handleSoundWhistle = async () => {
    setIsWhistling(true);
    await playSafetyWhistle();
    setIsWhistling(false);
  };

  const handleZoom = (delta: number) => {
    playChirpSound();
    setZoomScale((prev) => Math.min(Math.max(prev * delta, 0.25), 8));
  };

  // The way back: from the hiker to the target beacon, then beacon by beacon to the start.
  const retracePath =
    phase === 'guiding' && position
      ? [position, ...beacons.slice(0, g!.targetIndex + 1).reverse()]
      : phase === 'ready'
        ? [...(position ? [position] : []), ...[...beacons].reverse()]
        : undefined;

  // How far back to the start: what's left while guiding, the whole way back when ready.
  const routeM =
    phase === 'guiding'
      ? g!.remainingM
      : phase === 'ready'
        ? (position ? distanceMeters(position, beacons.at(-1)!) : 0) + pathLength(beacons)
        : null;
  const minutesLeft = routeM === null ? null : routeM / ((WALKING_SPEED_KMH * 1000) / 60);
  const beaconsLeft = phase === 'guiding' ? g!.beaconsLeft : phase === 'ready' ? beacons.length : phase === 'finished' ? 0 : null;

  const card = isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200';
  const big = `font-space text-[22px] font-bold ${isDark ? 'text-white' : 'text-slate-900'}`;
  const mapButton =
    'w-10 h-10 rounded-full bg-[#14201c]/90 border border-[#233a32] backdrop-blur-md shadow-md flex items-center justify-center text-[#aef1d2] hover:bg-[#1a2c26] active:scale-90 transition-transform cursor-pointer';

  // The turn card at the top.
  const n = g ? g.targetIndex + 1 : 0;
  const hud =
    phase === 'guiding'
      ? {
          label: warn
            ? `Off track · ${formatDistance(g!.distanceM)} to beacon ${n}`
            : `Retrace · beacon ${n} in ${formatDistance(g!.distanceM)}`,
          title: warn && g!.turn === null ? 'Turn around' : g!.turn === null ? `Head ${formatBearing(g!.bearing)}` : turnInstruction(g!.turn),
          detail: g!.target.note
            ? `Beacon ${n}: “${g!.target.note}”`
            : `Beacon ${n} · dropped ${formatTime(g!.target.timestamp)}${g!.target.source === 'estimated' ? ' (estimated)' : ''}`,
          next:
            g!.targetIndex > 0
              ? `Then beacon ${g!.targetIndex} · ${formatDistance(distanceMeters(g!.target, beacons[g!.targetIndex - 1]))}`
              : 'That’s where the hike started',
        }
      : phase === 'finished'
        ? { label: 'Retrace complete', title: 'You’re back at the start', detail: 'Beacon 1, where the hike began.', next: null }
        : phase === 'waiting'
          ? { label: 'Retrace', title: 'Finding your position', detail: 'Guidance starts with the first GPS fix.', next: null }
          : phase === 'ready'
            ? {
                label: `Ready · ${beacons.length} ${beacons.length === 1 ? 'beacon' : 'beacons'}`,
                title: 'Retrace your steps',
                detail: 'Follow your beacons back, newest first, to where you started.',
                next: null,
              }
            : phase === 'no-beacons'
              ? { label: 'Retrace', title: 'No beacons yet', detail: 'The first beacon drops with the first GPS fix.', next: null }
              : { label: 'Retrace', title: 'No hike running', detail: 'Start a hike on the Trail Nav tab first.', next: null };

  // The arrow: relative to where the phone points, or north-up without a compass.
  const arrowAngle = g ? (g.turn ?? g.bearing) : 0;

  return (
    <div
      className={`flex flex-col w-full min-h-screen ${
        isDark ? 'bg-[#0b1311] text-[#e1ede8]' : 'bg-[#effcf7] text-[#121e1b]'
      }`}
    >
      {/* Top Fixed Header */}
      <header
        className={`fixed top-0 w-full z-50 pt-safe backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b transition-colors ${
          isDark
            ? 'bg-[#0b1311]/92 border-[#233830]/60'
            : 'bg-[#effcf7]/92 border-[#bfc9c2]/40'
        }`}
      >
        <div className="flex flex-col">
          {/* Live GPS status (HikeUi.tsx) */}
          <GpsStatusBanner isDark={isDark} />

          {/* Main nav bar */}
          <div className="h-14 px-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                aria-label="Go Back"
                onClick={onBack}
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors cursor-pointer active:scale-95 ${
                  isDark ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">arrow_back_ios_new</span>
              </button>
              <img
                alt="Pathfinder logo"
                className="h-7 w-auto object-contain"
                src={logoPlaceholder}
              />
              <h1 className="font-headline-sm text-[17px] font-extrabold truncate ml-1 leading-tight">
                Retrace
              </h1>
            </div>

            <div className="flex items-center gap-2 pr-1">
              {/* Retrace status pill */}
              <div
                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 shadow-sm ${
                  warn
                    ? 'bg-amber-900/60 border-amber-600 text-amber-200'
                    : isDark
                    ? 'bg-[#162420] border-[#233a32] text-[#aef1d2]'
                    : 'bg-white border-slate-300 text-emerald-800'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    warn ? 'bg-amber-400 animate-ping' : retrace ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                />
                <span>{warn ? 'Off Track' : phase === 'guiding' ? 'On Track' : phase === 'finished' ? 'Back at start' : retrace ? 'Retracing' : 'Not retracing'}</span>
              </div>

              <div className="w-8 h-8 rounded-full bg-[#004330] flex items-center justify-center text-white shadow-sm">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full pt-[90px] pb-safe">
        <div className="flex flex-col w-full px-3.5 pb-8 gap-3">
          {/* TOP TURN HEADS-UP DISPLAY */}
          <div
            className={`w-full rounded-2xl p-4 shadow-xl relative overflow-hidden transition-all duration-300 ${
              warn
                ? 'bg-amber-900 border border-amber-600 text-white shadow-amber-900/40'
                : 'bg-[#0f382a] border border-[#1f5c44] text-white shadow-[#0f382a]/50'
            }`}
          >
            {/* Ambient specular highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-start gap-3.5">
              {/* Turn arrow: points the way to the target beacon */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${
                  warn ? 'bg-amber-200 text-amber-950' : 'bg-[#aef1d2] text-[#04513b]'
                }`}
              >
                {phase === 'guiding' ? (
                  <span
                    className="material-symbols-outlined text-[28px] transition-transform duration-300"
                    style={{ fontVariationSettings: "'FILL' 1", transform: `rotate(${arrowAngle}deg)` }}
                    aria-label={hud.title}
                  >
                    navigation
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {phase === 'finished' ? 'check_circle' : phase === 'ready' ? 'undo' : phase === 'waiting' ? 'my_location' : 'flag'}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className={`flex items-center gap-1.5 font-space text-[11px] uppercase tracking-wider font-bold ${
                    warn ? 'text-amber-200' : 'text-[#aef1d2]'
                  }`}
                >
                  {retrace && (
                    <span
                      className={`inline-block w-2 h-2 rounded-full animate-ping ${
                        warn ? 'bg-amber-400' : 'bg-[#aef1d2]'
                      }`}
                    />
                  )}
                  <span className="truncate">{hud.label}</span>
                </div>

                <h2 className="font-headline-md text-[20px] font-extrabold leading-tight mt-0.5 truncate">
                  {hud.title}
                </h2>

                <p
                  className={`font-body-sm text-[13px] truncate font-medium ${
                    warn ? 'text-amber-100' : 'text-[#bbf3dc]'
                  }`}
                >
                  {hud.detail}
                </p>

                {/* Next Step Peek */}
                {hud.next && (
                  <div className="mt-2 pt-1.5 flex items-center gap-1.5 text-white/80 font-space text-[12px] border-t border-white/10">
                    <span className="material-symbols-outlined text-[16px]">straight</span>
                    <span className="truncate">{hud.next}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LIVE BACKTRACK MAP */}
          <div
            className={`relative w-full h-80 rounded-2xl overflow-hidden shadow-lg border transition-colors ${
              isDark ? 'bg-[#0e1714] border-[#233a32]' : 'bg-[#e9f7f1] border-slate-300'
            }`}
          >
            {/* Optional satellite photo layer */}
            {mapLayer === 'satellite' && (
              <div
                className="absolute inset-0 bg-cover bg-center filter contrast-110 opacity-70"
                style={{
                  backgroundImage: `url('${mapTexture}')`,
                }}
              />
            )}

            {/* Real map: OpenStreetMap + Lipas data shipped with the app, with the way back drawn on it */}
            <RealMap
              isDark={isDark}
              zoom={zoomScale}
              recenterKey={recenterCount}
              position={position}
              estimated={position?.source === 'estimated'}
              beacons={beacons}
              textured={mapLayer === 'satellite'}
              retracePath={retracePath}
              targetBeaconId={phase === 'guiding' ? g!.target.id : null}
            />

            {/* Map Floating Controls (Glass Cluster) */}
            <div className="absolute right-3 top-3 flex flex-col gap-2 z-20">
              <button
                aria-label="Re-center on your position"
                onClick={() => {
                  playChirpSound();
                  setRecenterCount((count) => count + 1);
                  setZoomScale(1);
                }}
                className={mapButton}
              >
                <span className="material-symbols-outlined text-[20px]">my_location</span>
              </button>
              <button
                aria-label="Toggle Compass HUD"
                onClick={() => setCompassHudOpen((prev) => !prev)}
                className={mapButton}
              >
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  explore
                </span>
              </button>
              <button
                aria-label="Topographic Layer"
                onClick={() => setMapLayer((prev) => (prev === 'topo' ? 'satellite' : 'topo'))}
                className={mapButton}
              >
                <span className="material-symbols-outlined text-[20px]">layers</span>
              </button>
            </div>

            {/* Zoom */}
            <div className="absolute right-3 bottom-3 z-20 flex flex-col rounded-full overflow-hidden bg-[#14201c]/90 border border-[#233a32] backdrop-blur-md shadow-md">
              <button
                aria-label="Zoom In"
                onClick={() => handleZoom(1.5)}
                className="w-10 h-9 flex items-center justify-center text-[#aef1d2] active:scale-90 transition-transform cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
              </button>
              <div className="w-full h-px bg-[#233a32]" />
              <button
                aria-label="Zoom Out"
                onClick={() => handleZoom(1 / 1.5)}
                className="w-10 h-9 flex items-center justify-center text-[#aef1d2] active:scale-90 transition-transform cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">remove</span>
              </button>
            </div>

            {/* Floating Destination Pill: the target beacon */}
            {(phase === 'guiding' || phase === 'finished') && (
              <div className="absolute left-3 top-3 z-10 bg-[#14201c]/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md flex items-center gap-2 border border-[#233a32] max-w-[70%]">
                <span className="material-symbols-outlined text-[#34d399] text-[18px]">flag</span>
                <div className="flex flex-col min-w-0">
                  <span className="font-headline-sm text-[12px] leading-tight font-bold text-[#f1f8f5] truncate">
                    {phase === 'finished' ? 'Start of the hike' : `Beacon ${n}`}
                  </span>
                  <span className="font-space text-[10px] text-[#92d4b7] font-semibold truncate">
                    {phase === 'finished'
                      ? 'You made it back'
                      : `${formatDistance(g!.distanceM)} · ${formatBearing(g!.bearing)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Route Direction Badge */}
            {retrace && !retrace.finished && (
              <div className="absolute left-3 bottom-6 z-10 bg-[#14201c]/90 backdrop-blur-md px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 font-space text-[11px] text-[#cbdad4] border border-[#233a32]">
                <span className="material-symbols-outlined text-amber-400 text-[14px]">
                  {position?.source === 'estimated' ? 'sensors_off' : 'satellite_alt'}
                </span>
                <span className="font-medium text-[#e1ede8]">
                  {position?.source === 'estimated' ? 'Following beacons on an estimate' : 'Following your beacons back'}
                </span>
              </div>
            )}

            {/* In-Map Compass Overlay HUD: the dial turns with the phone, the needle points to the beacon */}
            {compassHudOpen && (
              <div className="absolute inset-0 z-30 bg-[#0e1714]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in">
                <button
                  aria-label="Close compass"
                  onClick={() => setCompassHudOpen(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#1e2d27] flex items-center justify-center text-[#e1ede8] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
                <div
                  className="relative w-36 h-36 rounded-full border-4 border-dashed border-[#1f5c44] flex items-center justify-center mb-2 transition-transform duration-300"
                  style={{ transform: `rotate(${-(phoneHeading ?? 0)}deg)` }}
                >
                  <div className="absolute top-2 text-[11px] font-bold text-red-400">N</div>
                  <div className="absolute bottom-2 text-[11px] font-bold text-[#707973]">S</div>
                  <div className="absolute right-2 text-[11px] font-bold text-[#707973]">E</div>
                  <div className="absolute left-2 text-[11px] font-bold text-[#707973]">W</div>
                  {g && (
                    <div
                      className="w-1.5 h-24 bg-gradient-to-t from-slate-600 to-red-500 rounded-full shadow"
                      style={{ transform: `rotate(${g.bearing}deg)` }}
                    />
                  )}
                  <div className="w-4 h-4 rounded-full bg-[#10b981] border-2 border-[#0b1311] absolute" />
                </div>
                <span className="font-headline-md text-[20px] font-bold text-[#f1f8f5]">
                  {g ? formatBearing(g.bearing) : '—'}
                </span>
                <span className="font-space text-[11px] text-[#92d4b7] font-semibold">
                  {g ? `Bearing to beacon ${n} (true north)` : 'Start retrace to get a bearing'}
                </span>
                <span className="mt-1 text-[11px] bg-[#175c45] text-[#aef1d2] px-2 py-0.5 rounded-full font-bold border border-[#233a32]">
                  {phoneHeading === null
                    ? 'No compass reading: dial shows north up'
                    : g && g.turn !== null
                      ? Math.abs(g.turn) < 20
                        ? 'Facing the right way'
                        : turnInstruction(g.turn)
                      : `Phone points ${formatBearing(phoneHeading)}`}
                </span>
              </div>
            )}
          </div>

          {/* REASSURING MASCOT COMPANION CARD */}
          <div className={`w-full rounded-2xl p-4 shadow-md flex items-center gap-3.5 relative overflow-hidden border ${card}`}>
            {/* Mole Mascot pointing forward */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <img
                alt="The Pathfinder mole pointing forward"
                className="w-full h-full object-contain filter drop-shadow select-none"
                src={molePointing}
              />
            </div>

            {/* Mascot Speech Dialogue */}
            <div
              className={`flex-1 min-w-0 p-3 rounded-2xl relative border ${
                isDark ? 'bg-[#0f1916] border-[#233a32]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Talk bubble notch */}
              <div
                className={`absolute -left-1.5 top-6 w-3 h-3 border-l border-b rotate-45 ${
                  isDark ? 'bg-[#0f1916] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              />
              <div className="flex items-center gap-1 text-[#34d399] mb-0.5">
                <span className="material-symbols-outlined text-[15px]">pets</span>
                <span className="font-space text-[10px] tracking-wider uppercase font-bold">
                  Pathfinder Navigator
                </span>
              </div>
              <p
                className={`font-body-sm text-[13px] font-semibold leading-snug ${
                  isDark ? 'text-[#f1f8f5]' : 'text-slate-800'
                }`}
              >
                {navigatorMessage(phase, hikeState)}
              </p>
            </div>
          </div>

          {/* TELEMETRY & RETURN METRICS (3-COLUMN HUD) */}
          <div className="grid grid-cols-3 gap-2">
            {/* Distance HUD */}
            <div className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${card}`}>
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">Rem. Dist</span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span className={big}>{routeM === null ? '—' : splitDistance(routeM)[0]}</span>
                {routeM !== null && (
                  <span className="font-space text-[12px] text-[#92d4b7] font-semibold">{splitDistance(routeM)[1]}</span>
                )}
              </div>
              <div className="flex items-center gap-0.5 text-slate-400 text-[11px] font-semibold mt-1">
                <span>to the start</span>
              </div>
            </div>

            {/* Est. Time HUD */}
            <div className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${card}`}>
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">Est. Time</span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span className={big}>{minutesLeft === null ? '—' : Math.max(1, Math.round(minutesLeft))}</span>
                {minutesLeft !== null && <span className="font-space text-[12px] text-[#92d4b7] font-semibold">min</span>}
              </div>
              <div className="flex items-center gap-0.5 text-slate-400 text-[11px] font-semibold mt-1">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                <span>{minutesLeft === null ? '—' : formatTime(Date.now() + minutesLeft * 60_000)}</span>
              </div>
            </div>

            {/* Beacons Left HUD */}
            <div className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${card}`}>
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">Beacons</span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span className={big}>{beaconsLeft ?? '—'}</span>
              </div>
              <div className="flex items-center gap-0.5 text-[#34d399] text-[11px] font-bold mt-1">
                <span className="material-symbols-outlined text-[13px]">pin_drop</span>
                <span>left</span>
              </div>
            </div>
          </div>

          {/* STATUS INDICATOR & POSITION UNCERTAINTY */}
          <div
            className={`w-full border rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-sm transition-colors ${
              warn ? 'bg-amber-950/40 border-amber-500/50' : card
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  warn ? 'bg-amber-600 text-white' : 'bg-[#175c45] text-[#aef1d2]'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">{warn ? 'warning' : 'timeline'}</span>
              </div>
              <div className="min-w-0">
                <p className="font-headline-sm text-[13px] font-bold leading-snug">
                  {warn
                    ? 'Walking away from the beacon'
                    : position?.source === 'estimated'
                      ? 'Estimated from steps + compass'
                      : position
                        ? 'GPS position'
                        : 'No position yet'}
                </p>
                <p className={`font-space text-[10px] truncate ${warn ? 'text-amber-300' : 'text-[#92d4b7]'}`}>
                  {position ? `Position ${formatAccuracy(position.accuracyM)}` : 'Waiting for GPS'}
                  {' · '}
                  {phoneHeading === null ? 'no compass reading' : `phone points ${formatBearing(phoneHeading)}`}
                </p>
              </div>
            </div>
            <span
              className={`font-space text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                warn
                  ? 'bg-amber-200 text-amber-950 border-amber-300'
                  : 'bg-[#175c45]/70 text-[#aef1d2] border-[#233a32]'
              }`}
            >
              {warn ? 'Off Track' : phase === 'guiding' ? 'Guide Active' : phase === 'finished' ? 'Done' : phase === 'ready' ? 'Ready' : phase === 'waiting' ? 'Waiting' : 'Idle'}
            </span>
          </div>

          {/* GLOVE-FRIENDLY LARGE ACTION & SAFETY ZONE */}
          <div className="flex flex-col gap-2.5 mt-1">
            {/* Primary: start or stop retracing */}
            <button
              onClick={() => {
                playChirpSound();
                if (retrace) stopRetrace();
                else startRetrace();
              }}
              disabled={phase === 'no-hike' || phase === 'no-beacons'}
              className={`w-full h-14 rounded-full font-headline-sm text-[16px] font-bold flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition-all border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                retrace && !retrace.finished
                  ? 'bg-amber-700 text-white border-amber-500 hover:bg-amber-600'
                  : 'bg-[#175c45] text-white border-[#278263] hover:bg-[#1c6f53]'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {retrace ? (retrace.finished ? 'check_circle' : 'pause_circle') : 'play_circle'}
              </span>
              <span>{retrace ? (retrace.finished ? 'Done' : 'Stop retrace') : 'Start retrace'}</span>
            </button>

            {/* The hiker recognises the beacon (its note or photo): move on to the next one */}
            {phase === 'guiding' && (
              <button
                onClick={() => {
                  playChirpSound();
                  confirmAtBeacon();
                }}
                className={`w-full py-3 rounded-full font-headline-sm text-[14px] font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all border cursor-pointer ${
                  isDark
                    ? 'bg-[#1e2d27] text-[#aef1d2] border-[#233a32] hover:bg-[#253932]'
                    : 'bg-white text-emerald-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">pin_drop</span>
                <span>I’m at beacon {n}</span>
              </button>
            )}

            {problem && <p className="text-[12px] text-red-400 text-center">{problem}</p>}

            {/* Secondary Emergency & Controls Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* SOS Whistle Sound Button */}
              <button
                onClick={handleSoundWhistle}
                disabled={isWhistling}
                className={`h-13 py-3 rounded-full font-headline-sm text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all border cursor-pointer disabled:opacity-75 ${
                  isWhistling
                    ? 'bg-red-600 text-white border-red-500 animate-pulse'
                    : 'bg-[#3b2020] text-[#fca5a5] border-red-900/60 hover:bg-[#4d2828]'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    isWhistling ? 'animate-bounce text-white' : 'text-red-400'
                  }`}
                >
                  {isWhistling ? 'campaign' : 'volume_up'}
                </span>
                <span>{isWhistling ? 'Sounding SOS...' : 'Sound Safety Whistle'}</span>
              </button>

              {/* Stop retracing and go back to the map */}
              <button
                onClick={() => {
                  stopRetrace();
                  onBack();
                }}
                className={`h-13 py-3 rounded-full font-headline-sm text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform border cursor-pointer ${
                  isDark
                    ? 'bg-[#1e2d27] text-[#e1ede8] border-[#233a32] hover:bg-[#253932]'
                    : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] text-[#92d4b7]">
                  check_circle
                </span>
                <span>{retrace ? 'End Navigation' : 'Back to map'}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
