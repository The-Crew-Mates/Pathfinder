// Browsers may delete a website's saved data when the phone runs low on space,
// unless the site is allowed "persistent storage". Beacons are safety data, so
// the app asks for it. Chrome on Android usually grants it without a prompt
// (especially once the app is added to the home screen).

export type PersistenceStatus = 'persistent' | 'best-effort' | 'unsupported';

/** Ask the browser to keep our data, and report whether it agreed. */
export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

/** How much space the app's saved data uses, in bytes, or null if the browser won't say. */
export async function storageUsedBytes(): Promise<number | null> {
  try {
    return (await navigator.storage?.estimate?.())?.usage ?? null;
  } catch {
    return null;
  }
}
