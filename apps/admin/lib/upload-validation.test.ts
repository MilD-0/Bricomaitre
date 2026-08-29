import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
  MAX_SPREADSHEET_UPLOAD_BYTES,
  MAX_SPREADSHEET_UPLOAD_FILES,
  MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES,
  validateAndBufferBulletinUploads,
  validateAndBufferSpreadsheetUploads,
} from './upload-validation';

function withReportedSize(file: File, size: number) {
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function createXlsxBytes() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Order'], ['BRIC-1']]),
    'Orders',
  );
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

describe('upload validation', () => {
  it('rejects empty upload batches at the shared validation boundary', async () => {
    await expect(validateAndBufferSpreadsheetUploads([])).resolves.toEqual({
      ok: false,
      error: 'No spreadsheets uploaded',
      status: 400,
    });
    await expect(validateAndBufferBulletinUploads([])).resolves.toEqual({
      ok: false,
      error: 'No attachments uploaded',
      status: 400,
    });
  });

  it('accepts spreadsheets only when extension, MIME, and signature agree', async () => {
    const accepted = await validateAndBufferSpreadsheetUploads([
      new File([Uint8Array.from(createXlsxBytes())], 'orders.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ]);
    expect(accepted).toMatchObject({ ok: true, files: [{ extension: 'xlsx' }] });

    const disguised = await validateAndBufferSpreadsheetUploads([
      new File(['not-a-workbook'], 'orders.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ]);
    expect(disguised).toEqual({
      ok: false,
      error: 'File content does not match its extension: orders.xlsx',
      status: 400,
    });
  });

  it('rejects a generic ZIP archive renamed as an OOXML workbook', async () => {
    const genericZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = await validateAndBufferSpreadsheetUploads([
      new File([genericZip], 'orders.xlsx', { type: 'application/zip' }),
    ]);

    expect(result).toEqual({
      ok: false,
      error: 'File content does not match its extension: orders.xlsx',
      status: 400,
    });
  });

  it('rejects oversized spreadsheet files before reading them', async () => {
    const file = new File([new Uint8Array(MAX_SPREADSHEET_UPLOAD_BYTES + 1)], 'orders.xlsx');
    const result = await validateAndBufferSpreadsheetUploads([file]);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('enforces spreadsheet count and aggregate-size limits before buffering', async () => {
    const tooMany = Array.from(
      { length: MAX_SPREADSHEET_UPLOAD_FILES + 1 },
      (_, index) => new File(['x'], `${index}.xlsx`),
    );
    await expect(validateAndBufferSpreadsheetUploads(tooMany)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });

    const reportedSize = Math.floor(MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES / 6) + 1;
    const tooLargeTogether = Array.from({ length: 6 }, (_, index) =>
      withReportedSize(new File(['x'], `${index}.xlsx`), reportedSize),
    );
    await expect(validateAndBufferSpreadsheetUploads(tooLargeTogether)).resolves.toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it('accepts safe bulletin documents and rejects active-content extensions', async () => {
    const accepted = await validateAndBufferBulletinUploads([
      new File(['%PDF-1.7'], 'brief.pdf', { type: 'application/pdf' }),
    ]);
    expect(accepted).toMatchObject({
      ok: true,
      files: [{ extension: 'pdf', contentType: 'application/pdf' }],
    });

    const rejected = await validateAndBufferBulletinUploads([
      new File(['<svg/>'], 'diagram.svg', { type: 'image/svg+xml' }),
    ]);
    expect(rejected).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects oversized bulletin attachments', async () => {
    const file = new File([new Uint8Array(MAX_BULLETIN_UPLOAD_BYTES + 1)], 'brief.pdf', {
      type: 'application/pdf',
    });
    const result = await validateAndBufferBulletinUploads([file]);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('enforces bulletin count, aggregate-size, MIME, and signature boundaries', async () => {
    const tooMany = Array.from(
      { length: MAX_BULLETIN_UPLOAD_FILES + 1 },
      (_, index) => new File(['%PDF-1.7'], `${index}.pdf`, { type: 'application/pdf' }),
    );
    await expect(validateAndBufferBulletinUploads(tooMany)).resolves.toMatchObject({
      ok: false,
      status: 400,
    });

    const reportedSize = Math.floor(MAX_BULLETIN_UPLOAD_TOTAL_BYTES / 3) + 1;
    const tooLargeTogether = Array.from({ length: 3 }, (_, index) =>
      withReportedSize(
        new File(['%PDF-1.7'], `${index}.pdf`, { type: 'application/pdf' }),
        reportedSize,
      ),
    );
    await expect(validateAndBufferBulletinUploads(tooLargeTogether)).resolves.toMatchObject({
      ok: false,
      status: 413,
    });

    await expect(
      validateAndBufferBulletinUploads([
        new File(['%PDF-1.7'], 'brief.pdf', { type: 'image/png' }),
      ]),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      validateAndBufferBulletinUploads([
        new File(['not-a-pdf'], 'brief.pdf', { type: 'application/pdf' }),
      ]),
    ).resolves.toMatchObject({ ok: false, status: 400 });
  });
});
