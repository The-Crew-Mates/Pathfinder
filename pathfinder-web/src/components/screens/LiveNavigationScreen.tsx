import { useState } from 'react';
import { GpsStatusBanner, HikePanel, scoutMessage } from '../hike/HikeUi';
import { RealMap } from '../map/RealMap';
import { useMapArea } from '../../map/mapArea';
import { useHike } from '../../tracking/HikeProvider';
import { DemoMode, Checkpoint } from '../../types/navigation';
import { playChirpSound } from '../../utils/audio';
import mapTexture from '../../assets/images/map-texture.png';
import moleMascot from '../../assets/images/mole-mascot.jpg';

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
  const hikeState = useHike();
  const { area: mapArea } = useMapArea();
  const scout = scoutMessage(hikeState);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [mapLayer, setMapLayer] = useState<'topo' | 'satellite'>('topo');
  const [isRecentering, setIsRecentering] = useState<boolean>(false);
  const [recenterCount, setRecenterCount] = useState(0);

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
    setZoomScale((prev) => Math.min(Math.max(prev * delta, 0.25), 8));
  };

  const handleRecenter = () => {
    playChirpSound();
    setIsRecentering(true);
    setRecenterCount((n) => n + 1);
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
          {/* Live GPS status (HikeUi.tsx) */}
          <GpsStatusBanner isDark={isDark} />

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
                  Pathfinder Live Navigation
                </span>
                <h1 className="font-headline-sm text-[17px] font-extrabold leading-tight">
                  {mapArea?.name ?? 'Live map'}
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
                  backgroundImage: `url('${mapTexture}')`,
                }}
              />
            )}

            {/* Real map: OpenStreetMap + Lipas data shipped with the app (RealMap.tsx) */}
            <RealMap
              isDark={isDark}
              zoom={zoomScale}
              recenterKey={recenterCount}
              position={hikeState.lastFix}
              beacons={hikeState.beacons}
              textured={mapLayer === 'satellite'}
            />

            {/* Top Mascot Speech Card (Pathfinder mole) */}
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
                    alt="Pathfinder mole mascot"
                    className="w-full h-full object-cover transform scale-105"
                    src={moleMascot}
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
                      Pathfinder Scout
                      <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                    </span>
                    <span
                      className={`font-space text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        isDark
                          ? 'text-[#A7F3D0] bg-[#064E3B] border-[#059669]/40'
                          : 'text-[#04513b] bg-[#aef1d2] border-[#92d4b7]'
                      }`}
                    >
                      {scout.badge}
                    </span>
                  </div>
                  <p
                    className={`font-body-sm text-[13px] font-medium leading-tight ${
                      isDark ? 'text-[#CFE4DC]' : 'text-slate-700'
                    }`}
                  >
                    {scout.text}
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
                  onClick={() => handleZoom(1.5)}
                  className={`w-11 h-10 flex items-center justify-center active:scale-90 transition-colors cursor-pointer ${
                    isDark ? 'text-[#E2EBE7] hover:bg-[#1A332B]' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
                <div className={`w-full h-px ${isDark ? 'bg-[#234237]' : 'bg-slate-200'}`} />
                <button
                  aria-label="Zoom Out"
                  onClick={() => handleZoom(1 / 1.5)}
                  className={`w-11 h-10 flex items-center justify-center active:scale-90 transition-colors cursor-pointer ${
                    isDark ? 'text-[#E2EBE7] hover:bg-[#1A332B]' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">remove</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hike mode: start/end the hike and drop beacons (HikeUi.tsx) */}
          <div className="px-3 mt-3 z-30">
            <HikePanel isDark={isDark} />
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
