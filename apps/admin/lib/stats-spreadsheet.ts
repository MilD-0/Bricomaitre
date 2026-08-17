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
  totalFraisService: number;
  netRecouvret: number;
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
  encaisse: number;
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

function parseSpreadsheetNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    if (value.includes('/')) {
      return Math.max(
        ...value.split('/').map((part) => {
          const cleaned = part.replace(/[^\d.-]/g, '');
          return Number.parseFloat(cleaned || '0');
        }),
      );
    }

    return Number.parseFloat(value.replace(/[^\d.-]/g, '') || '0');
  }

  return 0;
}

export function parseSpreadsheetDate(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date((value - 25569) * 86400 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    montant: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.montant)),
    fraisLivraison: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.fraisLivraison)),
    fraisPoids: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.fraisPoids)),
    fraisExtra: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.fraisExtra)),
    fraisSMS: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.fraisSMS)),
    fraisStockage: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.fraisStockage)),
    commissionRecouvrement: parseSpreadsheetNumber(
      findColumnValue(row, COLUMN_MAP.commissionRecouvrement),
    ),
    totalFraisService: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.totalFraisService)),
    netRecouvret: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.netRecouvret)),
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
    encaisse: parseSpreadsheetNumber(findColumnValue(row, COLUMN_MAP.encaisse)),
  })) satisfies StatsSpreadsheetRow[];
}
