import { useState } from 'react';
import { DemoMode, Checkpoint } from '../../types/navigation';
import { playChirpSound } from '../../utils/audio';

interface LiveNavigationScreenProps {
  isDark: boolean;
  demoMode: DemoMode;
  onSetDemoMode: (mode: DemoMode) => void;
  onOpenCompass: () => void;
  onNavigateToBacktrack: () => void;
  onNavigateToConfidence: () => void;
  onInspectCheckpoint: (checkpoint: Checkpoint) => void;
}

export function LiveNavigationScreen({
  isDark,
  demoMode,
  onSetDemoMode,
  onOpenCompass,
  onNavigateToBacktrack,
  onNavigateToConfidence,
  onInspectCheckpoint,
}: LiveNavigationScreenProps) {
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [mapLayer, setMapLayer] = useState<'topo' | 'satellite'>('topo');
  const [isRecentering, setIsRecentering] = useState<boolean>(false);

  // Checkpoint data for Wooden Bridge
  const woodenBridgeCheckpoint: Checkpoint = {
    id: 'wooden-bridge',
    title: 'Wooden Bridge Crossing',
    elevation: '1,420 m',
    distance: '350 m ahead',
    note: 'Cross at south footbridge. Watch for damp timber planks. Key dead-reckoning landmark before Mirror Lake ascent.',
    coordinates: '46°51\'14.2"N 121°45\'38.9"W',
    type: 'bridge',
  };

  const handleZoom = (delta: number) => {
    playChirpSound();
    setZoomScale((prev) => Math.min(Math.max(prev * delta, 0.75), 1.5));
  };

  const handleRecenter = () => {
    playChirpSound();
    setIsRecentering(true);
    setZoomScale(1);
    setTimeout(() => setIsRecentering(false), 400);
  };

  // State-dependent values
  const uncertaintyRadius = demoMode === 'drift' ? 92 : demoMode === 'calibrated' ? 28 : 52;
  const uncertaintyLabel = demoMode === 'drift' ? '±54m' : demoMode === 'calibrated' ? '±6m' : '±18m';
  const confidenceScore = demoMode === 'drift' ? 42 : demoMode === 'calibrated' ? 96 : 78;
  const confidenceBadgeText = demoMode === 'drift' ? 'Degraded' : demoMode === 'calibrated' ? 'Optimal' : 'Good';
  const driftRateText = demoMode === 'drift' ? '±3.8 m/min drift' : demoMode === 'calibrated' ? '±0.3 m/min drift' : '±1.2 m/min drift';
  const satLostText = demoMode === 'drift' ? 'Satellite fix lost 1h 14m ago' : demoMode === 'calibrated' ? 'Satellite fix lost 8m ago' : 'Satellite fix lost 42m ago';

  return (
    <div className={`flex flex-col w-full min-h-screen ${isDark ? 'bg-[#0B1311] text-[#E8F1ED]' : 'bg-[#effcf7] text-[#121e1b]'}`}>
      {/* Top Fixed Header */}
      <header
        className={`fixed top-0 w-full z-40 pt-safe backdrop-blur-xl border-b transition-colors ${
          isDark
            ? 'bg-[#0B1311]/92 border-[#1E302A] shadow-md'
            : 'bg-[#effcf7]/92 border-[#bfc9c2]/40 shadow-sm'
        }`}
      >
        <div className="flex flex-col">
          {/* Honest GPS Status Notification Banner */}
          <div
            className={`h-6 px-4 flex items-center justify-between font-space text-[11px] border-b ${
              isDark
                ? 'bg-amber-500/15 border-amber-500/30'
                : 'bg-amber-500/10 border-amber-500/20'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold tracking-wide uppercase text-amber-500">
              <span className="h-2 w-2 rounded-full bg-amber-600 inline-block animate-ping shrink-0" />
              <span className="material-symbols-outlined text-[14px]">satellite_alt</span>
              <span className="truncate">GPS UNAVAILABLE · ESTIMATED POSITION</span>
            </div>
            <div className="flex items-center gap-2 font-semibold">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isDark
                    ? 'bg-amber-400/20 border border-amber-400/40 text-amber-200'
                    : 'bg-amber-200 text-amber-900'
                }`}
              >
                DEAD-RECKONING
              </span>
              <span className="material-symbols-outlined text-[14px]">battery_5_bar</span>
            </div>
          </div>

          {/* Navigation Header Bar */}
          <div className="h-14 px-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                aria-label="Back to Overview"
                onClick={onNavigateToConfidence}
                className={`w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-colors cursor-pointer ${
                  isDark ? 'text-white hover:bg-white/10' : 'text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">tune</span>
              </button>
              <div className="flex flex-col">
                <span className="font-space text-[10px] uppercase font-bold text-[#34D399] tracking-wider">
                  Topo Live Navigation
                </span>
                <h1 className="font-headline-sm text-[17px] font-extrabold leading-tight">
                  High Ridge Trail
                </h1>
              </div>
            </div>

            {/* Interactive Compass Heading Capsule */}
            <button
              onClick={onOpenCompass}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg active:scale-95 transition-all cursor-pointer ${
                isDark
                  ? 'bg-[#175C45] text-white border border-[#2D7A5F] hover:bg-[#1E7457]'
                  : 'bg-[#004330] text-white hover:bg-[#175c45]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] text-[#86EFAC]">explore</span>
              <span className="font-space text-[13px] tracking-wider font-bold">NE · 045°</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Content Area */}
      <main className="flex-1 flex flex-col relative w-full pt-[90px] pb-safe">
        <div className="flex flex-col w-full relative select-none pb-4">
          {/* Topographic Full-Bleed Map Canvas Area */}
          <div
            className={`relative w-full h-[490px] rounded-b-3xl overflow-hidden shadow-lg border-b transition-colors ${
              isDark ? 'bg-[#0C1714] border-[#1C322A]' : 'bg-[#e9f7f1] border-[#bfc9c2]/40'
            }`}
          >
            {/* Optional Satellite Backdrop Layer */}
            {mapLayer === 'satellite' && (
              <div
                className="absolute inset-0 bg-cover bg-center filter contrast-110 opacity-70"
                style={{
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuCemcCbZMaQHwPnmuqPxjssJlz-8nBKT6NN2OoK75AGDLwZtMwId2_-5DCljVVzHfnSgwaQhWDcr9eTtHKekv_LOY8mS4pdyP6Isr1Wt_5ZYt_ctIvo0hAMn9WvNY2ebI0V0RctiebH0nl0aiC4c09WsurqWEb7wrIH5rHNpvgb1C9-_UaRZ0v84rl6ttH6WBVSb-V05HiFnznx-gyGRmhg1dYfiUwg6mRH7kUyOjr9UkS1pEqyNG98')`,
                }}
              />
            )}

            {/* SVG Vector Topographic Terrain & Trails */}
            <div
              className={`absolute inset-0 w-full h-full transition-transform duration-300 ${
                isRecentering ? 'scale-105' : ''
              }`}
              style={{ transform: `scale(${zoomScale})` }}
            >
              <svg className="w-full h-full object-cover" fill="none" viewBox="0 0 390 510">
                <defs>
                  <linearGradient id="lakeGradLive" x1="260" x2="350" y1="120" y2="210" gradientUnits="userSpaceOnUse">
                    {isDark ? (
                      <>
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#0e2a56" stopOpacity="0.9" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="#abc5ff" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#6e98f0" stopOpacity="0.65" />
                      </>
                    )}
                  </linearGradient>

                  <radialGradient id="haloGradLive" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={isDark ? '#00E5FF' : '#2563EB'} stopOpacity={demoMode === 'drift' ? '0.45' : '0.35'} />
                    <stop offset="50%" stopColor={isDark ? '#00E5FF' : '#2563EB'} stopOpacity="0.15" />
                    <stop offset="90%" stopColor={isDark ? '#00E5FF' : '#2563EB'} stopOpacity="0.04" />
                    <stop offset="100%" stopColor={isDark ? '#00E5FF' : '#2563EB'} stopOpacity="0" />
                  </radialGradient>

                  <filter id="softGlowLive" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Topo Contour Lines */}
                <path
                  d="M-40 90 Q 60 70, 150 110 T 360 80 T 430 110"
                  stroke={isDark ? '#19352A' : '#cfddd8'}
                  strokeDasharray="3 3"
                  strokeWidth="1.2"
                />
                <path
                  d="M-20 160 Q 80 140, 190 170 T 380 140 T 430 170"
                  stroke={isDark ? '#1B3D30' : '#cfddd8'}
                  strokeWidth="1.2"
                />
                <path
                  d="M-30 240 Q 110 200, 200 250 T 410 210"
                  stroke={isDark ? '#19352A' : '#cfddd8'}
                  strokeWidth="1.2"
                />
                <path
                  d="M-10 320 Q 90 280, 230 330 T 420 290"
                  stroke={isDark ? '#19352A' : '#cfddd8'}
                  strokeDasharray="2 3"
                  strokeWidth="1.2"
                />
                <path
                  d="M-40 400 Q 120 370, 260 410 T 440 370"
                  stroke={isDark ? '#19352A' : '#cfddd8'}
                  strokeWidth="1.2"
                />
                <path
                  d="M-20 480 Q 140 440, 280 470 T 430 450"
                  stroke={isDark ? '#19352A' : '#cfddd8'}
                  strokeWidth="1.2"
                />

                {/* High Elevation Contours */}
                <path
                  d="M70 190 C 130 180, 160 210, 210 195 C 260 180, 290 220, 340 210"
                  stroke={isDark ? '#244F3F' : '#bfc9c2'}
                  strokeWidth="1.5"
                />
                <path
                  d="M90 220 C 140 210, 175 235, 220 225 C 265 215, 280 245, 320 235"
                  stroke={isDark ? '#2C5D4B' : '#bfc9c2'}
                  strokeWidth="1.5"
                />
                <path
                  d="M120 250 C 160 240, 185 260, 230 250 C 270 240, 280 260, 305 255"
                  filter="url(#softGlowLive)"
                  stroke={isDark ? '#34D399' : '#92d4b7'}
                  strokeOpacity={isDark ? 0.6 : 0.9}
                  strokeWidth="2"
                />

                {/* Elevation Labels */}
                <text
                  x="28"
                  y="240"
                  fill={isDark ? '#6EE7B7' : '#586059'}
                  fontFamily="'Space Grotesk', monospace"
                  fontSize="10"
                  fontWeight="700"
                >
                  1,420m
                </text>
                <text
                  x="295"
                  y="252"
                  fill={isDark ? '#6EE7B7' : '#586059'}
                  fontFamily="'Space Grotesk', monospace"
                  fontSize="10"
                  fontWeight="700"
                >
                  1,480m
                </text>
                <text
                  x="285"
                  y="385"
                  fill={isDark ? '#4E7265' : '#707973'}
                  fontFamily="'Space Grotesk', monospace"
                  fontSize="9"
                  fontWeight="600"
                >
                  1,360m
                </text>

                {/* Glacial Water Body: Mirror Lake */}
                <path
                  d="M255 105 C 285 90, 340 100, 360 125 C 380 148, 375 180, 348 195 C 320 210, 270 205, 250 182 C 230 160, 230 120, 255 105 Z"
                  fill="url(#lakeGradLive)"
                  stroke={isDark ? '#3B82F6' : '#7ea6fc'}
                  strokeWidth="1.5"
                />
                <path
                  d="M280 135 C 300 132, 320 136, 335 133"
                  opacity={isDark ? 0.5 : 0.8}
                  stroke={isDark ? '#60A5FA' : '#effcf7'}
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
                <path
                  d="M270 155 C 290 152, 325 156, 340 152"
                  opacity={isDark ? 0.4 : 0.7}
                  stroke={isDark ? '#60A5FA' : '#effcf7'}
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
                <text
                  x="302"
                  y="172"
                  textAnchor="middle"
                  fill={isDark ? '#93C5FD' : '#00387e'}
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  fontSize="11"
                  fontWeight="800"
                >
                  Mirror Lake
                </text>

                {/* Forest Trees Cluster */}
                <g fill={isDark ? '#1B4332' : '#175c45'} opacity={isDark ? 0.7 : 0.5} transform="translate(42, 285)">
                  <polygon points="10,0 4,11 16,11" />
                  <polygon points="10,6 2,16 18,16" />
                  <rect x="9" y="16" width="2" height="3" />
                </g>
                <g fill={isDark ? '#1B4332' : '#175c45'} opacity={isDark ? 0.6 : 0.45} transform="translate(62, 298)">
                  <polygon points="8,0 3,9 13,9" />
                  <polygon points="8,5 1,14 15,14" />
                  <rect x="7" y="14" width="2" height="3" />
                </g>
                <g fill={isDark ? '#1B4332' : '#175c45'} opacity={isDark ? 0.7 : 0.5} transform="translate(330, 295)">
                  <polygon points="9,0 3,10 15,10" />
                  <polygon points="9,5 1,15 17,15" />
                  <rect x="8" y="15" width="2" height="3" />
                </g>

                {/* Recorded Trail Path */}
                <path
                  d="M 88 470 C 105 430, 130 400, 140 370 C 152 334, 128 310, 148 275 C 168 240, 205 235, 218 202 C 226 182, 212 165, 215 142"
                  filter="url(#softGlowLive)"
                  opacity={isDark ? 0.3 : 0.4}
                  stroke={isDark ? '#10B981' : '#92d4b7'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="8"
                />
                <path
                  d="M 88 470 C 105 430, 130 400, 140 370 C 152 334, 128 310, 148 275 C 168 240, 205 235, 218 202 C 226 182, 212 165, 215 142"
                  stroke={isDark ? '#34D399' : '#175c45'}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3.5"
                />

                {/* Trailhead Pin */}
                <g transform="translate(88, 470)">
                  <circle cx="0" cy="0" r="8" fill={isDark ? '#064e3b' : '#ffffff'} filter="url(#softGlowLive)" />
                  <circle cx="0" cy="0" r="5.5" fill={isDark ? '#10B981' : '#004330'} />
                  <circle cx="0" cy="0" r="2.5" fill={isDark ? '#ffffff' : '#aef1d2'} />
                </g>

                {/* Dynamic Graduated Uncertainty Radius Halo */}
                <circle
                  cx="215"
                  cy="142"
                  r={uncertaintyRadius}
                  fill="url(#haloGradLive)"
                  className="transition-all duration-500 ease-out"
                />
                <circle
                  cx="215"
                  cy="142"
                  r={uncertaintyRadius}
                  fill="none"
                  filter="url(#softGlowLive)"
                  opacity={demoMode === 'drift' ? 0.95 : 0.8}
                  stroke={demoMode === 'drift' ? '#EF4444' : isDark ? '#00E5FF' : '#2563EB'}
                  strokeDasharray="4 3"
                  strokeWidth="1.5"
                  className="transition-all duration-500 ease-out"
                />

                {/* Estimated Drift Pill on Map */}
                <g transform="translate(230, 126)">
                  <rect
                    width="48"
                    height="18"
                    rx="9"
                    fill={isDark ? '#0F2820' : '#ffffff'}
                    opacity="0.95"
                    stroke={demoMode === 'drift' ? '#EF4444' : isDark ? '#00E5FF' : '#2563EB'}
                    strokeWidth="1"
                  />
                  <text
                    x="24"
                    y="13"
                    textAnchor="middle"
                    fill={demoMode === 'drift' ? '#EF4444' : isDark ? '#67E8F9' : '#00387e'}
                    fontFamily="'Space Grotesk', monospace"
                    fontSize="10"
                    fontWeight="700"
                  >
                    {uncertaintyLabel}
                  </text>
                </g>

                {/* Heading Directional Cone */}
                <path
                  d="M 215 142 L 195 82 A 46 46 0 0 1 235 82 Z"
                  fill={isDark ? '#00E5FF' : '#2563EB'}
                  opacity={isDark ? 0.22 : 0.18}
                />

                {/* Current Estimated Position Blue/Cyan Dot */}
                <circle
                  cx="215"
                  cy="142"
                  r="12"
                  fill={isDark ? '#00E5FF' : '#ffffff'}
                  filter="url(#softGlowLive)"
                  opacity={isDark ? 0.35 : 0.8}
                />
                <circle
                  cx="215"
                  cy="142"
                  r="8"
                  fill={demoMode === 'drift' ? '#DC2626' : isDark ? '#0284C7' : '#2563EB'}
                />
                <circle cx="215" cy="142" r="3.5" fill="#ffffff" />
              </svg>
            </div>

            {/* Pine Ridge Trailhead Pill (Bottom-left) */}
            <div
              className={`absolute bottom-4 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg border transition-colors ${
                isDark
                  ? 'bg-[#11201B]/90 border-[#234237] text-[#E2EBE7]'
                  : 'bg-white/95 border-slate-200 text-slate-800'
              }`}
            >
              <span className="material-symbols-outlined text-[15px] text-[#34D399]">flag</span>
              <span className="font-space text-[11px] font-bold">Pine Ridge Trailhead (1,240m)</span>
            </div>

            {/* High Ridge Pass Elevation Marker (Top-left) */}
            <div
              className={`absolute top-[85px] left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-md border transition-colors ${
                isDark
                  ? 'bg-[#142A22]/90 border-[#2E604F] text-white'
                  : 'bg-[#175c45] border-[#2E604F] text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[13px] text-[#6EE7B7]">north_east</span>
              <span className="font-space text-[11px] font-semibold text-[#D1FAE5]">
                High Ridge Pass (1,510m)
              </span>
            </div>

            {/* Top Mascot Speech Card (Topo Mole) */}
            <div className="absolute top-2 inset-x-3 z-10 flex flex-col gap-2 pointer-events-none">
              <div
                className={`pointer-events-auto w-full flex items-center gap-3 p-3 rounded-2xl backdrop-blur-2xl shadow-xl border transition-colors ${
                  isDark
                    ? 'bg-[#111F1B]/95 border-[#224036] text-white'
                    : 'bg-white/95 border-emerald-900/15 text-slate-900 shadow-md'
                }`}
              >
                <div
                  className={`relative w-16 h-16 shrink-0 rounded-2xl overflow-hidden flex items-center justify-center shadow-md border-2 ${
                    isDark ? 'bg-[#1B2B26] border-[#2F584A]' : 'bg-[#FAFAF7] border-emerald-700/30'
                  }`}
                >
                  <img
                    alt="Topo Mole Mascot"
                    className="w-full h-full object-cover transform scale-105"
                    src="https://lh3.googleusercontent.com/aida/AEtjO1V0jGClxPz69VsvIIGPOFZPVyikr8Z1WTzvyaH9dmp7ctIHmbVQOM0pxLjFbxXvLtdhUjSFixkPRZ3W6aiXkI99j7GNSXnC2cVAqdbk7WP4FEF9SaWfjtLib0qzqtLRcLtZW0T1BAPKpf9RdAx89xjX0TjcJVo3YyZ43D5KPILCLJdBl7B2seqSsBxNaB4Pav-1V0C_0a-venwgpTd4Oqc6mmkJeCf8A1EHwcqtxEPv2HT35y_MQ5sWXw"
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center shadow">
                    <span className="material-symbols-outlined text-[12px] text-[#064E3B]">
                      sensors
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-headline-sm text-[14px] font-extrabold flex items-center gap-1.5">
                      Topo Scout
                      <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                    </span>
                    <span
                      className={`font-space text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        isDark
                          ? 'text-[#A7F3D0] bg-[#064E3B] border-[#059669]/40'
                          : 'text-[#04513b] bg-[#aef1d2] border-[#92d4b7]'
                      }`}
                    >
                      Dead-Reckoning Active
                    </span>
                  </div>
                  <p
                    className={`font-body-sm text-[13px] font-medium leading-tight ${
                      isDark ? 'text-[#CFE4DC]' : 'text-slate-700'
                    }`}
                  >
                    {demoMode === 'drift'
                      ? '“Careful! We have drifted under dense canopy. Calibration recommended at next post!”'
                      : demoMode === 'calibrated'
                      ? '“Spot on! Position calibrated against ground marker #14 with pinpoint accuracy.”'
                      : '“I\'ve got your back! Tracking your steps with inertial sensors.”'}
                  </p>
                </div>
              </div>
            </div>

            {/* Floating Map Zoom/Recenter Controls */}
            <div className="absolute right-3.5 bottom-4 z-20 flex flex-col gap-2">
              <button
                aria-label="Re-center Estimated Position"
                onClick={handleRecenter}
                className={`w-11 h-11 rounded-2xl backdrop-blur-xl shadow-lg border flex items-center justify-center active:scale-90 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#12221D]/90 border-[#234237] text-[#34D399] hover:bg-[#1A332B]'
                    : 'bg-white/95 border-slate-200 text-[#004330] hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">near_me</span>
              </button>

              <button
                aria-label="Toggle Layers"
                onClick={() => setMapLayer((prev) => (prev === 'topo' ? 'satellite' : 'topo'))}
                className={`w-11 h-11 rounded-2xl backdrop-blur-xl shadow-lg border flex items-center justify-center active:scale-90 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#12221D]/90 border-[#234237] text-[#E2EBE7] hover:bg-[#1A332B]'
                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-[22px]">
                  {mapLayer === 'satellite' ? 'terrain' : 'layers'}
                </span>
              </button>

              <div
                className={`flex flex-col rounded-2xl backdrop-blur-xl shadow-lg border overflow-hidden ${
                  isDark ? 'bg-[#12221D]/90 border-[#234237]' : 'bg-white/95 border-slate-200'
                }`}
              >
                <button
                  aria-label="Zoom In"
                  onClick={() => handleZoom(1.15)}
                  className={`w-11 h-10 flex items-center justify-center active:scale-90 transition-colors cursor-pointer ${
                    isDark ? 'text-[#E2EBE7] hover:bg-[#1A332B]' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
                <div className={`w-full h-px ${isDark ? 'bg-[#234237]' : 'bg-slate-200'}`} />
                <button
                  aria-label="Zoom Out"
                  onClick={() => handleZoom(0.85)}
                  className={`w-11 h-10 flex items-center justify-center active:scale-90 transition-colors cursor-pointer ${
                    isDark ? 'text-[#E2EBE7] hover:bg-[#1A332B]' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">remove</span>
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Simulation State Switcher (Judge Demo Bar) */}
          <div className="px-3 mt-3 z-30">
            <div
              className={`w-full p-1.5 rounded-2xl backdrop-blur-md border flex items-center justify-between gap-1 shadow-md ${
                isDark ? 'bg-[#111F1B]/95 border-[#1E362E]' : 'bg-white/90 border-slate-200'
              }`}
            >
              <span
                className={`font-space text-[10px] uppercase font-bold pl-2 shrink-0 ${
                  isDark ? 'text-[#8FA39B]' : 'text-slate-500'
                }`}
              >
                Demo Modes:
              </span>
              <div className="flex items-center gap-1 flex-1 justify-end">
                <button
                  onClick={() => {
                    playChirpSound();
                    onSetDemoMode('normal');
                  }}
                  className={`px-2.5 py-1 rounded-xl font-space text-[11px] font-extrabold shadow-sm transition-all cursor-pointer ${
                    demoMode === 'normal'
                      ? 'bg-[#10B981] text-[#064E3B]'
                      : isDark
                      ? 'bg-[#182823] text-[#A6BFB5] hover:text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Normal (78%)
                </button>
                <button
                  onClick={() => {
                    playChirpSound();
                    onSetDemoMode('drift');
                  }}
                  className={`px-2.5 py-1 rounded-xl font-space text-[11px] font-bold transition-all cursor-pointer ${
                    demoMode === 'drift'
                      ? 'bg-amber-600 text-white font-extrabold'
                      : isDark
                      ? 'bg-[#182823] text-[#A6BFB5] hover:text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  High Drift (42%)
                </button>
                <button
                  onClick={() => {
                    playChirpSound();
                    onSetDemoMode('calibrated');
                  }}
                  className={`px-2.5 py-1 rounded-xl font-space text-[11px] font-bold transition-all cursor-pointer ${
                    demoMode === 'calibrated'
                      ? 'bg-emerald-600 text-white font-extrabold'
                      : isDark
                      ? 'bg-[#182823] text-[#A6BFB5] hover:text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Calibrated (96%)
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Dossier & Controls */}
          <div className="px-3 mt-2.5 z-30 flex flex-col gap-2.5">
            {/* Compact Floating Landmark Card */}
            <div
              className={`w-full rounded-2xl backdrop-blur-xl p-3 shadow-lg border flex items-center justify-between gap-3 ${
                isDark ? 'bg-[#12201B]/95 border-[#213C33]' : 'bg-white/95 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                    isDark
                      ? 'bg-[#1A332B] border-[#2A5244] text-[#34D399]'
                      : 'bg-[#aef1d2]/40 border-[#92d4b7] text-[#004330]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">deck</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-space text-[11px] uppercase font-bold tracking-wider ${
                        isDark ? 'text-[#34D399]' : 'text-[#004330]'
                      }`}
                    >
                      NEXT: WOODEN BRIDGE
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        isDark ? 'text-[#8FA39B]' : 'text-slate-500'
                      }`}
                    >
                      · 350 m
                    </span>
                  </div>
                  <span
                    className={`font-body-sm text-[12px] font-medium truncate ${
                      isDark ? 'text-[#CADAD3]' : 'text-slate-600'
                    }`}
                  >
                    Saved Checkpoint: Cross at south footbridge
                  </span>
                </div>
              </div>
              <button
                onClick={() => onInspectCheckpoint(woodenBridgeCheckpoint)}
                className={`h-9 px-3 rounded-xl font-space text-[11px] font-bold shrink-0 flex items-center gap-1 active:scale-95 transition-all border cursor-pointer ${
                  isDark
                    ? 'bg-[#1A3029] hover:bg-[#223E35] text-[#34D399] border-[#274B3E]'
                    : 'bg-slate-100 hover:bg-slate-200 text-[#004330] border-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                <span>View</span>
              </button>
            </div>

            {/* Position Confidence Card */}
            <div
              onClick={onNavigateToConfidence}
              className={`w-full rounded-2xl backdrop-blur-2xl p-3.5 shadow-xl border flex flex-col gap-2.5 cursor-pointer hover:border-emerald-500/50 transition-all ${
                isDark ? 'bg-[#12201B]/95 border-[#213C33]' : 'bg-white/95 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span
                    className={`font-space text-[10px] uppercase tracking-wider font-bold ${
                      isDark ? 'text-[#8FA39B]' : 'text-slate-400'
                    }`}
                  >
                    Dead-Reckoning Health
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline-sm text-[16px] font-extrabold">
                      Position Confidence
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full border font-space text-[11px] font-extrabold uppercase ${
                        demoMode === 'drift'
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : demoMode === 'calibrated'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#10B981]/20 border-[#10B981]/40 text-[#6EE7B7]'
                      }`}
                    >
                      {confidenceBadgeText}
                    </span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span
                    className={`font-space text-[22px] font-bold ${
                      demoMode === 'drift'
                        ? 'text-amber-400'
                        : isDark
                        ? 'text-[#34D399]'
                        : 'text-[#004330]'
                    }`}
                  >
                    {confidenceScore}
                    <span className="text-xs font-normal opacity-70">/100</span>
                  </span>
                  <span
                    className={`font-space text-[10px] font-bold uppercase ${
                      isDark ? 'text-[#8FA39B]' : 'text-slate-500'
                    }`}
                  >
                    {driftRateText}
                  </span>
                </div>
              </div>

              {/* Segmented Confidence Bar */}
              <div className="flex items-center gap-1.5 w-full">
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    demoMode === 'drift'
                      ? 'bg-amber-500'
                      : 'bg-[#10B981] shadow-sm shadow-[#10B981]/50'
                  }`}
                />
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    demoMode === 'drift'
                      ? 'bg-amber-500'
                      : 'bg-[#10B981] shadow-sm shadow-[#10B981]/50'
                  }`}
                />
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    demoMode === 'drift'
                      ? isDark
                        ? 'bg-[#20362F]'
                        : 'bg-slate-200'
                      : 'bg-[#10B981] shadow-sm shadow-[#10B981]/50'
                  }`}
                />
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    demoMode === 'drift'
                      ? isDark
                        ? 'bg-[#20362F]'
                        : 'bg-slate-200'
                      : demoMode === 'calibrated'
                      ? 'bg-[#10B981]'
                      : 'bg-[#10B981]/80'
                  }`}
                />
                <div
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    demoMode === 'calibrated'
                      ? 'bg-[#10B981]'
                      : isDark
                      ? 'bg-[#20362F]'
                      : 'bg-slate-200'
                  }`}
                />
              </div>

              <div
                className={`flex items-center justify-between pt-1 border-t ${
                  isDark ? 'border-[#1C332A] text-[#8FA39B]' : 'border-slate-100 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 font-space text-[11px] font-medium">
                  <span className="material-symbols-outlined text-[14px] text-amber-400">
                    satellite_alt
                  </span>
                  <span>{satLostText}</span>
                </div>
                <div className="flex items-center gap-1.5 font-space text-[11px] font-semibold">
                  <span className="material-symbols-outlined text-[14px] text-[#34D399]">
                    motion_mode
                  </span>
                  <span>2.4 km IMU track</span>
                </div>
              </div>
            </div>

            {/* Primary Glove-Friendly Outdoor CTA: Take Me Back */}
            <button
              onClick={() => {
                playChirpSound();
                onNavigateToBacktrack();
              }}
              className="w-full h-15 py-3.5 px-5 rounded-2xl bg-[#134E3A] hover:bg-[#165E47] active:scale-[0.98] text-white flex items-center justify-between shadow-2xl transition-all border border-[#34D399]/40 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
                  <span className="material-symbols-outlined text-[24px] text-[#A7F3D0]">
                    undo
                  </span>
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-headline-sm text-[17px] font-extrabold tracking-tight leading-tight text-white">
                    Take Me Back
                  </span>
                  <span className="font-body-sm text-[12px] text-[#A7F3D0] font-medium leading-none">
                    Reverse route along recorded path
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-black/25 px-3 py-1.5 rounded-full font-space text-[12px] text-[#E8F8F1] font-bold shrink-0 border border-white/15">
                <span className="material-symbols-outlined text-[16px] text-[#A7F3D0]">
                  turn_left
                </span>
                <span>1.8 km</span>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
