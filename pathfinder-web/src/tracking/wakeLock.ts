// Keeps the screen on during a hike. A web page can't use GPS or sensors with
// the screen off, so hike mode keeps it awake (dimmed is fine).
//
// Browsers release the lock whenever the page is hidden (another app, screen
// turned off with the power button), so it's asked for again when the page comes back.

export type WakeLockStatus = 'off' | 'on' | 'unsupported' | 'refused';

export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private status: WakeLockStatus = 'off';

  constructor(private onChange: (status: WakeLockStatus) => void) {}

  async enable(): Promise<void> {
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    await this.acquire();
  }

  async disable(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const sentinel = this.sentinel;
    this.sentinel = null;
    await sentinel?.release().catch(() => {});
    this.setStatus('off');
  }

  private onVisibilityChange = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };

  private async acquire(): Promise<void> {
    if (!('wakeLock' in navigator)) {
      this.setStatus('unsupported');
      return;
    }
    if (this.sentinel && !this.sentinel.released) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.setStatus('on');
      this.sentinel.addEventListener('release', () => {
        // Released by the browser (page hidden). We ask again when it's visible.
        if (this.wanted) this.setStatus('off');
      });
    } catch {
      // For example: battery saver mode, or the page isn't visible right now.
      this.setStatus('refused');
    }
  }

  private setStatus(status: WakeLockStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.onChange(status);
  }
}
