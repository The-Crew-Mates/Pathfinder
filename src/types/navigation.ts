export type ScreenId = 'live-trail' | 'backtrack' | 'confidence';

export type DemoMode = 'normal' | 'drift' | 'calibrated';

export type ThemeMode = 'dark' | 'light';

export interface ConfidenceData {
  score: number;
  grade: string;
  badgeClassDark: string;
  badgeClassLight: string;
  dotClass: string;
  uncertaintyRadius: string;
  source: string;
  subsource: string;
  driftVelocity: string;
  timelineScore: string;
  strokeColor: string;
  dashOffset: number; // calculated from score (circumference = 314.159)
  satLostText: string;
  opticalStatus: 'STANDBY' | 'URGENT SCAN' | 'CALIBRATED';
}

export interface Checkpoint {
  id: string;
  title: string;
  elevation: string;
  distance: string;
  note: string;
  coordinates: string;
  type: 'bridge' | 'lake' | 'pass' | 'trailhead' | 'junction';
}
