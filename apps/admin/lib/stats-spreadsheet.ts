import * as XLSX from 'xlsx';

export type StatsSpreadsheetRow = {
  encaisseLe: Date | null;
  montant: number;
  fraisLivraison: number;
  fraisPoids: number;
  fraisExtra: number;
  fraisSMS: number;
  fraisStockage: number;
  commissionRecouvrement: number;
  totalFraisService: number | null;
  netRecouvret: number | null;
  type: string;
  typePrestation: string;
  creeLe: Date | null;
  tracking: string;
  reference: string;
  destinataire: string;
  telephone: string;
  commune: string;
  wilaya: string;
  produits: string;
  remarque: string;
  poidsLivreLe: string;
  encaisse: number | null;
};

const COLUMN_MAP: Record<keyof StatsSpreadsheetRow, string[]> = {
  encaisseLe: ['Encaissé le', 'Encaisse le', 'encaisse_le'],
  montant: ['montant', 'Montant'],
  fraisLivraison: ['Frais de livraison', 'frais_livraison'],
  fraisPoids: ['Frais poids', 'frais_poids'],
  fraisExtra: ['Frais en extra', 'frais_extra'],
  fraisSMS: ['Frais SMS', 'frais_sms'],
  fraisStockage: ['Frais Stockage', 'frais_stockage'],
  commissionRecouvrement: ['Commission recouvrement', 'commission'],
  totalFraisService: ['Total frais de service', 'total_frais'],
  netRecouvret: ['Net recouvert', 'Net recouvret', 'net_recouvrement', 'Net recouvrement'],
  type: ['Type'],
  typePrestation: ['Type de préstation', 'Type de prestation'],
  creeLe: ['Crée le', 'cree_le', 'created_at'],
  tracking: ['Tracking', 'tracking', 'Numéro de suivi'],
  reference: ['Réference', 'Référence', 'Reference', 'reference', 'ref'],
  destinataire: ['déstinataire', 'destinataire', 'Destinataire', 'client'],
  telephone: ['Téléphone', 'telephone', 'phone'],
  commune: ['Commune', 'commune'],
  wilaya: ['Wilaya', 'wilaya'],
  produits: ['Produits', 'produits', 'products'],
  remarque: ['Remarque', 'remarque', 'note'],
  poidsLivreLe: ['Livré le', 'Poids Livré le', 'poids_livre_le'],
  encaisse: ['Encaissé', 'encaisse', 'amount'],
};

function findColumnValue(row: Record<string, unknown>, possibleNames: string[]) {
  const column = possibleNames.find((name) => row[name] !== undefined);
  return column ? row[column] : undefined;
}

/** Blank cells are absent; malformed populated cells must never become money. */
export function parseSpreadsheetNumber(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') throw new Error('Invalid spreadsheet number.');

  const text = value
    .trim()
    .replace(/^(?:DZD|DA|EUR|€)\s*/i, '')
    .replace(/\s*(?:DZD|DA|EUR|€)$/i, '');
  let normalized: string;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    normalized = text;
  } else if (/^[+-]?\d+,\d{1,2}$/.test(text)) {
    normalized = text.replace(',', '.');
  } else if (/^[+-]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(text)) {
    normalized = text.replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  } else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) {
    normalized = text.replace(/,/g, '');
  } else if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    throw new Error(`Invalid spreadsheet number: ${value}`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error('Invalid spreadsheet number.');
  return parsed;
}

function parseSettlementNumber(value: unknown): number;
function parseSettlementNumber(value: unknown, optional: true): number | null;
function parseSettlementNumber(value: unknown, optional = false): number | null {
  if (typeof value === 'string' && value.includes('/')) {
    // Adjusted COD exports encode current/original. Validate both amounts,
    // but only the current amount belongs in settlement economics.
    const parts = value.split('/');
    if (parts.length !== 2) throw new Error('Invalid adjusted COD amount.');
    const amounts = parts.map(parseSpreadsheetNumber);
    if (amounts.some((amount) => amount == null)) throw new Error('Invalid adjusted COD amount.');
    return amounts[0]!;
  }
  return parseSpreadsheetNumber(value) ?? (optional ? null : 0);
}

export function parseSpreadsheetDate(value: unknown): Date | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Invalid spreadsheet date.');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) throw new Error('Invalid Excel date serial.');
    const parsed = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, parts.H, parts.M, parts.S));
    if (
      parsed.getUTCFullYear() !== parts.y ||
      parsed.getUTCMonth() !== parts.m - 1 ||
      parsed.getUTCDate() !== parts.d
    )
      throw new Error('Invalid Excel date serial.');
    return parsed;
  }
  if (typeof value !== 'string') throw new Error('Invalid spreadsheet date.');
  const text = value.trim();
  const dayFirst = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(
      text,
    );
  if (!dayFirst && !iso) throw new Error(`Invalid spreadsheet date: ${value}`);
  const year = Number(dayFirst?.[3] ?? iso![1]);
  const month = Number(dayFirst?.[2] ?? iso![2]);
  const day = Number(dayFirst?.[1] ?? iso![3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    throw new Error(`Invalid spreadsheet date: ${value}`);
  const parsed = dayFirst ? calendar : new Date(text);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`Invalid spreadsheet date: ${value}`);
  return parsed;
}

export function normalizeSpreadsheetText(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

export function parseStatsSpreadsheet(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    return [];
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  let headerRow = range.s.r;

  for (let rowIndex = range.s.r; rowIndex <= Math.min(range.s.r + 6, range.e.r); rowIndex += 1) {
    const values = Array.from({ length: Math.min(6, range.e.c - range.s.c + 1) }).map(
      (_, columnOffset) => {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: range.s.c + columnOffset })];
        return String(cell?.v ?? '').toLowerCase();
      },
    );

    if (
      values.some(
        (value) =>
          value.includes('référence') || value.includes('tracking') || value.includes('montant'),
      )
    ) {
      headerRow = rowIndex;
      break;
    }
  }

  range.s.r = headerRow;
  sheet['!ref'] = XLSX.utils.encode_range(range);

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  return rawRows.map((row) => ({
    encaisseLe: parseSpreadsheetDate(findColumnValue(row, COLUMN_MAP.encaisseLe)),
    montant: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.montant)),
    fraisLivraison: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.fraisLivraison)),
    fraisPoids: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.fraisPoids)),
    fraisExtra: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.fraisExtra)),
    fraisSMS: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.fraisSMS)),
    fraisStockage: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.fraisStockage)),
    commissionRecouvrement: parseSettlementNumber(
      findColumnValue(row, COLUMN_MAP.commissionRecouvrement),
    ),
    totalFraisService: parseSettlementNumber(
      findColumnValue(row, COLUMN_MAP.totalFraisService),
      true,
    ),
    netRecouvret: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.netRecouvret), true),
    type: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.type)),
    typePrestation: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.typePrestation)),
    creeLe: parseSpreadsheetDate(findColumnValue(row, COLUMN_MAP.creeLe)),
    tracking: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.tracking)),
    reference: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.reference)),
    destinataire: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.destinataire)),
    telephone: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.telephone)),
    commune: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.commune)),
    wilaya: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.wilaya)),
    produits: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.produits)),
    remarque: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.remarque)),
    poidsLivreLe: normalizeSpreadsheetText(findColumnValue(row, COLUMN_MAP.poidsLivreLe)),
    encaisse: parseSettlementNumber(findColumnValue(row, COLUMN_MAP.encaisse), true),
  })) satisfies StatsSpreadsheetRow[];
}
