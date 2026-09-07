import { trimNullableScalarText } from './mongo-import-values';

const WILAYA_CODE_BY_NAME = {
  Adrar: 1,
  Chlef: 2,
  Laghouat: 3,
  'Oum El Bouaghi': 4,
  Batna: 5,
  Béjaïa: 6,
  Biskra: 7,
  Béchar: 8,
  Blida: 9,
  Bouïra: 10,
  Tamanrasset: 11,
  Tébessa: 12,
  Tebessa: 12,
  Tlemcen: 13,
  Tiaret: 14,
  'Tizi Ouzou': 15,
  Alger: 16,
  Djelfa: 17,
  Jijel: 18,
  Sétif: 19,
  Saïda: 20,
  Skikda: 21,
  'Sidi Bel Abbès': 22,
  Annaba: 23,
  Guelma: 24,
  Constantine: 25,
  Médéa: 26,
  Mostaganem: 27,
  Msila: 28,
  Mascara: 29,
  Ouargla: 30,
  Oran: 31,
  'El Bayadh': 32,
  Illizi: 33,
  'Bordj Bou Arreridj': 34,
  Boumerdès: 35,
  'El Tarf': 36,
  Tindouf: 37,
  Tissemsilt: 38,
  'El Oued': 39,
  Khenchela: 40,
  'Souk Ahras': 41,
  Tipaza: 42,
  Mila: 43,
  'Aïn Defla': 44,
  Naâma: 45,
  'Aïn Témouchent': 46,
  Ghardaïa: 47,
  Relizane: 48,
  Timimoun: 49,
  'Bordj Badji Mokhtar': 50,
  'Ouled Djellal': 51,
  'Béni Abbès': 52,
  'In Salah': 53,
  'In Guezzam': 54,
  Touggourt: 55,
  Djanet: 56,
  'El Mghair': 57,
  'El Meniaa': 58,
} as const satisfies Record<string, number>;

const WILAYA_MATCHES = new Map<string, number>();

for (const [name, code] of Object.entries(WILAYA_CODE_BY_NAME)) {
  WILAYA_MATCHES.set(normalizeStateKey(name), code);
}

function normalizeStateKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

function levenshteinDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);

  for (let index = 0; index <= right.length; index += 1) {
    rows[0][index] = index;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + substitutionCost,
      );
    }
  }

  return rows[left.length][right.length];
}

export function resolveWilayaCode(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 58) {
    return value;
  }

  const text = trimNullableScalarText(value);
  if (!text) {
    return null;
  }

  const directCode = WILAYA_CODE_BY_NAME[text as keyof typeof WILAYA_CODE_BY_NAME];
  if (directCode) {
    return directCode;
  }

  const normalized = normalizeStateKey(text);
  const exactNormalizedCode = WILAYA_MATCHES.get(normalized);
  if (exactNormalizedCode) {
    return exactNormalizedCode;
  }

  let bestMatch: { distance: number; code: number } | null = null;

  for (const [candidate, code] of WILAYA_MATCHES) {
    const distance = levenshteinDistance(normalized, candidate);
    if (distance > 2) {
      continue;
    }

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { distance, code };
    }
  }

  return bestMatch?.code ?? null;
}
