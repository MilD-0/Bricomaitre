'use client';

import { useId, useMemo, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

import geometry from './data/algeria-wilayas-58.json';

type Coordinate = [number, number];
type PolygonCoordinates = Coordinate[][];
type Feature = {
  properties: { nam: string };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: PolygonCoordinates | PolygonCoordinates[];
  };
};

type WilayaValue = {
  name: string;
  postedOrders: number;
  activeOrders: number;
  terminalPaidRatePct: number | null;
  deliveryMedianHours: number | null;
  averageAttempts: number | null;
};

type Projection = (coordinate: Coordinate) => string;
type MapLayer = 'country' | 'north';
type TooltipPosition = { x: number; y: number; name: string; layer: MapLayer };

function normalizeWilayaName(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const aliases: Record<string, string> = {
    ELMGHAIR: 'MEGHAIER',
    ELMGHAIER: 'MEGHAIER',
    ELMENIA: 'MENIAA',
    ELMENIAA: 'MENIAA',
  };
  return aliases[normalized] ?? normalized;
}

function polygonList(feature: Feature) {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as PolygonCoordinates]
    : (feature.geometry.coordinates as PolygonCoordinates[]);
}

function makeProjection({
  width,
  height,
  padding,
  minLongitude,
  maxLongitude,
  minLatitude,
  maxLatitude,
}: {
  width: number;
  height: number;
  padding: number;
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
}): Projection {
  const scale = Math.min(
    (width - padding * 2) / (maxLongitude - minLongitude),
    (height - padding * 2) / (maxLatitude - minLatitude),
  );
  const projectedWidth = (maxLongitude - minLongitude) * scale;
  const projectedHeight = (maxLatitude - minLatitude) * scale;
  const offsetX = (width - projectedWidth) / 2;
  const offsetY = (height - projectedHeight) / 2;

  return ([longitude, latitude]) => {
    const x = offsetX + (longitude - minLongitude) * scale;
    const y = offsetY + (maxLatitude - latitude) * scale;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };
}

function pathFor(feature: Feature, project: Projection) {
  return polygonList(feature)
    .flatMap((polygon) => polygon.map((ring) => `M${ring.map(project).join('L')}Z`))
    .join('');
}

function fillFor(value: number, maximum: number) {
  if (value <= 0 || maximum <= 0) return 'hsl(var(--muted))';
  const intensity = Math.sqrt(value / maximum);
  return `hsl(var(--chart-1) / ${(0.22 + intensity * 0.76).toFixed(2)})`;
}

const features = geometry.features as unknown as Feature[];
const allCoordinates = features.flatMap((feature) =>
  polygonList(feature).flatMap((polygon) => polygon.flat()),
);
const minLongitude = Math.min(...allCoordinates.map(([longitude]) => longitude));
const maxLongitude = Math.max(...allCoordinates.map(([longitude]) => longitude));
const minLatitude = Math.min(...allCoordinates.map(([, latitude]) => latitude));
const maxLatitude = Math.max(...allCoordinates.map(([, latitude]) => latitude));

const countryWidth = 640;
const countryHeight = 560;
const countryProjection = makeProjection({
  width: countryWidth,
  height: countryHeight,
  padding: 14,
  minLongitude,
  maxLongitude,
  minLatitude,
  maxLatitude,
});

const northWidth = 640;
const northHeight = 178;
const northProjection = makeProjection({
  width: northWidth,
  height: northHeight,
  padding: 8,
  minLongitude: -2.35,
  maxLongitude: 8.75,
  minLatitude: 34.15,
  maxLatitude: 37.2,
});

const countryPaths = new Map(
  features.map((feature) => [feature.properties.nam, pathFor(feature, countryProjection)]),
);
const northPaths = new Map(
  features.map((feature) => [feature.properties.nam, pathFor(feature, northProjection)]),
);

function MapTooltip({
  position,
  row,
  number,
}: {
  position: TooltipPosition | null;
  row: WilayaValue | undefined;
  number: Intl.NumberFormat;
}) {
  if (!position) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 min-w-36 border border-border/80 bg-popover px-3 py-2 text-xs shadow-lg"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      <p className="font-semibold text-popover-foreground">{row?.name ?? position.name}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {number.format(row?.postedOrders ?? 0)} posted
      </p>
    </div>
  );
}

