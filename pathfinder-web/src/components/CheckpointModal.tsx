import { Checkpoint } from '../types/navigation';

interface CheckpointModalProps {
  checkpoint: Checkpoint | null;
  onClose: () => void;
  isDark?: boolean;
}

export function CheckpointModal({ checkpoint, onClose, isDark = true }: CheckpointModalProps) {
  if (!checkpoint) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-end p-4 sm:items-center sm:justify-center transition-opacity duration-300 animate-in fade-in"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative w-full max-w-md rounded-3xl p-5 shadow-2xl flex flex-col gap-4 z-10 border ${
          isDark
            ? 'bg-[#14201c] border-[#233a32] text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#175c45] text-[#aef1d2] flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">pin_drop</span>
            </div>
            <div>
              <span className="text-[10px] font-space font-bold uppercase tracking-wider text-emerald-400">
                Saved Offline Checkpoint
              </span>
              <h3 className="font-headline-sm text-[18px] font-extrabold leading-tight">
                {checkpoint.title}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isDark ? 'bg-[#1e2e28] text-white hover:bg-[#253931]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div
            className={`p-3 rounded-2xl border ${
              isDark ? 'bg-[#0e1714] border-[#233a32]' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <span className="block text-[11px] font-space uppercase text-slate-400">Elevation</span>
            <span className="font-space font-bold text-[16px] text-emerald-400">
              {checkpoint.elevation}
            </span>
          </div>
          <div
            className={`p-3 rounded-2xl border ${
              isDark ? 'bg-[#0e1714] border-[#233a32]' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <span className="block text-[11px] font-space uppercase text-slate-400">Distance</span>
            <span className="font-space font-bold text-[16px]">{checkpoint.distance}</span>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-2xl border ${
            isDark ? 'bg-[#0e1714] border-[#233a32]' : 'bg-slate-50 border-slate-100'
          }`}
        >
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold font-space uppercase mb-1">
            <span className="material-symbols-outlined text-[15px]">info</span>
            <span>Terrain & Navigation Note</span>
          </div>
          <p className={`text-[13px] font-medium leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {checkpoint.note}
          </p>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-space text-slate-400">
            <span>Coordinates:</span>
            <span className="font-mono text-emerald-300">{checkpoint.coordinates}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full h-12 rounded-full bg-[#175c45] text-white font-headline-sm text-[15px] font-bold hover:bg-[#1f7257] active:scale-98 transition-all cursor-pointer shadow-md"
        >
          Return to Map
        </button>
      </div>
    </div>
  );
}
