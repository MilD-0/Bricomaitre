import * as XLSX from 'xlsx';

export {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
  type MetaCatalogExportRow,
} from './meta-catalog-shared';
import { META_CATALOG_EXPORT_HEADERS, type MetaCatalogExportRow } from './meta-catalog-shared';

export function buildMetaCatalogWorkbook(rows: MetaCatalogExportRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...META_CATALOG_EXPORT_HEADERS],
    ...rows.map((row) => [
      row.id,
      row.contentId,
      row.title,
      row.description,
      row.availability,
      row.condition,
      row.price,
      row.salePrice,
      row.link,
      row.imageLink,
      row.brand,
    ]),
  ]);

  sheet['!cols'] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
    { wch: 36 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 34 },
    { wch: 36 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Meta Catalog');
  return workbook;
}

export function toXlsxBuffer(workbook: XLSX.WorkBook) {
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

export function toCsvBuffer(rows: MetaCatalogExportRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...META_CATALOG_EXPORT_HEADERS],
    ...rows.map((row) => [
      row.id,
      row.contentId,
      row.title,
      row.description,
      row.availability,
      row.condition,
      row.price,
      row.salePrice,
      row.link,
      row.imageLink,
      row.brand,
    ]),
  ]);

  const csv = XLSX.utils.sheet_to_csv(sheet);
  return Buffer.from(csv, 'utf8');
}
