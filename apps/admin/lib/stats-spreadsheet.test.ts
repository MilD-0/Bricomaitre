import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { parseStatsSpreadsheet } from './stats-spreadsheet';

describe('parseStatsSpreadsheet', () => {
  it('detects headers after introductory rows and maps values', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Ecotrack export'],
      ['Generated automatically'],
      [
        'Référence',
        'Tracking',
        'Montant',
        'Frais de livraison',
        'Net recouvrement',
        'Wilaya',
        'Commune',
        'Destinataire',
      ],
      ['42', 'TRK-42', 1500, 200, 1300, 'Alger', 'Bab Ezzouar', 'Ada'],
    ]);

    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const rows = parseStatsSpreadsheet(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference: '42',
      tracking: 'TRK-42',
      montant: 1500,
      fraisLivraison: 200,
      netRecouvret: 1300,
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
      destinataire: 'Ada',
    });
  });

  it('returns no rows for an empty sheet', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    expect(parseStatsSpreadsheet(buffer)).toEqual([]);
  });

  it('uses the current COD side of slash amounts instead of the larger original total', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Référence', 'Tracking', 'Montant', 'Encaissé'],
      ['slash-1', 'TRK-SLASH', '12 700 / 25 400', '12,700/25,400'],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const rows = parseStatsSpreadsheet(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    );

    expect(rows[0]).toMatchObject({ montant: 12_700, encaisse: 12_700 });
  });
});
