/**
 * Web Audio API synthesizer for outdoor emergency whistle
 * Standard Alpine Emergency Signal: 3 short bursts of high-frequency dual tone
 */
export function playSafetyWhistle(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        resolve();
        return;
      }

      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const burstDuration = 0.28;
      const burstGap = 0.14;
      const bursts = 3;

      for (let i = 0; i < bursts; i++) {
        const startTime = now + i * (burstDuration + burstGap);
        const stopTime = startTime + burstDuration;

        // Whistle primary tone (around 2850Hz) and harmonic resonance (3200Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Characteristic whistle trill (LFO modulation)
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(32, startTime); // 32 Hz warble/trill
        lfoGain.gain.setValueAtTime(120, startTime);

        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);
        lfoGain.connect(osc2.frequency);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(2850, startTime);
        osc1.frequency.exponentialRampToValueAtTime(2950, startTime + 0.1);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(3250, startTime);

        // Amplitude envelope (sharp attack, slight decay, smooth release)
        gainNode.gain.setValueAtTime(0.001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
        gainNode.gain.setValueAtTime(0.3, stopTime - 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(startTime);
        osc2.start(startTime);
        lfo.start(startTime);

        osc1.stop(stopTime);
        osc2.stop(stopTime);
        lfo.stop(stopTime);
      }

      setTimeout(() => {
        try {
          ctx.close();
        } catch {}
        resolve();
      }, (bursts * (burstDuration + burstGap) + 0.2) * 1000);
    } catch (e) {
      console.warn('Audio playback error', e);
      resolve();
    }
  });
}

/**
 * Gentle haptic and audio click feedback for button interactions
 */
export function playChirpSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1440, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => ctx.close(), 120);
  } catch {}
}
