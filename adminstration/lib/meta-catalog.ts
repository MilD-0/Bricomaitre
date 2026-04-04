import { createHash } from 'crypto';

import sharp from 'sharp';
import * as XLSX from 'xlsx';

import {
  buildDatedObjectKey,
  ensureS3UploadConfig,
  getS3UploadClient,
  uploadBufferToS3,
} from './s3-upload';
export {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
  buildMetaCatalogImageKeySeed,
  META_CATALOG_EXPORT_HEADERS,
  type MetaCatalogExportRow,
} from './meta-catalog-shared';
import { META_CATALOG_EXPORT_HEADERS, type MetaCatalogExportRow } from './meta-catalog-shared';

export function buildMetaCatalogWorkbook(rows: MetaCatalogExportRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...META_CATALOG_EXPORT_HEADERS],
    ...rows.map((row) => ([
      row.id,
      row.title,
      row.description,
      row.availability,
      row.condition,
      row.price,
      row.link,
      row.imageLink,
      row.brand,
    ])),
  ]);

  sheet['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 36 },
    { wch: 14 },
    { wch: 12 },
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

export async function createSquareCatalogImage(
  sourceUrl: string,
  keySeed: string,
  now = new Date(),
) {
  const sourceResponse = await fetch(sourceUrl, { cache: 'no-store' });
  if (!sourceResponse.ok) {
    throw new Error(`Failed to fetch product image: ${sourceUrl}`);
  }

  const transformed = await sharp(Buffer.from(await sourceResponse.arrayBuffer()))
    .rotate()
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const { region, bucket, cloudfrontDomain } = ensureS3UploadConfig();
  const client = getS3UploadClient(region);
  const keyHash = createHash('sha1').update(keySeed).digest('hex');
  const key = buildDatedObjectKey(`products/meta-catalog/${keyHash}`, 'jpg', now);

  return uploadBufferToS3({
    client,
    bucket,
    cloudfrontDomain,
    key,
    body: transformed,
    contentType: 'image/jpeg',
  });
}
