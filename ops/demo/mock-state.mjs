import { readFileSync } from 'node:fs';

export const requests = [];

export const shipments = new Map();

export const storefrontOrigin = (
  process.env.DEMO_STOREFRONT_ORIGIN ?? 'http://127.0.0.1:3402'
).replace(/\/$/, '');

export // Match the pinned seed catalog, including its stable commune IDs. Scheduled
// carrier sync replaces these tables, so a smaller fixture erases valid cities.
const locations = JSON.parse(
  readFileSync(new URL('./data/algeria-wilayas.json', import.meta.url), 'utf8'),
).map(({ code, name }) => ({ wilaya_id: code, wilaya_name: name }));

const communeSource = JSON.parse(
  readFileSync(new URL('./data/algeria-communes.json', import.meta.url), 'utf8'),
).sort(
  (left, right) =>
    left.wilayaCode - right.wilayaCode ||
    Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
);

const ordinals = new Map();

export const communes = Object.fromEntries(
  communeSource.map(({ wilayaCode, name }, index) => {
    const id = index + 1;
    const ordinal = (ordinals.get(wilayaCode) ?? 0) + 1;
    ordinals.set(wilayaCode, ordinal);
    return [
      id,
      {
        nom: name,
        wilaya_id: wilayaCode,
        code_postal: String(wilayaCode).padStart(2, '0') + String(ordinal).padStart(3, '0'),
        has_stop_desk: Number(ordinal === 1 || id % 11 === 0),
      },
    ];
  }),
);

export const rates = new Map(
  locations.map(({ wilaya_id }) => [
    wilaya_id,
    [450 + Math.ceil(wilaya_id / 8) * 75, 300 + Math.ceil(wilaya_id / 10) * 50],
  ]),
);
