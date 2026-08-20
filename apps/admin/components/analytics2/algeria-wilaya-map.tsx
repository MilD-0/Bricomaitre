'use client';

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

const features = geometry.features as unknown as Feature[];
const allCoordinates = features.flatMap((feature) =>
  polygonList(feature).flatMap((polygon) => polygon.flat()),
);
const minLongitude = Math.min(...allCoordinates.map(([longitude]) => longitude));
const maxLongitude = Math.max(...allCoordinates.map(([longitude]) => longitude));
const minLatitude = Math.min(...allCoordinates.map(([, latitude]) => latitude));
const maxLatitude = Math.max(...allCoordinates.map(([, latitude]) => latitude));
const width = 640;
const height = 560;
const padding = 14;
const scale = Math.min(
  (width - padding * 2) / (maxLongitude - minLongitude),
  (height - padding * 2) / (maxLatitude - minLatitude),
);
const projectedWidth = (maxLongitude - minLongitude) * scale;
const projectedHeight = (maxLatitude - minLatitude) * scale;
const offsetX = (width - projectedWidth) / 2;
const offsetY = (height - projectedHeight) / 2;

function point([longitude, latitude]: Coordinate) {
  const x = offsetX + (longitude - minLongitude) * scale;
  const y = offsetY + (maxLatitude - latitude) * scale;
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function pathFor(feature: Feature) {
  return polygonList(feature)
    .flatMap((polygon) => polygon.map((ring) => `M${ring.map(point).join('L')}Z`))
    .join('');
}

function fillFor(value: number, maximum: number) {
  if (value <= 0 || maximum <= 0) return 'hsl(var(--muted))';
  const intensity = Math.sqrt(value / maximum);
  const lightness = 91 - intensity * 52;
  return `hsl(263 72% ${lightness}%)`;
}

export function AlgeriaWilayaMap({ rows, locale }: { rows: WilayaValue[]; locale: string }) {
  const byName = new Map(rows.map((row) => [normalizeWilayaName(row.name), row]));
  const maximum = Math.max(0, ...rows.map((row) => row.postedOrders));
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = (value: number | null) => (value == null ? '—' : `${number.format(value)}%`);

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(18rem,1.25fr)_minmax(12rem,0.6fr)]">
      <div className="min-w-0 border-y border-border/60 bg-muted/10 py-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Algeria delivery volume by wilaya"
          className="mx-auto block h-auto max-h-[31rem] w-full"
        >
          {features.map((feature) => {
            const row = byName.get(normalizeWilayaName(feature.properties.nam));
            return (
              <path
                key={feature.properties.nam}
                d={pathFor(feature)}
                fill={fillFor(row?.postedOrders ?? 0, maximum)}
                fillRule="evenodd"
                stroke="hsl(var(--background))"
                strokeWidth={1.1}
                vectorEffect="non-scaling-stroke"
                className="transition-opacity hover:opacity-75"
              >
                <title>{`${feature.properties.nam}: ${number.format(row?.postedOrders ?? 0)} posted · ${percent(row?.terminalPaidRatePct ?? null)} paid among terminal`}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="self-center">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Posted-order volume
        </p>
        <div className="mt-3 h-2 rounded-full bg-gradient-to-r from-muted via-violet-300 to-violet-800" />
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>None</span>
          <span>{number.format(maximum)} orders</span>
        </div>
        <div className="mt-6 divide-y divide-border/50 border-y border-border/60">
          {rows.slice(0, 5).map((row) => (
            <div
              key={`${row.name}-${row.postedOrders}`}
              className="grid grid-cols-[1fr_auto] gap-3 py-2.5 text-sm"
            >
              <span className="truncate font-medium">{row.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {number.format(row.postedOrders)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
