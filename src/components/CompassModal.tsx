import { useEffect, useState } from 'react';

interface CompassModalProps {
  isOpen: boolean;
  onClose: () => void;
  heading?: number; // default heading degrees (e.g. 45)
  elevation?: string;
  incline?: string;
}

export function CompassModal({
  isOpen,
  onClose,
  heading: initialHeading = 45,
  elevation = '1,480 m',
  incline = '+12% slope',
}: CompassModalProps) {
  const [heading, setHeading] = useState<number>(initialHeading);
  const [deviceSensorAvailable, setDeviceSensorAvailable] = useState<boolean>(false);

  useEffect(() => {
    setHeading(initialHeading);
  }, [initialHeading]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        setDeviceSensorAvailable(true);
        // compass heading
        let compass = e.alpha;
        if ('webkitCompassHeading' in e) {
          compass = (e as unknown as { webkitCompassHeading: number }).webkitCompassHeading;
        }
        setHeading(Math.round(compass));
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Cardinal direction label
  const getCardinal = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
    return directions[index];
  };

  const cardinal = getCardinal(heading);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex flex-col justify-between p-6 transition-opacity duration-300 animate-in fade-in"
    >
      {/* Compass Top Header */}
      <div className="flex items-center justify-between pt-safe">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white text-[24px]">explore</span>
          <span className="font-headline-sm text-[18px] font-bold text-white tracking-wide">
            Digital Compass
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close compass"
          className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      </div>

      {/* Big Central Dial Section */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="relative w-72 h-72 rounded-full border border-white/20 flex items-center justify-center shadow-2xl">
          {/* Degree Tick Marks SVG */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300">
            {/* Circular Dial Degree ticks */}
            <circle
              cx="150"
              cy="150"
              fill="none"
              r="140"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1.5"
            />
            <circle
              cx="150"
              cy="150"
              fill="none"
              r="120"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />

            {/* Directional Markers */}
            <text
              fill="#EF4444"
              fontFamily="'Space Grotesk', monospace"
              fontSize="18"
              fontWeight="800"
              textAnchor="middle"
              x="150"
              y="32"
            >
              N
            </text>
            <text
              fill="#ffffff"
              fontFamily="'Space Grotesk', monospace"
              fontSize="16"
              fontWeight="700"
              textAnchor="middle"
              x="272"
              y="156"
            >
              E
            </text>
            <text
              fill="#ffffff"
              fontFamily="'Space Grotesk', monospace"
              fontSize="16"
              fontWeight="700"
              textAnchor="middle"
              x="150"
              y="280"
            >
              S
            </text>
            <text
              fill="#ffffff"
              fontFamily="'Space Grotesk', monospace"
              fontSize="16"
              fontWeight="700"
              textAnchor="middle"
              x="28"
              y="156"
            >
              W
            </text>

            {/* Rotating Needle Pointer Indicator */}
            <g
              transform={`rotate(${heading} 150 150)`}
              style={{ transition: 'transform 0.15s ease-out' }}
            >
              <polygon fill="#EF4444" points="150,45 142,150 158,150" />
              <polygon fill="#94A3B8" points="150,255 142,150 158,150" />
              <circle cx="150" cy="150" fill="#ffffff" r="6" />
            </g>
          </svg>

          {/* Center Telemetry Display */}
          <div className="flex flex-col items-center text-center z-10 pointer-events-none">
            <span className="font-space text-[48px] font-extrabold text-white tracking-tight leading-none">
              {heading}°
            </span>
            <span className="text-emerald-400 font-headline-sm text-[22px] font-bold mt-1 tracking-widest">
              {cardinal}
            </span>
            <span className="text-white/60 font-space text-[11px] uppercase tracking-wider mt-2">
              {deviceSensorAvailable ? 'Device Gyro Sensor Active' : 'True North Calibrated'}
            </span>
          </div>
        </div>

        {/* Manual Bearing Rotator for touch/desktop interaction */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setHeading((prev) => (prev - 15 + 360) % 360)}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-space text-[12px] font-bold active:scale-95 transition-all"
          >
            -15°
          </button>
          <span className="text-white/40 text-xs px-2 font-space">Drag or Tap to Test</span>
          <button
            onClick={() => setHeading((prev) => (prev + 15) % 360)}
            className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-space text-[12px] font-bold active:scale-95 transition-all"
          >
            +15°
          </button>
        </div>

        {/* Secondary Telemetry Pills */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-xs mt-6">
          <div className="bg-white/10 rounded-2xl p-3 text-center border border-white/10">
            <span className="block font-space text-[10px] text-white/60 uppercase">Elevation</span>
            <span className="font-space text-[18px] font-bold text-white">{elevation}</span>
          </div>
          <div className="bg-white/10 rounded-2xl p-3 text-center border border-white/10">
            <span className="block font-space text-[10px] text-white/60 uppercase">Incline</span>
            <span className="font-space text-[18px] font-bold text-emerald-400">{incline}</span>
          </div>
        </div>
      </div>

      {/* Bottom Done Dismiss Button */}
      <div className="pb-safe w-full">
        <button
          onClick={onClose}
          className="w-full h-14 rounded-2xl bg-white text-black font-headline-sm text-[16px] font-bold hover:bg-white/90 active:scale-[0.98] transition-all cursor-pointer shadow-lg"
        >
          Return to Live Navigation
        </button>
      </div>
    </div>
  );
}
