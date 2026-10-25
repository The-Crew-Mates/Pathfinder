/** "14:05" for today, or "25 Oct 14:05" for another day. */
export function formatTime(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (new Date(now).toDateString() === date.toDateString()) return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

/** "±8 m", or "±1.2 km" for big uncertainties. */
export function formatAccuracy(metres: number): string {
  return metres >= 1000 ? `±${(metres / 1000).toFixed(1)} km` : `±${Math.round(metres)} m`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
