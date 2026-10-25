// The demo map's data: real OpenStreetMap features for one area, built by
// scripts/build_demo_map.py and shipped inside the app (public/maps/), so the
// map works offline.

import { useEffect, useState } from 'react';

/** [lat, lon] */
export type Point = [number, number];
/** A filled shape: one or more rings (a lake with islands has several). */
export type Shape = Point[][];

export type MapArea = {
  formatVersion: number;
  id: string;
  name: string;
  center: { lat: number; lon: number };
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
  attributions: string[];
  layers: {
    water: Shape[];
    forest: Shape[];
    parks: Shape[];
    wetland: Shape[];
    majorRoads: Point[][];
    roads: Point[][];
    paths: Point[][];
    streams: Point[][];
  };
  routes: { lipasId: number; name: string; typeCode: number; lines: Point[][] }[];
  places: { name: string; type: string; lat: number; lon: number }[];
};

export const DEMO_AREA_ID = 'tampere-varala';

/** True if the point is inside the area's box. */
export function isInside(area: MapArea, lat: number, lon: number): boolean {
  const [south, west, north, east] = area.bbox;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

/** Load the demo map. It comes with the app, so this works offline. */
export function useMapArea(id = DEMO_AREA_ID): { area: MapArea | null; error: string | null } {
  const [state, setState] = useState<{ area: MapArea | null; error: string | null }>({ area: null, error: null });

  useEffect(() => {
    let stillWanted = true;
    fetch(`${import.meta.env.BASE_URL}maps/${id}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`map file not found (${response.status})`);
        return response.json() as Promise<MapArea>;
      })
      .then((area) => {
        if (stillWanted) setState({ area, error: null });
      })
      .catch((e: unknown) => {
        if (stillWanted) setState({ area: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      stillWanted = false;
    };
  }, [id]);

  return state;
}
