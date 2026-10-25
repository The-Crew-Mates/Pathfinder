/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ScreenId } from './types/navigation';
import { LiveNavigationScreen } from './components/screens/LiveNavigationScreen';
import { ActiveBacktrackScreen } from './components/screens/ActiveBacktrackScreen';
import { ConfidenceCalibrationScreen } from './components/screens/ConfidenceCalibrationScreen';
import { CompassModal } from './components/CompassModal';
import { DebugScreen } from './components/screens/DebugScreen';
import { playChirpSound } from './utils/audio';

export default function App() {
  // The debug screen has its own address (#debug), so it can be bookmarked and
  // opened directly while testing.
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(() =>
    window.location.hash === '#debug' ? 'debug' : 'live-trail',
  );

  useEffect(() => {
    const onHashChange = () => setCurrentScreen(window.location.hash === '#debug' ? 'debug' : 'live-trail');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const wanted = currentScreen === 'debug' ? '#debug' : '';
    if (window.location.hash !== wanted) {
      history.replaceState(null, '', wanted || window.location.pathname + window.location.search);
    }
  }, [currentScreen]);
  const [isDark, setIsDark] = useState<boolean>(true);

  // Modals state
  const [compassOpen, setCompassOpen] = useState<boolean>(false);

  return (
    <div className={`min-h-screen w-full flex flex-col justify-start items-center ${isDark ? 'bg-[#080d0c]' : 'bg-[#e0ece7]'}`}>
      {/* Mobile Shell Frame wrapper (optimized for iPhone / Android viewports while expanding gracefully) */}
      <div className={`w-full max-w-md min-h-screen relative shadow-2xl flex flex-col transition-colors ${isDark ? 'bg-[#0b1311]' : 'bg-[#effcf7]'}`}>
        
        {/* Main Active Screen */}
        <div className="flex-1 pb-16">
          {currentScreen === 'live-trail' && (
            <LiveNavigationScreen
              isDark={isDark}
              onOpenCompass={() => setCompassOpen(true)}
              onNavigateToConfidence={() => setCurrentScreen('confidence')}
            />
          )}

          {currentScreen === 'backtrack' && (
            <ActiveBacktrackScreen
              isDark={isDark}
              onBack={() => setCurrentScreen('live-trail')}
              onOpenCompass={() => setCompassOpen(true)}
            />
          )}

          {currentScreen === 'confidence' && (
            <ConfidenceCalibrationScreen
              isDark={isDark}
              onBack={() => setCurrentScreen('live-trail')}
              onOpenDebug={() => setCurrentScreen('debug')}
            />
          )}

          {currentScreen === 'debug' && (
            <DebugScreen isDark={isDark} onBack={() => setCurrentScreen('confidence')} />
          )}
        </div>

        {/* Global Bottom Tab Bar / Screen Switcher */}
        <nav
          className={`fixed bottom-0 max-w-md w-full z-40 px-3 py-2 border-t backdrop-blur-xl flex items-center justify-between pb-safe transition-colors ${
            isDark
              ? 'bg-[#0b1311]/95 border-[#1e302a] text-[#8fa39b]'
              : 'bg-white/95 border-slate-200 text-slate-500'
          }`}
        >
          {/* Tab 1: Live Trail */}
          <button
            onClick={() => {
              playChirpSound();
              setCurrentScreen('live-trail');
            }}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 cursor-pointer transition-all ${
              currentScreen === 'live-trail'
                ? 'text-[#34d399] font-bold scale-105'
                : 'hover:text-slate-200'
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: currentScreen === 'live-trail' ? "'FILL' 1" : "'FILL' 0" }}
            >
              navigation
            </span>
            <span className="font-space text-[10px] tracking-wide">Trail Nav</span>
          </button>

          {/* Tab 2: Active Backtrack */}
          <button
            onClick={() => {
              playChirpSound();
              setCurrentScreen('backtrack');
            }}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 cursor-pointer transition-all ${
              currentScreen === 'backtrack'
                ? 'text-[#34d399] font-bold scale-105'
                : 'hover:text-slate-200'
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: currentScreen === 'backtrack' ? "'FILL' 1" : "'FILL' 0" }}
            >
              undo
            </span>
            <span className="font-space text-[10px] tracking-wide">Backtrack</span>
          </button>

          {/* Tab 3: Confidence & Calibration */}
          <button
            onClick={() => {
              playChirpSound();
              setCurrentScreen('confidence');
            }}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 cursor-pointer transition-all ${
              currentScreen === 'confidence'
                ? 'text-[#34d399] font-bold scale-105'
                : 'hover:text-slate-200'
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: currentScreen === 'confidence' ? "'FILL' 1" : "'FILL' 0" }}
            >
              verified
            </span>
            <span className="font-space text-[10px] tracking-wide">Confidence</span>
          </button>

          {/* Theme Switcher Toggle (Night Vision vs Sunlight Contrast) */}
          <button
            onClick={() => {
              playChirpSound();
              setIsDark((prev) => !prev);
            }}
            title={isDark ? 'Switch to Sunlight Mode' : 'Switch to Night Vision Mode'}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer transition-all ${
              isDark ? 'text-amber-300' : 'text-emerald-700'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="font-space text-[10px] tracking-wide">
              {isDark ? 'Daylight' : 'Night'}
            </span>
          </button>
        </nav>

        {/* Global Modals */}
        <CompassModal isOpen={compassOpen} onClose={() => setCompassOpen(false)} />
      </div>
    </div>
  );
}
