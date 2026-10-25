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

/** "80 m", or "1.4 km" from a kilometre up. */
export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/** "315° NW": a compass direction in degrees, with the nearest of the 8 compass points. */
export function formatBearing(degrees: number): string {
  const rounded = ((Math.round(degrees) % 360) + 360) % 360;
  const point = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(rounded / 45) % 8];
  return `${String(rounded).padStart(3, '0')}° ${point}`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
