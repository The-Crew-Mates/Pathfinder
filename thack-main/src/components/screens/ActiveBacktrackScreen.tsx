import { useState } from 'react';
import { playSafetyWhistle, playChirpSound } from '../../utils/audio';

interface ActiveBacktrackScreenProps {
  isDark: boolean;
  onBack: () => void;
  onOpenCompass: () => void;
}

export function ActiveBacktrackScreen({
  isDark,
  onBack,
  onOpenCompass,
}: ActiveBacktrackScreenProps) {
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isDrifting, setIsDrifting] = useState<boolean>(false);
  const [isWhistling, setIsWhistling] = useState<boolean>(false);
  const [compassHudOpen, setCompassHudOpen] = useState<boolean>(false);
  const [mapLayer, setMapLayer] = useState<'topo' | 'satellite'>('topo');

  const handleTogglePause = () => {
    playChirpSound();
    setIsPaused((prev) => !prev);
  };

  const handleToggleDrift = () => {
    playChirpSound();
    setIsDrifting((prev) => !prev);
  };

  const handleSoundWhistle = async () => {
    setIsWhistling(true);
    await playSafetyWhistle();
    setIsWhistling(false);
  };

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
          {/* Status sub-bar */}
          <div className="h-5 px-4 flex items-center justify-between font-space text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-amber-500 font-bold">
                signal_cellular_nodata
              </span>
              <span className="uppercase tracking-wider font-bold text-[9.5px] text-amber-900 bg-amber-100/90 px-1.5 py-0.5 rounded">
                GPS Unavailable · Estimated Position
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[13px] text-emerald-400">sensors</span>
              <span className="text-[10px] font-bold">Inertial Dead-Reckoning</span>
              <span className="material-symbols-outlined text-[13px]">battery_charging_90</span>
            </div>
          </div>

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
                alt="Topo App Logo"
                className="h-7 w-auto object-contain"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA2yV38XYx4w6o3d8OVIZVDtBSDcUxwVyGjWcjI1P5p28haWJ2FzJ4ozv5MkS7To9mb5KZSu6oonUaxCNinjneHBj3pCiglW3AHJTqjb_zqm6EoTik6tqg_HMckiHVFFywj3kLwKlto5OGsILlZY6s9l7Knj0-O-v0xnvJSysMVEB_gO25aZwBpxngIZ6m2yGw7rmvyXWfK6Di0RVP8YlU6P5yT9kzcfGjbyXsThgeYUCv4j65jrkAz"
              />
              <h1 className="font-headline-sm text-[17px] font-extrabold truncate ml-1 leading-tight">
                Live Navigation
              </h1>
            </div>

            <div className="flex items-center gap-2 pr-1">
              {/* Presentation Demo Mode Toggle: On Track vs Simulate Drift */}
              <button
                onClick={handleToggleDrift}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer ${
                  isDrifting
                    ? 'bg-amber-900/60 border-amber-600 text-amber-200'
                    : isDark
                    ? 'bg-[#162420] border-[#233a32] text-[#aef1d2]'
                    : 'bg-white border-slate-300 text-emerald-800'
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isDrifting ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'
                  }`}
                />
                <span>{isDrifting ? 'Simulate Drift' : 'On Track'}</span>
              </button>

              <div className="w-8 h-8 rounded-full bg-[#004330] flex items-center justify-center text-white shadow-sm">
                <span className="material-symbols-outlined text-[18px]">person</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full pt-20 pb-safe">
        <div className="flex flex-col w-full px-3.5 pb-8 gap-3">
          {/* TOP TURN HEADS-UP DISPLAY (APPLE MAPS STYLE) */}
          <div
            className={`w-full rounded-2xl p-4 shadow-xl relative overflow-hidden transition-all duration-300 ${
              isDrifting
                ? 'bg-amber-900 border border-amber-600 text-white shadow-amber-900/40'
                : 'bg-[#0f382a] border border-[#1f5c44] text-white shadow-[#0f382a]/50'
            }`}
          >
            {/* Ambient specular highlight */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-start gap-3.5">
              {/* Turn Glyph Circle */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${
                  isDrifting
                    ? 'bg-amber-200 text-amber-950'
                    : 'bg-[#aef1d2] text-[#04513b]'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[28px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {isDrifting ? 'u_turn_left' : 'turn_slight_left'}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className={`flex items-center gap-1.5 font-space text-[11px] uppercase tracking-wider font-bold ${
                    isDrifting ? 'text-amber-200' : 'text-[#aef1d2]'
                  }`}
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full animate-ping ${
                      isDrifting ? 'bg-amber-400' : 'bg-[#aef1d2]'
                    }`}
                  />
                  <span>
                    {isDrifting
                      ? 'DRIFT DETECTED • 24M OFF TRACK'
                      : 'ACTIVE BACKTRACK · NEXT TURN 45M'}
                  </span>
                </div>

                <h2 className="font-headline-md text-[20px] font-extrabold leading-tight mt-0.5 truncate">
                  {isDrifting ? 'Make a U-Turn Left' : 'Turn slight left'}
                </h2>

                <p
                  className={`font-body-sm text-[13px] truncate font-medium ${
                    isDrifting ? 'text-amber-100' : 'text-[#bbf3dc]'
                  }`}
                >
                  {isDrifting
                    ? 'Retrace 24m to rejoin recorded path at Wooden Bridge marker'
                    : 'Rejoin recorded track at Wooden Bridge marker'}
                </p>

                {/* Next Step Peek */}
                <div className="mt-2 pt-1.5 flex items-center gap-1.5 text-white/80 font-space text-[12px] border-t border-white/10">
                  <span className="material-symbols-outlined text-[16px]">straight</span>
                  <span className="truncate">Then follow downward contour 320m</span>
                </div>
              </div>
            </div>
          </div>

          {/* LIVE TOPOGRAPHIC BACKTRACK MAP CANVAS */}
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
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCemcCbZMaQHwPnmuqPxjssJlz-8nBKT6NN2OoK75AGDLwZtMwId2_-5DCljVVzHfnSgwaQhWDcr9eTtHKekv_LOY8mS4pdyP6Isr1Wt_5ZYt_ctIvo0hAMn9WvNY2ebI0V0RctiebH0nl0aiC4c09WsurqWEb7wrIH5rHNpvgb1C9-_UaRZ0v84rl6ttH6WBVSb-V05HiFnznx-gyGRmhg1dYfiUwg6mRH7kUyOjr9UkS1pEqyNG98')`,
                }}
              />
            )}

            {/* SVG Terrain & Luminous Contours */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              fill="none"
              viewBox="0 0 360 320"
            >
              <defs>
                <filter id="trail-glow-night-bt" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#4ade80" floodOpacity="0.6" />
                </filter>
                <filter id="cyan-pulse-bt" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.7" />
                </filter>
                <radialGradient id="hiker-aurora-bt" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Night Mode Topo Contour Elevation Curves */}
              <path d="M-20 70 Q 70 30, 160 85 T 380 40" stroke={isDark ? '#1d3a30' : '#cfddd8'} strokeWidth="1.2" />
              <path d="M-20 120 Q 90 70, 180 130 T 380 95" stroke={isDark ? '#1d3a30' : '#cfddd8'} strokeWidth="1.2" />
              <path d="M-20 170 Q 110 115, 200 180 T 380 150" stroke={isDark ? '#224438' : '#bfc9c2'} strokeWidth="1.5" />
              <path d="M-20 220 Q 120 160, 220 230 T 380 200" stroke={isDark ? '#1d3a30' : '#cfddd8'} strokeWidth="1.2" />
              <path d="M-20 270 Q 140 210, 240 275 T 380 250" stroke={isDark ? '#1d3a30' : '#cfddd8'} strokeWidth="1.2" />
              <path d="M-20 310 Q 160 260, 260 310 T 380 290" stroke={isDark ? '#1d3a30' : '#cfddd8'} strokeWidth="1.2" />

              {/* Outbound Track (Muted slate dashed reference) */}
              <path
                d="M 68 55 C 105 85, 135 125, 175 160 C 215 195, 255 235, 292 270"
                stroke={isDark ? '#334b42' : '#a3b0a9'}
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeWidth="2.5"
              />

              {/* Glowing Recorded Return Vector (Luminous Emerald & Cyan) */}
              <path
                d="M 292 270 C 255 235, 215 195, 175 160 C 135 125, 105 85, 68 55"
                filter="url(#trail-glow-night-bt)"
                stroke="#10b981"
                strokeLinecap="round"
                strokeWidth="5"
              />
              <path
                d="M 292 270 C 255 235, 215 195, 175 160 C 135 125, 105 85, 68 55"
                stroke="#a7f3d0"
                strokeDasharray="8 6"
                strokeLinecap="round"
                strokeWidth="2.5"
              />

              {/* Waypoint Landmark Markers */}
              {/* Wooden Bridge Marker */}
              <circle cx="175" cy="160" r="5" fill="#14201c" stroke="#34d399" strokeWidth="2" />
              <text
                x="186"
                y="164"
                fill="#a7f3d0"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                fontSize="10"
                fontWeight="700"
                stroke="#0b1311"
                strokeWidth="3"
                paintOrder="stroke"
              >
                Wooden Bridge
              </text>

              {/* Mirror Lake Marker */}
              <circle cx="218" cy="202" r="4.5" fill="#0284c7" stroke="#bae6fd" strokeWidth="1.5" />
              <text
                x="228"
                y="206"
                fill="#7dd3fc"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                fontSize="9"
                fontWeight="700"
                stroke="#0b1311"
                strokeWidth="3"
                paintOrder="stroke"
              >
                Mirror Lake
              </text>

              {/* High Ridge Pass Peak (Summit Origin) */}
              <circle cx="292" cy="270" r="6" fill="#1e2d27" stroke="#6ee7b7" strokeWidth="2" />
              <text
                x="245"
                y="285"
                fill="#94a3b8"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                fontSize="9"
                fontWeight="700"
                stroke="#0b1311"
                strokeWidth="3"
                paintOrder="stroke"
              >
                High Ridge (1,890m)
              </text>

              {/* Destination: Pine Ridge Trailhead (1,240m) */}
              <circle cx="68" cy="55" r="11" fill="#065f46" stroke="#34d399" strokeWidth="1.5" />
              <circle cx="68" cy="55" r="5" fill="#6ee7b7" />
              <text
                x="82"
                y="58"
                fill="#e1ede8"
                fontFamily="'Plus Jakarta Sans', sans-serif"
                fontSize="10"
                fontWeight="800"
                stroke="#0b1311"
                strokeWidth="3"
                paintOrder="stroke"
              >
                Pine Ridge Base (1,240m)
              </text>

              {/* Estimated Position Marker (Active Hiker with ±15m Uncertainty Radius) */}
              <g
                transform={isDrifting ? 'translate(35, -18)' : 'translate(0, 0)'}
                className="transition-transform duration-700 ease-out"
              >
                <circle
                  cx="205"
                  cy="188"
                  r="24"
                  fill="url(#hiker-aurora-bt)"
                  stroke={isDrifting ? '#ba1a1a' : '#38bdf8'}
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
                <circle
                  cx="205"
                  cy="188"
                  r="7.5"
                  fill={isDrifting ? '#ba1a1a' : '#38bdf8'}
                  filter="url(#cyan-pulse-bt)"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <polygon
                  points="205,175 200,185 210,185"
                  fill={isDrifting ? '#ba1a1a' : '#38bdf8'}
                />
              </g>

              {/* Drift Vector (Shown when drifting) */}
              {isDrifting && (
                <path
                  d="M 218 202 C 228 190, 240 180, 245 168"
                  filter="url(#trail-glow-night-bt)"
                  stroke="#f87171"
                  strokeDasharray="5 3"
                  strokeWidth="3.5"
                />
              )}
            </svg>

            {/* Map Floating Controls (Glass Cluster) */}
            <div className="absolute right-3 top-3 flex flex-col gap-2 z-20">
              <button
                aria-label="Re-center estimated location"
                onClick={() => playChirpSound()}
                className="w-10 h-10 rounded-full bg-[#14201c]/90 border border-[#233a32] backdrop-blur-md shadow-md flex items-center justify-center text-[#aef1d2] hover:bg-[#1a2c26] active:scale-90 transition-transform cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">my_location</span>
              </button>
              <button
                aria-label="Toggle Compass HUD"
                onClick={() => setCompassHudOpen((prev) => !prev)}
                className="w-10 h-10 rounded-full bg-[#14201c]/90 border border-[#233a32] backdrop-blur-md shadow-md flex items-center justify-center text-[#aef1d2] hover:bg-[#1a2c26] active:scale-90 transition-transform cursor-pointer"
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
                className="w-10 h-10 rounded-full bg-[#14201c]/90 border border-[#233a32] backdrop-blur-md shadow-md flex items-center justify-center text-[#92d4b7] hover:bg-[#1a2c26] active:scale-90 transition-transform cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">layers</span>
              </button>
            </div>

            {/* Floating Destination Pill: Pine Ridge Trailhead */}
            <div className="absolute left-3 top-3 z-10 bg-[#14201c]/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md flex items-center gap-2 border border-[#233a32]">
              <span className="material-symbols-outlined text-[#34d399] text-[18px]">flag</span>
              <div className="flex flex-col">
                <span className="font-headline-sm text-[12px] leading-tight font-bold text-[#f1f8f5]">
                  Pine Ridge Trailhead
                </span>
                <span className="font-space text-[10px] text-[#92d4b7] font-semibold">
                  1,240m • 1.8 km to base
                </span>
              </div>
            </div>

            {/* Route Direction Badge */}
            <div className="absolute left-3 bottom-3 z-10 bg-[#14201c]/90 backdrop-blur-md px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 font-space text-[11px] text-[#cbdad4] border border-[#233a32]">
              <span className="material-symbols-outlined text-amber-400 text-[14px]">
                sensors_off
              </span>
              <span className="font-medium text-[#e1ede8]">
                Following recorded route in reverse
              </span>
            </div>

            {/* In-Map Interactive Compass Overlay HUD */}
            {compassHudOpen && (
              <div className="absolute inset-0 z-30 bg-[#0e1714]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in">
                <button
                  onClick={() => setCompassHudOpen(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#1e2d27] flex items-center justify-center text-[#e1ede8] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
                <div className="relative w-36 h-36 rounded-full border-4 border-dashed border-[#1f5c44] flex items-center justify-center mb-2">
                  <div className="absolute top-2 text-[11px] font-bold text-red-400">N</div>
                  <div className="absolute bottom-2 text-[11px] font-bold text-[#707973]">S</div>
                  <div className="absolute right-2 text-[11px] font-bold text-[#707973]">E</div>
                  <div className="absolute left-2 text-[11px] font-bold text-[#707973]">W</div>
                  <div className="w-1.5 h-24 bg-gradient-to-t from-slate-600 to-red-500 rounded-full -rotate-45 shadow" />
                  <div className="w-4 h-4 rounded-full bg-[#10b981] border-2 border-[#0b1311] absolute" />
                </div>
                <span className="font-headline-md text-[20px] font-bold text-[#f1f8f5]">
                  315° NW
                </span>
                <span className="font-space text-[11px] text-[#92d4b7] font-semibold">
                  Inertial Bearing to Trailhead
                </span>
                <span className="mt-1 text-[11px] bg-[#175c45] text-[#aef1d2] px-2 py-0.5 rounded-full font-bold border border-[#233a32]">
                  Reverse Bearing Aligned
                </span>
              </div>
            )}
          </div>

          {/* REASSURING MASCOT COMPANION CARD */}
          <div
            className={`w-full rounded-2xl p-4 shadow-md flex items-center gap-3.5 relative overflow-hidden border ${
              isDark ? 'bg-[#14201c] border-[#233830]' : 'bg-white border-slate-200'
            }`}
          >
            {/* Mole Mascot pointing forward */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <img
                alt="Topo the Mole pointing forward"
                className="w-full h-full object-contain filter drop-shadow select-none"
                src="https://lh3.googleusercontent.com/aida/AEtjO1VWBeATesmkqL2c6Bhlg5GZHkTB1OkRm-lQGETAn3vbJwYHVEqRCLtMcOypgLkeQtvbk4styiZrAFR6KSkvD8QYQfKqtvPJ2oAVWn4GNpb_YmnO5J3DL3wlkSyL4ZKKILu4SPDTj0O_IbiKmii1BFAgYzSDajqScHhJDPEnQFd2IBDQ8a_qWXW8kJPKGbg_CdwHo2VR6mUwh6ZE9GanC6kM04XHME3FwU5IpdkiL0gbLHjzHUlYe2XBDTU"
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
                  Topo Navigator
                </span>
              </div>
              <p
                className={`font-body-sm text-[13px] font-semibold leading-snug ${
                  isDark ? 'text-[#f1f8f5]' : 'text-slate-800'
                }`}
              >
                {isDrifting
                  ? '“Hold on! Our footsteps are diverging from the recorded trail. Let’s turn back 20 steps to reconnect!”'
                  : '“This way! Retracing our recorded steps back down toward Pine Ridge Trailhead.”'}
              </p>
            </div>
          </div>

          {/* TELEMETRY & RETURN METRICS (3-COLUMN HUD) */}
          <div className="grid grid-cols-3 gap-2">
            {/* Distance HUD */}
            <div
              className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${
                isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">
                Rem. Dist
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span
                  className={`font-space text-[22px] font-bold ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  1.8
                </span>
                <span className="font-space text-[12px] text-[#92d4b7] font-semibold">km</span>
              </div>
              <div className="flex items-center gap-0.5 text-[#34d399] text-[11px] font-bold mt-1">
                <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                <span>-0.4 km</span>
              </div>
            </div>

            {/* Est. Time HUD */}
            <div
              className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${
                isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">
                Est. Time
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span
                  className={`font-space text-[22px] font-bold ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  34
                </span>
                <span className="font-space text-[12px] text-[#92d4b7] font-semibold">min</span>
              </div>
              <div className="flex items-center gap-0.5 text-slate-400 text-[11px] font-semibold mt-1">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                <span>4:15 PM</span>
              </div>
            </div>

            {/* Descent Elevation HUD */}
            <div
              className={`rounded-2xl p-3 shadow-sm flex flex-col items-center text-center border ${
                isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
              }`}
            >
              <span className="font-space text-[10px] uppercase text-[#92d4b7] font-bold">
                Descent
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span
                  className={`font-space text-[22px] font-bold ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  180
                </span>
                <span className="font-space text-[12px] text-[#92d4b7] font-semibold">m</span>
              </div>
              <div className="flex items-center gap-0.5 text-[#34d399] text-[11px] font-bold mt-1">
                <span className="material-symbols-outlined text-[13px]">south_east</span>
                <span>Steady</span>
              </div>
            </div>
          </div>

          {/* STATUS INDICATOR & ESTIMATED POSITION UNCERTAINTY */}
          <div
            className={`w-full border rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-sm transition-colors ${
              isDrifting
                ? 'bg-amber-950/40 border-amber-500/50'
                : isDark
                ? 'bg-[#14201c] border-[#233a32]'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  isDrifting ? 'bg-amber-600 text-white' : 'bg-[#175c45] text-[#aef1d2]'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">
                  {isDrifting ? 'warning' : 'timeline'}
                </span>
              </div>
              <div>
                <p className="font-headline-sm text-[13px] font-bold leading-snug">
                  {isDrifting ? 'Track Divergence Warning' : 'Recorded Track Guidance'}
                </p>
                <p
                  className={`font-space text-[10px] ${
                    isDrifting ? 'text-amber-300' : 'text-[#92d4b7]'
                  }`}
                >
                  {isDrifting
                    ? 'Bearing deviated 38° south • Retrace to last recorded marker'
                    : 'Estimated position ±15m uncertainty • Sensor-assisted inertial return'}
                </p>
              </div>
            </div>
            <span
              className={`font-space text-[10px] uppercase font-bold px-2.5 py-1 rounded-full border ${
                isDrifting
                  ? 'bg-amber-200 text-amber-950 border-amber-300'
                  : 'bg-[#175c45]/70 text-[#aef1d2] border-[#233a32]'
              }`}
            >
              {isDrifting ? 'Off Track' : 'Guide Active'}
            </span>
          </div>

          {/* GLOVE-FRIENDLY LARGE ACTION & SAFETY ZONE */}
          <div className="flex flex-col gap-2.5 mt-1">
            {/* Primary Glove-Friendly Pause / Resume Backtrack */}
            <button
              onClick={handleTogglePause}
              className={`w-full h-14 rounded-full font-headline-sm text-[16px] font-bold flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition-all border cursor-pointer ${
                isPaused
                  ? 'bg-amber-700 text-white border-amber-500 hover:bg-amber-600'
                  : 'bg-[#175c45] text-white border-[#278263] hover:bg-[#1c6f53]'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {isPaused ? 'play_circle' : 'pause_circle'}
              </span>
              <span>{isPaused ? 'Resume Backtrack' : 'Pause Backtrack'}</span>
            </button>

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

              {/* Complete / End Navigation */}
              <button
                onClick={onBack}
                className={`h-13 py-3 rounded-full font-headline-sm text-[13px] font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform border cursor-pointer ${
                  isDark
                    ? 'bg-[#1e2d27] text-[#e1ede8] border-[#233a32] hover:bg-[#253932]'
                    : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] text-[#92d4b7]">
                  check_circle
                </span>
                <span>End Navigation</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
