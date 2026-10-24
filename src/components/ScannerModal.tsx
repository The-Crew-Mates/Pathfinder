import { useState } from 'react';
import confetti from 'canvas-confetti';
import { playChirpSound } from '../utils/audio';

interface ScannerModalProps {
  isOpen: boolean;
  targetName: string;
  onClose: () => void;
  onCalibrationSuccess: () => void;
  isDark?: boolean;
}

export function ScannerModal({
  isOpen,
  targetName,
  onClose,
  onCalibrationSuccess,
  isDark = true,
}: ScannerModalProps) {
  const [torchActive, setTorchActive] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    setIsScanning(true);
    playChirpSound();

    setTimeout(() => {
      setIsScanning(false);
      onClose();
      onCalibrationSuccess();

      // Confetti burst on successful calibration
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#34D399', '#10B981', '#00E5FF', '#A7F3D0'],
        });
      } catch {}
    }, 900);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end transition-opacity duration-300 animate-in fade-in"
    >
      {/* Touch dismiss backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative w-full max-h-[92vh] rounded-t-3xl overflow-hidden shadow-2xl flex flex-col z-10 border-t ${
          isDark
            ? 'bg-[#14201c] border-[#233a32] text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Top Modal Handle & Header */}
        <div
          className={`p-4 pb-3 flex items-center justify-between border-b ${
            isDark ? 'border-[#233a32]' : 'border-slate-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#175c45] flex items-center justify-center text-[#aef1d2] shadow-inner">
              <span className="material-symbols-outlined text-[20px]">photo_camera</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-[16px] font-bold leading-tight">
                Optical Trail Calibrator
              </h3>
              <p
                className={`font-body-sm text-[12px] ${
                  isDark ? 'text-[#92d4b7]' : 'text-slate-500'
                }`}
              >
                Target: {targetName}
              </p>
            </div>
          </div>
          <button
            aria-label="Close Scanner"
            onClick={onClose}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isDark ? 'bg-[#1e2e28] text-white hover:bg-[#253931]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Live Viewfinder Canvas */}
        <div className="p-4 flex flex-col gap-3.5">
          <div
            className={`relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden flex items-center justify-center ${
              torchActive ? 'brightness-125' : ''
            } bg-black`}
          >
            {/* Mountain Forest Simulated Camera Texture */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40 filter contrast-125"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(20, 50, 40, 0.4), rgba(5, 15, 12, 0.9)), url('https://lh3.googleusercontent.com/aida-public/AB6AXuCemcCbZMaQHwPnmuqPxjssJlz-8nBKT6NN2OoK75AGDLwZtMwId2_-5DCljVVzHfnSgwaQhWDcr9eTtHKekv_LOY8mS4pdyP6Isr1Wt_5ZYt_ctIvo0hAMn9WvNY2ebI0V0RctiebH0nl0aiC4c09WsurqWEb7wrIH5rHNpvgb1C9-_UaRZ0v84rl6ttH6WBVSb-V05HiFnznx-gyGRmhg1dYfiUwg6mRH7kUyOjr9UkS1pEqyNG98')`,
              }}
            />

            {/* Topo Grid Pattern Overlay */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#aef1d2_1.5px,transparent_1.5px)] [background-size:18px_18px]" />

            {/* Viewfinder Reticle with Brackets */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

              {/* Animated Laser Scanning Line */}
              <div
                className={`w-full h-1 bg-gradient-to-r from-transparent via-[#aef1d2] to-transparent shadow-[0_0_16px_#aef1d2] ${
                  isScanning ? 'animate-bounce' : 'animate-pulse'
                }`}
              />

              {/* QR Post Silhouette */}
              <div className="absolute flex flex-col items-center pointer-events-none opacity-60">
                <span className="material-symbols-outlined text-white text-[48px]">
                  qr_code_2
                </span>
                <span className="text-[10px] font-space text-emerald-300 font-bold uppercase tracking-wider mt-1">
                  USGS #14 MARKER
                </span>
              </div>
            </div>

            {/* Camera HUD Badges */}
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 text-white font-space text-[10px] tracking-wider flex items-center gap-1.5 backdrop-blur-sm border border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              OFFLINE OP-CV DETECTOR
            </div>

            {/* Torch Light Toggle Button */}
            <button
              aria-label="Toggle Torch"
              onClick={() => setTorchActive(!torchActive)}
              className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                torchActive ? 'bg-amber-400 text-slate-900 shadow-[0_0_15px_#fde047]' : 'bg-black/60 text-white hover:bg-black/80'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {torchActive ? 'flashlight_on' : 'flashlight_off'}
              </span>
            </button>

            {/* Viewfinder helper text */}
            <div className="absolute bottom-3 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md flex items-center gap-1.5 text-white/90 font-space text-[11px] border border-white/10">
              <span className="material-symbols-outlined text-[15px] text-emerald-400">
                center_focus_strong
              </span>
              <span>Align carved wooden post QR disc inside brackets</span>
            </div>
          </div>

          {/* Quick Action Simulation Trigger in Modal */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              onClick={handleSimulateScan}
              disabled={isScanning}
              className="w-full h-14 rounded-full bg-[#175c45] text-white font-headline-sm text-[16px] font-bold flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all hover:bg-[#1f7257] border border-[#34D399]/40 cursor-pointer disabled:opacity-75"
            >
              <span className="material-symbols-outlined text-[22px] text-[#A7F3D0]">
                {isScanning ? 'hourglass_top' : 'center_focus_strong'}
              </span>
              <span>
                {isScanning ? 'Calibrating Position...' : `Scan Marker: ${targetName}`}
              </span>
            </button>

            <button
              onClick={onClose}
              className={`w-full h-12 rounded-full font-body-sm text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#1e2e28] text-white/80 hover:bg-[#253931] border border-[#233a32]'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cancel & Keep Dead-Reckoning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
