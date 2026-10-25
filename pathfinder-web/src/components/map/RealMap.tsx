// The real map on the Live screen: OpenStreetMap paths, roads, water and
// forest, official Lipas trails, landmarks, your beacons and your position.
// Drawn from data that ships with the app (see src/map/mapArea.ts), so it
// works offline. Styled to match the frontend team's design.
//
// - It follows your position while you hike. Drag it to look around; the
//   recenter button (or `recenterKey` changing) makes it follow you again.
// - `zoom` 1 shows about 1.2 km across the screen.

import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { Beacon } from '../../beacons/types';
import { isInside, type MapArea, useMapArea } from '../../map/mapArea';
import { linePath, makeProjector, shapePath } from '../../map/projection';
import type { Fix } from '../../tracking/engine';

const METRES_ACROSS_AT_ZOOM_1 = 1200;

type Props = {
  isDark: boolean;
  zoom: number;
  /** Change this number to re-centre the map on the hiker. */
  recenterKey: number;
  position: Fix | null;
  beacons: Beacon[];
  /** True when the satellite-style texture is shown behind the map. */
  textured: boolean;
};

const PLACE_COLOURS: Record<string, string> = {
  shelter: '#f59e0b',
  hut: '#f59e0b',
  viewpoint: '#a78bfa',
  water: '#38bdf8',
  parking: '#94a3b8',
};

