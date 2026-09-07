import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import {
  parseStatsSpreadsheet,
  parseSpreadsheetNumber,
  parseSpreadsheetDate,
} from './stats-spreadsheet';

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
  it('parses localized money without stripping the decimal separator', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Référence', 'Tracking', 'Montant', 'Encaissé', 'Encaissé le'],
        ['localized', 'LOCAL-1', '1 234,50', '1 234,50 / 2 000,00', '31/08/2026'],
      ]),
      'Sheet1',
    );
    const [row] = parseStatsSpreadsheet(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    );
    expect(row).toMatchObject({
      montant: 1234.5,
      encaisse: 1234.5,
      encaisseLe: new Date('2026-08-31T00:00:00Z'),
    });
  });

  it('distinguishes absent, zero and malformed numeric values', () => {
    expect(parseSpreadsheetNumber('')).toBeNull();
    expect(parseSpreadsheetNumber(undefined)).toBeNull();
    expect(parseSpreadsheetNumber('0,00')).toBe(0);
    expect(parseSpreadsheetNumber('1,234.50')).toBe(1234.5);
    expect(parseSpreadsheetNumber('1.234,50')).toBe(1234.5);
    for (const value of ['twelve', '12x50', '1,23,4', Infinity, NaN]) {
      expect(() => parseSpreadsheetNumber(value)).toThrow('Invalid');
    }
  });

  it('validates calendar dates and preserves ISO instants and Excel serials', () => {
    expect(parseSpreadsheetDate('')).toBeNull();
    expect(parseSpreadsheetDate(46265)).toEqual(new Date('2026-08-31T00:00:00Z'));
    expect(parseSpreadsheetDate('2026-08-31T23:00:00+01:00')).toEqual(
      new Date('2026-08-31T22:00:00Z'),
    );
    for (const value of ['31/02/2026', '2026-02-30', 'not a date', new Date(NaN)]) {
      expect(() => parseSpreadsheetDate(value)).toThrow('Invalid');
    }
  });
});
