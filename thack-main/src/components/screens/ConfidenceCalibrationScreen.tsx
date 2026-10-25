import { useState } from 'react';
import { DemoMode } from '../../types/navigation';
import { playChirpSound } from '../../utils/audio';

interface ConfidenceCalibrationScreenProps {
  isDark: boolean;
  demoMode: DemoMode;
  onSetDemoMode: (mode: DemoMode) => void;
  onBack: () => void;
  onOpenScanner: (targetPost: string) => void;
  showSuccessBanner: boolean;
  onDismissSuccessBanner: () => void;
}

export function ConfidenceCalibrationScreen({
  isDark,
  demoMode,
  onSetDemoMode,
  onBack,
  onOpenScanner,
  showSuccessBanner,
  onDismissSuccessBanner,
}: ConfidenceCalibrationScreenProps) {
  const [techOpen, setTechOpen] = useState<boolean>(false);

  // Computed state metrics based on demoMode
  const isDrifted = demoMode === 'drift';
  const isCalibrated = demoMode === 'calibrated';

  const score = isDrifted ? 42 : isCalibrated ? 98 : 78;
  const gradeText = isDrifted
    ? 'GRADE D (HIGH DRIFT)'
    : isCalibrated
    ? 'GRADE A+ (PERFECT)'
    : 'GRADE B+ (GOOD)';

  const uncertaintyText = isDrifted ? '±48 meters' : isCalibrated ? '±2 meters' : '±18 meters';
  const radiusText = isDrifted ? '±48m degraded radius' : isCalibrated ? '±2m pinpoint accuracy' : '±18m estimated radius';
  const primarySource = isDrifted
    ? 'Pedometer & Compass Only'
    : isCalibrated
    ? 'Optical Ground Calibrated'
    : 'Inertial Dead-Reckoning';
  const subsource = isDrifted
    ? 'Baro Drift Warning'
    : isCalibrated
    ? 'USGS Marker #14 Verified'
    : 'Canopy Fusion Mode';
  const driftVel = isDrifted ? '+3.4 m/min' : isCalibrated ? '0.0 m/min' : '+1.2 m/min';
  const timelineScore = isDrifted ? '42%' : isCalibrated ? '98%' : '78%';

  // SVG circular gauge (Circumference of r=50 is 2*PI*50 = 314.159)
  const circumference = 314.159;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const strokeColor = isDrifted
    ? '#d97706' // amber-600
    : isCalibrated
    ? '#059669' // emerald-600
    : '#175c45'; // primary

  return (
    <div
      className={`flex flex-col w-full min-h-screen ${
        isDark ? 'bg-[#0b1311] text-[#e6f4ef]' : 'bg-[#effcf7] text-[#121e1b]'
      }`}
    >
      {/* Top Navigation & Status Chrome */}
      <header
        className={`fixed top-0 w-full z-40 pt-safe backdrop-blur-xl border-b transition-colors ${
          isDark
            ? 'bg-[#0b1311]/95 border-[#233a32]'
            : 'bg-[#effcf7]/95 border-surface-container-highest/60'
        }`}
      >
        <div className="flex flex-col">
          {/* Status banner */}
          <div
            className={`h-6 px-4 flex items-center justify-between font-space text-[10px] border-b ${
              isDark
                ? 'bg-amber-950/40 border-amber-500/30'
                : 'bg-amber-500/10 border-amber-500/20'
            }`}
          >
            <div className="flex items-center gap-1.5 text-amber-500 font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              <span className="material-symbols-outlined text-[13px] text-amber-700">gps_off</span>
              <span className="uppercase tracking-widest text-[9.5px]">
                GPS UNAVAILABLE · ESTIMATED POSITION
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 font-space">
              <span className="text-[10px] font-bold">IMU DEAD-RECKONING</span>
              <span className="material-symbols-outlined text-[13px]">battery_charging_90</span>
            </div>
          </div>

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
                <h1 className="font-headline-sm text-[16px] font-bold truncate leading-tight">
                  Topo Confidence & Calibration
                </h1>
                <span className="font-space text-[11px] text-[#92d4b7] uppercase tracking-wider">
                  Eagle Peak Sector · Offline Safe
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pr-1 shrink-0">
              <button
                aria-label="Sensors Info"
                onClick={() => setTechOpen((prev) => !prev)}
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
          {/* Interactive Simulation Switcher (Hackathon Presentation Pills) */}
          <div
            className={`rounded-2xl p-2.5 shadow-sm border flex flex-col gap-1.5 ${
              isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="font-space text-[10px] uppercase font-bold tracking-wider text-[#92d4b7] flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-emerald-400">science</span>
                Hackathon Interactive Simulation
              </span>
              <span className="font-space text-[10px] text-[#aef1d2] font-semibold">
                Tap to test states
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <button
                onClick={() => {
                  playChirpSound();
                  onSetDemoMode('normal');
                }}
                className={`py-2 px-1 rounded-xl font-space text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${
                  demoMode === 'normal'
                    ? 'bg-[#175c45] text-white border-[#92d4b7]/50 shadow-sm'
                    : isDark
                    ? 'border-[#233a32] bg-[#0e1714] text-[#bfc9c2] hover:bg-[#162520]'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Current (78%)
              </button>
              <button
                onClick={() => {
                  playChirpSound();
                  onSetDemoMode('drift');
                }}
                className={`py-2 px-1 rounded-xl font-space text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${
                  demoMode === 'drift'
                    ? 'bg-amber-700 text-white border-amber-400 shadow-sm'
                    : isDark
                    ? 'border-[#233a32] bg-[#0e1714] text-[#bfc9c2] hover:bg-[#162520]'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Drifted (42%)
              </button>
              <button
                onClick={() => {
                  playChirpSound();
                  onSetDemoMode('calibrated');
                }}
                className={`py-2 px-1 rounded-xl font-space text-[11px] font-bold border transition-all active:scale-95 cursor-pointer ${
                  demoMode === 'calibrated'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                    : isDark
                    ? 'border-[#233a32] bg-[#0e1714] text-[#bfc9c2] hover:bg-[#162520]'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Calibrated (98%)
              </button>
            </div>
          </div>

          {/* Calibrate Success Banner (Shown after scanning) */}
          {showSuccessBanner && (
            <div className="bg-emerald-600 text-white rounded-2xl p-4 shadow-lg flex items-center justify-between gap-3 animate-bounce">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[24px] text-white">
                    check_circle
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-[16px] font-bold leading-tight">
                    Calibration Confirmed!
                  </span>
                  <span className="font-body-sm text-[13px] text-emerald-100">
                    Accuracy restored to ±2m · 98% Confidence Score
                  </span>
                </div>
              </div>
              <button
                onClick={onDismissSuccessBanner}
                className="px-3 py-1 rounded-full bg-white text-emerald-900 text-[11px] font-bold shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Primary Apple-Fitness-Style Circular Dial & Telemetry Card */}
          <div
            className={`relative rounded-3xl p-5 shadow-xl border flex flex-col gap-4 ${
              isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[20px] text-emerald-400">
                  verified
                </span>
                <span className="font-space text-[12px] text-[#92d4b7] tracking-wider uppercase font-bold">
                  Confidence Rating
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-space text-[11px] font-bold tracking-wide shadow-sm border ${
                  isDrifted
                    ? 'bg-amber-900/60 text-amber-200 border-amber-600'
                    : isCalibrated
                    ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500'
                    : 'bg-[#1b3b2f] text-[#aef1d2] border-[#286952]'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isDrifted ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span>{gradeText}</span>
              </span>
            </div>

            {/* Apple-Fitness Style Circular Dial */}
            <div className="flex flex-col items-center justify-center my-1">
              <div className="relative w-44 h-44 flex items-center justify-center">
                {/* SVG Gauge Background Track */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                  <circle
                    className={isDark ? 'text-[#1d2d27]' : 'text-slate-100'}
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                  />
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
                  <span className="font-space text-[46px] leading-none tracking-tight font-black">
                    {score}
                  </span>
                  <span className="font-space text-[10px] uppercase tracking-widest text-[#92d4b7] font-semibold mt-0.5">
                    / 100 CONFIDENCE
                  </span>
                  <span
                    className={`font-space text-[11px] font-bold mt-1 px-2.5 py-0.5 rounded-full border ${
                      isDrifted
                        ? 'bg-amber-900/40 text-amber-300 border-amber-700'
                        : 'bg-[#172b23] text-[#aef1d2] border-[#233a32]'
                    }`}
                  >
                    {radiusText}
                  </span>
                </div>
              </div>
            </div>

            {/* Key Consumer Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div
                className={`rounded-2xl p-3 flex items-center gap-3 border ${
                  isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#101b17] flex items-center justify-center shrink-0 text-[#aef1d2] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[22px]">target</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-space text-[10px] uppercase tracking-wider text-[#92d4b7] font-semibold">
                    Estimated Uncertainty
                  </span>
                  <span className="font-headline-sm text-[17px] font-extrabold truncate">
                    {uncertaintyText}
                  </span>
                </div>
              </div>

              <div
                className={`rounded-2xl p-3 flex items-center gap-3 border ${
                  isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#101b17] flex items-center justify-center shrink-0 text-[#92d4b7] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[22px]">forest</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-space text-[10px] uppercase tracking-wider text-[#92d4b7] font-semibold">
                    Primary Source
                  </span>
                  <span className="font-headline-sm text-[14px] font-bold truncate leading-snug">
                    {primarySource}
                  </span>
                  <span className="font-space text-[10px] text-emerald-400 font-medium">
                    {subsource}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Positioning Source Stack Card */}
          <div
            className={`rounded-3xl p-4 shadow-sm border flex flex-col gap-2.5 ${
              isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <span className="font-space text-[11px] uppercase tracking-wider text-[#92d4b7] font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">hub</span>
                Positioning Source Stack
              </span>
              <span className="font-space text-[11px] font-bold text-[#aef1d2]">
                {isCalibrated ? '3 OF 4 LIVE' : '2 OF 4 LIVE'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* IMU Sensors */}
              <div
                className={`p-2.5 rounded-2xl border flex flex-col gap-1 ${
                  isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-[18px] text-emerald-400">
                    screen_rotation
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#aef1d2] text-[#04513b]">
                    ACTIVE
                  </span>
                </div>
                <span className="font-body-sm text-[13px] font-bold">Motion IMU</span>
                <span className="font-space text-[10px] text-[#92d4b7]">
                  6-axis step dead-reckoning
                </span>
              </div>

              {/* Barometric Altimeter */}
              <div
                className={`p-2.5 rounded-2xl border flex flex-col gap-1 ${
                  isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-[18px] text-emerald-400">
                    altitude
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#aef1d2] text-[#04513b]">
                    ACTIVE
                  </span>
                </div>
                <span className="font-body-sm text-[13px] font-bold">Baro Altimeter</span>
                <span className="font-space text-[10px] text-[#92d4b7]">
                  Calibrated contour lock
                </span>
              </div>

              {/* Optical Trail Marker */}
              <div
                className={`p-2.5 rounded-2xl border flex flex-col gap-1 ${
                  isDark ? 'bg-[#182622] border-[#233a32]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-[18px] text-cyan-400">
                    qr_code_scanner
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isCalibrated
                        ? 'bg-emerald-500 text-white'
                        : isDrifted
                        ? 'bg-amber-300 text-amber-950 animate-pulse'
                        : isDark
                        ? 'bg-[#1e2e28] text-[#aef1d2]'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isCalibrated ? 'CALIBRATED' : isDrifted ? 'URGENT SCAN' : 'STANDBY'}
                  </span>
                </div>
                <span className="font-body-sm text-[13px] font-bold">Optical Marker</span>
                <span className="font-space text-[10px] text-[#92d4b7]">
                  {isCalibrated ? 'Marker #14 locked' : 'QR Post scan ready'}
                </span>
              </div>

              {/* Satellite GPS */}
              <div
                className={`p-2.5 rounded-2xl border opacity-85 flex flex-col gap-1 ${
                  isDark ? 'bg-[#131e1a] border-[#233a32]/60' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-[18px] text-slate-400">
                    satellite_alt
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/60 text-slate-300">
                    UNAVAILABLE
                  </span>
                </div>
                <span className="font-body-sm text-[13px] font-bold opacity-80">Satellite GPS</span>
                <span className="font-space text-[10px] text-red-400 font-medium">
                  Blocked by dense canopy
                </span>
              </div>
            </div>
          </div>

          {/* Technical Diagnostics Accordion */}
          <div
            className={`rounded-3xl border shadow-sm overflow-hidden transition-all ${
              isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
            }`}
          >
            <button
              onClick={() => setTechOpen((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#1e2e28] flex items-center justify-center text-[#aef1d2] border border-[#233a32]">
                  <span className="material-symbols-outlined text-[18px]">developer_board</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-body-md text-[14px] font-bold">
                    Technical Sensor Diagnostics
                  </span>
                  <span className="font-space text-[11px] text-[#92d4b7]">
                    Tap to inspect raw IMU drift, offsets & decay timeline
                  </span>
                </div>
              </div>
              <span
                className={`material-symbols-outlined text-[22px] text-slate-400 transition-transform duration-300 ${
                  techOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            {techOpen && (
              <div
                className={`border-t p-4 flex flex-col gap-3.5 animate-in fade-in ${
                  isDark ? 'border-[#233a32] bg-[#0f1815]' : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                {/* Detailed telemetry pills */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div
                    className={`rounded-xl p-2.5 border flex items-center justify-between sm:flex-col sm:items-start ${
                      isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[12px] text-slate-400">Drift Velocity</span>
                    <span className="font-space text-[16px] font-bold text-emerald-400">
                      {driftVel}
                    </span>
                  </div>
                  <div
                    className={`rounded-xl p-2.5 border flex items-center justify-between sm:flex-col sm:items-start ${
                      isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[12px] text-slate-400">6-Axis IMU Noise</span>
                    <span className="font-space text-[16px] font-bold">0.038 g/deg</span>
                  </div>
                  <div
                    className={`rounded-xl p-2.5 border flex items-center justify-between sm:flex-col sm:items-start ${
                      isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className="text-[12px] text-slate-400">Baro Elev Offset</span>
                    <span className="font-space text-[16px] font-bold">±2.1 m</span>
                  </div>
                </div>

                {/* Sensor Decay Timeline */}
                <div className="flex flex-col gap-2 pt-1">
                  <span className="font-space text-[11px] text-slate-400 uppercase tracking-wider font-bold">
                    Sensor Decay & Fix Timeline
                  </span>
                  <div className="relative pl-5 flex flex-col gap-3 py-1">
                    <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-slate-700/60" />

                    <div className="relative flex items-start justify-between text-body-sm">
                      <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-[#14201c]" />
                      <div>
                        <p className="font-body-sm text-[13px] font-semibold">
                          10:15 AM • Last GPS Satellite Lock
                        </p>
                        <p className="text-[11px] text-slate-400">
                          5 constellation satellites verified prior to ravine descent
                        </p>
                      </div>
                      <span className="font-space text-[11px] text-emerald-400 font-bold shrink-0">
                        ±2m
                      </span>
                    </div>

                    <div className="relative flex items-start justify-between text-body-sm">
                      <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-amber-500 ring-4 ring-[#14201c]" />
                      <div>
                        <p className="font-body-sm text-[13px] font-semibold">
                          10:45 AM • Dense Canopy Drift Began
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Automatic transition to pedometer & electronic compass
                        </p>
                      </div>
                      <span className="font-space text-[11px] text-amber-400 font-bold shrink-0">
                        +8m
                      </span>
                    </div>

                    <div className="relative flex items-start justify-between text-body-sm">
                      <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-cyan-400 ring-4 ring-[#14201c]" />
                      <div>
                        <p className="font-body-sm text-[13px] font-semibold">
                          Current State • Inertial Dead-Reckoning
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Calibrate via optical marker within 400m recommended
                        </p>
                      </div>
                      <span className="font-space text-[11px] text-cyan-300 font-bold shrink-0">
                        {timelineScore}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Expressive Topo Mascot Card Holding QR Marker */}
          <div
            className={`relative rounded-3xl p-4 shadow-sm border flex items-center gap-3.5 overflow-hidden ${
              isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
            }`}
          >
            <div className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden bg-[#fafaf7] p-1 flex items-center justify-center shadow-md border border-[#233a32]">
              <img
                alt="Topo the friendly mole holding a wooden trail marker QR sign"
                className="w-full h-full object-contain"
                src="https://lh3.googleusercontent.com/aida/AEtjO1XT-5kR9wdlBClIo8qmdrlyUSRWP9Zlahyqh7WjnpHvwRlbW_ek4ihanMwHLe3okiNdRmWjjKGUiQAPLSd87ndHYyUoEPsLADyNCKTedYNarj0QUdU28VtpTixUCYNHN3CHpJjFob0WQP4Xe6Kw4mj4buP7_g2HCXK9ABihbtWs19ViLT-Xh5E5adMLBJCzjCpSciwd3-dZ7w_XkP0lTtgadnWMLf6Nv9GssqbhJDGaaRc9mkc_l2b-oQ"
              />
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="inline-flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">eco</span>
                <span className="font-space text-[10px] font-bold text-[#aef1d2] uppercase tracking-wide">
                  Topo's Trail Tip
                </span>
              </div>
              <p className="font-body-md text-[13px] font-semibold leading-snug">
                "Spotted a trail post? Point your camera at its QR marker to calibrate our position back to 100%!"
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-[#92d4b7] font-space text-[11px] font-bold">
                <span className="material-symbols-outlined text-[14px]">near_me</span>
                <span>Nearest marker: #14 Eagle Peak (120m ahead)</span>
              </div>
            </div>
          </div>

          {/* Known Nearby Trail Posts */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-emerald-400">signpost</span>
                <span className="font-space text-[11px] uppercase tracking-wider text-[#92d4b7] font-bold">
                  Offline Trail Calibration Posts
                </span>
              </div>
              <span className="font-space text-[10px] font-bold text-[#aef1d2]">3 DOWNLOADED</span>
            </div>

            {/* Checkpoint 1 (Nearest) */}
            <div
              className={`rounded-2xl p-3.5 shadow-sm border flex items-center justify-between gap-2 ${
                isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-[#1b3b2f] flex items-center justify-center text-[#aef1d2] border border-[#286952] shrink-0 font-space text-[16px] font-bold">
                  #14
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="font-body-md text-[14px] font-bold truncate">
                    Eagle Peak Spur Junction
                  </p>
                  <div className="flex items-center gap-2 font-space text-[11px] text-slate-400">
                    <span>Elev 1,840m</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">120m ahead (Walk ~2 min)</span>
                  </div>
                </div>
              </div>
              <button
                aria-label="Scan Post 14"
                onClick={() => onOpenScanner('#14 Eagle Peak Spur')}
                className="h-11 px-4 rounded-full bg-[#175c45] text-white border border-[#92d4b7]/50 font-space text-[12px] font-bold hover:bg-[#1b6b50] transition-all active:scale-95 shrink-0 flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                <span>Scan</span>
              </button>
            </div>

            {/* Checkpoint 2 */}
            <div
              className={`rounded-2xl p-3.5 shadow-sm border flex items-center justify-between gap-2 ${
                isDark ? 'bg-[#14201c] border-[#233a32]' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-[#1e2e28] flex items-center justify-center text-[#92d4b7] border border-[#233a32] shrink-0 font-space text-[16px] font-bold">
                  #13
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="font-body-md text-[14px] font-bold truncate">
                    Pine Creek Footbridge
                  </p>
                  <div className="flex items-center gap-2 font-space text-[11px] text-slate-400">
                    <span>Elev 1,690m</span>
                    <span>•</span>
                    <span>650m behind</span>
                  </div>
                </div>
              </div>
              <button
                aria-label="Scan Post 13"
                onClick={() => onOpenScanner('#13 Pine Creek Footbridge')}
                className="h-11 px-4 rounded-full bg-[#1e2e28] text-white border border-[#233a32] font-space text-[12px] font-semibold hover:bg-[#253931] transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                Scan
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Primary Floating Glove-Friendly Trigger Button */}
      <div className="fixed bottom-0 inset-x-0 p-4 pb-safe bg-gradient-to-t from-[#0b1311] via-[#0b1311]/95 to-transparent z-30">
        <button
          onClick={() => onOpenScanner('#14 Eagle Peak Spur')}
          className="w-full h-14 rounded-full bg-[#175c45] text-white flex items-center justify-center gap-2.5 shadow-xl hover:bg-[#1f7257] transition-all active:scale-[0.98] border-2 border-[#aef1d2]/20 font-headline-sm text-[16px] font-bold cursor-pointer"
        >
          <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
          <span>Open Trail Marker Scanner</span>
        </button>
      </div>
    </div>
  );
}