export function RealMap({ isDark, zoom, recenterKey, position, beacons, textured }: Props) {
  const { area, error } = useMapArea();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 490 });
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [following, setFollowing] = useState(true);
  const drag = useRef<{ x: number; y: number; center: { lat: number; lon: number } } | null>(null);

  // Keep track of the map's size on screen.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Follow the hiker, or start at the middle of the map area.
  useEffect(() => {
    if (following && position) setCenter({ lat: position.lat, lon: position.lon });
    else if (!center && area) setCenter(area.center);
  }, [following, position, area, center]);

  // The recenter button: follow the hiker again.
  useEffect(() => {
    if (recenterKey > 0) setFollowing(true);
  }, [recenterKey]);

  const projector = useMemo(() => (area ? makeProjector(area.center.lat, area.center.lon) : null), [area]);
  const paths = useMemo(() => (area && projector ? buildPaths(area, projector) : null), [area, projector]);

  if (error) return <MapMessage isDark={isDark} text={`The map couldn’t load: ${error}`} />;
  if (!area || !projector || !paths || !center) return <MapMessage isDark={isDark} text="Loading map…" />;

  const metresAcross = METRES_ACROSS_AT_ZOOM_1 / zoom;
  const metresPerPixel = metresAcross / Math.max(size.width, 1);
  const metresDown = size.height * metresPerPixel;
  const [cx, cy] = projector.toXY(center.lat, center.lon);
  const viewBox = `${cx - metresAcross / 2} ${cy - metresDown / 2} ${metresAcross} ${metresDown}`;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, center };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.x) * metresPerPixel;
    const dy = (e.clientY - drag.current.y) * metresPerPixel;
    if (Math.abs(dx) + Math.abs(dy) < 2 * metresPerPixel) return; // a tap, not a drag
    const [startX, startY] = projector.toXY(drag.current.center.lat, drag.current.center.lon);
    const [lat, lon] = projector.toLatLon(startX - dx, startY - dy);
    setFollowing(false);
    setCenter({ lat, lon });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const colours = isDark
    ? { forest: '#10241c', park: '#132a20', wetland: '#13262a', water: '#12324a', waterLine: '#2d6f9c', road: '#33433d', majorRoad: '#4c5f57', path: '#86b8a0', route: '#34d399' }
    : { forest: '#cfe8d8', park: '#d8efdf', wetland: '#d4e8ea', water: '#a9d3f0', waterLine: '#5a9fd0', road: '#b9c7c0', majorRoad: '#97a8a0', path: '#3f7a5f', route: '#059669' };
  const fillOpacity = textured ? 0.75 : 1;
  const outside = position && !isInside(area, position.lat, position.lon);
  const posXY = position ? projector.toXY(position.lat, position.lon) : null;

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Map of ${area.name}`}
      >
        <g fillOpacity={fillOpacity}>
          <path d={paths.forest} fill={colours.forest} fillRule="evenodd" />
          <path d={paths.parks} fill={colours.park} fillRule="evenodd" />
          <path d={paths.wetland} fill={colours.wetland} fillRule="evenodd" />
          <path d={paths.water} fill={colours.water} fillRule="evenodd" />
        </g>
        <path d={paths.streams} fill="none" stroke={colours.waterLine} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <path d={paths.roads} fill="none" stroke={colours.road} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={paths.majorRoads} fill="none" stroke={colours.majorRoad} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={paths.paths} fill="none" stroke={colours.path} strokeWidth={1.4} strokeDasharray="4 3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Official Lipas trails: a soft glow under a bright line. */}
        <path d={paths.routes} fill="none" stroke={colours.route} strokeOpacity={0.25} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={paths.routes} fill="none" stroke={colours.route} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {area.places.map((place, i) => {
          const [x, y] = projector.toXY(place.lat, place.lon);
          return (
            <circle key={`p${i}`} cx={x} cy={y} r={6 * metresPerPixel} fill={PLACE_COLOURS[place.type] ?? '#94a3b8'} stroke={isDark ? '#0b1311' : '#ffffff'} strokeWidth={2 * metresPerPixel}>
              <title>{place.name}</title>
            </circle>
          );
        })}

        {/* Your beacons, numbered in the order they were dropped. */}
        {beacons.map((beacon, i) => {
          const [x, y] = projector.toXY(beacon.lat, beacon.lon);
          const r = 9 * metresPerPixel;
          return (
            <g key={beacon.id}>
              <circle cx={x} cy={y} r={r} fill={beacon.source === 'gps' ? '#10b981' : '#f59e0b'} stroke="#062a1d" strokeWidth={2 * metresPerPixel} />
              <text x={x} y={y} dy={4 * metresPerPixel} textAnchor="middle" fontSize={10 * metresPerPixel} fontWeight={800} fill="#062a1d" fontFamily="Space Grotesk, monospace">
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* You: the dot, inside a circle showing how far off GPS might be. */}
        {posXY && position && (
          <g>
            <circle cx={posXY[0]} cy={posXY[1]} r={position.accuracyM} fill={isDark ? '#00E5FF' : '#2563EB'} fillOpacity={0.15} stroke={isDark ? '#00E5FF' : '#2563EB'} strokeOpacity={0.6} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <circle cx={posXY[0]} cy={posXY[1]} r={8 * metresPerPixel} fill={isDark ? '#0284C7' : '#2563EB'} stroke="#ffffff" strokeWidth={3 * metresPerPixel} />
          </g>
        )}
      </svg>

      {outside && (
        <div className="absolute inset-x-3 bottom-16 z-10 px-3 py-2 rounded-xl bg-black/60 text-white text-[12px] text-center pointer-events-none">
          You’re outside the demo map ({area.name}), so only your position and beacons are shown.
        </div>
      )}
      <div
        className={`absolute left-2 bottom-1.5 z-10 px-1.5 py-0.5 rounded font-space text-[9px] pointer-events-none ${
          isDark ? 'bg-black/50 text-[#a6bfb5]' : 'bg-white/70 text-slate-600'
        }`}
      >
        © OpenStreetMap contributors · Lipas
      </div>
    </div>
  );
}

function buildPaths(area: MapArea, projector: ReturnType<typeof makeProjector>) {
  const lines = (list: [number, number][][]) => list.map((line) => linePath(line, projector)).join('');
  const shapes = (list: [number, number][][][]) => list.map((shape) => shapePath(shape, projector)).join('');
  return {
    forest: shapes(area.layers.forest),
    parks: shapes(area.layers.parks),
    wetland: shapes(area.layers.wetland),
    water: shapes(area.layers.water),
    streams: lines(area.layers.streams),
    roads: lines(area.layers.roads),
    majorRoads: lines(area.layers.majorRoads),
    paths: lines(area.layers.paths),
    routes: area.routes.map((route) => lines(route.lines)).join(''),
  };
}

function MapMessage({ isDark, text }: { isDark: boolean; text: string }) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center text-[13px] ${isDark ? 'text-[#8fa39b]' : 'text-slate-500'}`}>
      {text}
    </div>
  );
}