export function AlgeriaWilayaMap({ rows, locale }: { rows: WilayaValue[]; locale: string }) {
  const byName = useMemo(
    () => new Map(rows.map((row) => [normalizeWilayaName(row.name), row])),
    [rows],
  );
  const rankedRows = useMemo(
    () => [...rows].sort((left, right) => right.postedOrders - left.postedOrders),
    [rows],
  );
  const [selectedName, setSelectedName] = useState<string | null>(rankedRows[0]?.name ?? null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipPosition | null>(null);
  const northClipId = useId();
  const maximum = Math.max(0, ...rows.map((row) => row.postedOrders));
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = (value: number | null) => (value == null ? '—' : `${number.format(value)}%`);
  const duration = (value: number | null) =>
    value == null
      ? '—'
      : value < 48
        ? `${number.format(value)} h`
        : `${number.format(value / 24)} d`;
  const resolvedSelectedName =
    selectedName && byName.has(normalizeWilayaName(selectedName))
      ? selectedName
      : (rankedRows[0]?.name ?? null);
  const activeName = hoveredName ?? resolvedSelectedName;
  const activeRow = activeName ? byName.get(normalizeWilayaName(activeName)) : undefined;

  function positionTooltip(
    name: string,
    layer: MapLayer,
    target: SVGPathElement,
    clientPosition?: { x: number; y: number },
  ) {
    const frame = target.closest<HTMLElement>('[data-map-frame]');
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const rawX = clientPosition?.x ?? targetRect.left + targetRect.width / 2;
    const rawY = clientPosition?.y ?? targetRect.top;
    setTooltip({
      name,
      layer,
      x: Math.max(80, Math.min(frameRect.width - 80, rawX - frameRect.left)),
      y: Math.max(54, rawY - frameRect.top),
    });
  }

  function handlePointer(name: string, layer: MapLayer, event: PointerEvent<SVGPathElement>) {
    setHoveredName(name);
    positionTooltip(name, layer, event.currentTarget, { x: event.clientX, y: event.clientY });
  }

  function handleFocus(name: string, layer: MapLayer, event: FocusEvent<SVGPathElement>) {
    setHoveredName(name);
    positionTooltip(name, layer, event.currentTarget);
  }

  function mapPaths(layer: MapLayer) {
    const paths = layer === 'country' ? countryPaths : northPaths;
    return (
      <>
        <g data-map-layer={layer}>
          {features.map((feature) => {
            const featureName = feature.properties.nam;
            const row = byName.get(normalizeWilayaName(featureName));
            const isActive = activeName
              ? normalizeWilayaName(activeName) === normalizeWilayaName(featureName)
              : false;
            return (
              <path
                key={`${layer}-visible-${featureName}`}
                d={paths.get(featureName)}
                fill={fillFor(row?.postedOrders ?? 0, maximum)}
                fillRule="evenodd"
                stroke={isActive ? 'hsl(var(--foreground))' : 'hsl(var(--background))'}
                strokeWidth={isActive ? 2.2 : 1}
                vectorEffect="non-scaling-stroke"
                className="transition-[fill,opacity,stroke] duration-150"
              />
            );
          })}
        </g>
        <g data-map-hit-layer={layer}>
          {features.map((feature) => {
            const featureName = feature.properties.nam;
            const row = byName.get(normalizeWilayaName(featureName));
            const label = `${row?.name ?? featureName}: ${number.format(row?.postedOrders ?? 0)} posted, ${percent(row?.terminalPaidRatePct ?? null)} paid among resolved orders`;
            return (
              <path
                key={`${layer}-hit-${featureName}`}
                d={paths.get(featureName)}
                fill="transparent"
                fillRule="evenodd"
                stroke="transparent"
                strokeWidth={layer === 'country' ? 11 : 12}
                vectorEffect="non-scaling-stroke"
                pointerEvents="all"
                tabIndex={0}
                role="button"
                aria-label={label}
                className="cursor-pointer outline-none focus-visible:stroke-[hsl(var(--foreground))] focus-visible:stroke-2"
                onPointerEnter={(event) => handlePointer(featureName, layer, event)}
                onPointerMove={(event) => handlePointer(featureName, layer, event)}
                onPointerLeave={() => {
                  setHoveredName(null);
                  setTooltip(null);
                }}
                onFocus={(event) => handleFocus(featureName, layer, event)}
                onBlur={() => {
                  setHoveredName(null);
                  setTooltip(null);
                }}
                onClick={() => setSelectedName(row?.name ?? featureName)}
              >
                <title>{label}</title>
              </path>
            );
          })}
        </g>
      </>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(20rem,1.2fr)_minmax(18rem,0.8fr)]">
      <div data-map-frame className="relative min-w-0 border-y border-border/60 bg-muted/10 py-3">
        <svg
          viewBox={`0 0 ${countryWidth} ${countryHeight}`}
          role="img"
          aria-label="Algeria delivery volume by wilaya"
          className="mx-auto block h-auto max-h-[31rem] w-full"
        >
          {mapPaths('country')}
        </svg>
        <MapTooltip
          position={tooltip?.layer === 'country' ? tooltip : null}
          row={tooltip ? byName.get(normalizeWilayaName(tooltip.name)) : undefined}
          number={number}
        />
      </div>

      <div className="min-w-0">
        <div className="border-y border-border/60 py-3">
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Northern detail
            </p>
          </div>
          <div data-map-frame className="relative overflow-hidden bg-muted/10">
            <svg
              viewBox={`0 0 ${northWidth} ${northHeight}`}
              role="img"
              aria-label="Northern Algeria wilaya detail"
              className="block h-auto w-full"
            >
              <defs>
                <clipPath id={northClipId}>
                  <rect width={northWidth} height={northHeight} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${northClipId})`}>{mapPaths('north')}</g>
            </svg>
            <MapTooltip
              position={tooltip?.layer === 'north' ? tooltip : null}
              row={tooltip ? byName.get(normalizeWilayaName(tooltip.name)) : undefined}
              number={number}
            />
          </div>
        </div>

        <div className="border-b border-border/60 py-4">
          <div
            aria-label="Posted order volume scale"
            className="h-1.5"
            style={{
              background:
                'linear-gradient(90deg, hsl(var(--muted)), hsl(var(--chart-1) / 0.45), hsl(var(--chart-1)))',
            }}
          />
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>No posted orders</span>
            <span>{number.format(maximum)} posted</span>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
          <div className="py-3 pr-4">
            <p className="truncate text-sm font-semibold">{activeRow?.name ?? activeName ?? '—'}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {number.format(activeRow?.postedOrders ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">posted orders</p>
          </div>
          <div className="py-3 pl-4">
            <p className="text-xs text-muted-foreground">Paid among resolved</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {percent(activeRow?.terminalPaidRatePct ?? null)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {number.format(activeRow?.activeOrders ?? 0)} active ·{' '}
              {duration(activeRow?.deliveryMedianHours ?? null)} median
            </p>
          </div>
        </div>

        <div className="border-b border-border/60" aria-label="Top wilayas by posted orders">
          {rankedRows.slice(0, 6).map((row, index) => {
            const isActive = activeName
              ? normalizeWilayaName(activeName) === normalizeWilayaName(row.name)
              : false;
            return (
              <button
                type="button"
                key={row.name}
                className={`grid w-full grid-cols-[1.75rem_1fr_auto] items-center gap-2 border-b border-border/40 px-1 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none ${
                  isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
                }`}
                onPointerEnter={() => setHoveredName(row.name)}
                onPointerLeave={() => setHoveredName(null)}
                onFocus={() => setHoveredName(row.name)}
                onBlur={() => setHoveredName(null)}
                onClick={() => setSelectedName(row.name)}
              >
                <span className="text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="truncate font-medium text-foreground">{row.name}</span>
                <span className="tabular-nums">{number.format(row.postedOrders)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
