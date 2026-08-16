import {
  MAX_BULLETIN_UPLOAD_BYTES,
  MAX_BULLETIN_UPLOAD_FILES,
  MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_FILES,
  MAX_IMAGE_UPLOAD_TOTAL_BYTES,
  MAX_SPREADSHEET_UPLOAD_BYTES,
  MAX_SPREADSHEET_UPLOAD_FILES,
  MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES,
} from './upload-limits';

export * from './upload-limits';

const MULTIPART_OVERHEAD_ALLOWANCE = 2 * 1024 * 1024;
const genericContentTypes = new Set(['', 'application/octet-stream']);

const imageTypes: Record<string, { contentType: string; extension: string; signature: string }> = {
  'image/avif': { contentType: 'image/avif', extension: 'avif', signature: 'avif' },
  'image/gif': { contentType: 'image/gif', extension: 'gif', signature: 'gif' },
  'image/jpeg': { contentType: 'image/jpeg', extension: 'jpg', signature: 'jpeg' },
  'image/png': { contentType: 'image/png', extension: 'png', signature: 'png' },
  'image/webp': { contentType: 'image/webp', extension: 'webp', signature: 'webp' },
};

type BufferedUpload = {
  file: File;
  buffer: Buffer;
  extension: string;
  contentType: string;
};

type UploadValidationError = { ok: false; error: string; status: 400 | 413 };
type UploadValidationResult = { ok: true; files: BufferedUpload[] } | UploadValidationError;

const spreadsheetTypes: Record<
  string,
  { contentType: string; acceptedTypes: Set<string>; signature: string }
> = {
  xlsx: {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    acceptedTypes: new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed',
    ]),
    signature: 'xlsx',
  },
  xls: {
    contentType: 'application/vnd.ms-excel',
    acceptedTypes: new Set(['application/vnd.ms-excel']),
    signature: 'ole',
  },
};

const bulletinTypes: Record<
  string,
  { contentType: string; acceptedTypes: Set<string>; signature: string }
> = {
  avif: { contentType: 'image/avif', acceptedTypes: new Set(['image/avif']), signature: 'avif' },
  csv: {
    contentType: 'text/csv',
    acceptedTypes: new Set(['text/csv', 'application/vnd.ms-excel']),
    signature: 'text',
  },
  doc: {
    contentType: 'application/msword',
    acceptedTypes: new Set(['application/msword']),
    signature: 'ole',
  },
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    acceptedTypes: new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed',
    ]),
    signature: 'docx',
  },
  gif: { contentType: 'image/gif', acceptedTypes: new Set(['image/gif']), signature: 'gif' },
  jpeg: { contentType: 'image/jpeg', acceptedTypes: new Set(['image/jpeg']), signature: 'jpeg' },
  jpg: { contentType: 'image/jpeg', acceptedTypes: new Set(['image/jpeg']), signature: 'jpeg' },
  pdf: {
    contentType: 'application/pdf',
    acceptedTypes: new Set(['application/pdf']),
    signature: 'pdf',
  },
  png: { contentType: 'image/png', acceptedTypes: new Set(['image/png']), signature: 'png' },
  ppt: {
    contentType: 'application/vnd.ms-powerpoint',
    acceptedTypes: new Set(['application/vnd.ms-powerpoint']),
    signature: 'ole',
  },
  pptx: {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    acceptedTypes: new Set([
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'application/x-zip-compressed',
    ]),
    signature: 'pptx',
  },
  txt: { contentType: 'text/plain', acceptedTypes: new Set(['text/plain']), signature: 'text' },
  webp: { contentType: 'image/webp', acceptedTypes: new Set(['image/webp']), signature: 'webp' },
  xls: spreadsheetTypes.xls,
  xlsx: spreadsheetTypes.xlsx,
};

function getExtension(fileName: string) {
  const match = /\.([^.]+)$/.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? '';
}

function startsWith(buffer: Buffer, bytes: number[]) {
  return bytes.every((value, index) => buffer[index] === value);
}

function isZipContainer(buffer: Buffer) {
  return (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])
  );
}

function isOpenXmlContainer(buffer: Buffer, contentDirectory: string) {
  return (
    isZipContainer(buffer) &&
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    buffer.includes(Buffer.from(`${contentDirectory}/`))
  );
}

function hasSignature(buffer: Buffer, signature: string) {
  switch (signature) {
    case 'xlsx':
      return isOpenXmlContainer(buffer, 'xl');
    case 'docx':
      return isOpenXmlContainer(buffer, 'word');
    case 'pptx':
      return isOpenXmlContainer(buffer, 'ppt');
    case 'ole':
      return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'pdf':
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case 'gif':
      return (
        buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        buffer.subarray(0, 6).toString('ascii') === 'GIF89a'
      );
    case 'webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'avif':
      return (
        buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
        /^(avif|avis)$/.test(buffer.subarray(8, 12).toString('ascii'))
      );
    case 'text':
      return !buffer.subarray(0, 8_192).includes(0);
    default:
      return false;
  }
}

function validateDeclaredLength(
  request: Request,
  maxBodyBytes: number,
): UploadValidationError | null {
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return null;
  const length = Number(rawLength);
  if (!Number.isFinite(length) || length < 0) {
    return { ok: false, error: 'Invalid Content-Length header', status: 400 };
  }
  if (length > maxBodyBytes + MULTIPART_OVERHEAD_ALLOWANCE) {
    return { ok: false, error: 'Upload request is too large', status: 413 };
  }
  return null;
}

async function validateAndBufferUploads({
  files,
  types,
  maxFiles,
  maxFileBytes,
  maxTotalBytes,
  kind,
}: {
  files: File[];
  types: Record<string, { contentType: string; acceptedTypes: Set<string>; signature: string }>;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  kind: string;
}): Promise<UploadValidationResult> {
  if (files.length > maxFiles) {
    return { ok: false, error: `Upload at most ${maxFiles} ${kind} at a time`, status: 400 };
  }
  if (files.some((file) => file.size > maxFileBytes)) {
    return {
      ok: false,
      error: `Each ${kind.replace(/s$/, '')} must be ${maxFileBytes / 1024 / 1024} MB or smaller`,
      status: 413,
    };
  }
  if (files.reduce((total, file) => total + file.size, 0) > maxTotalBytes) {
    return {
      ok: false,
      error: `The combined upload must be ${maxTotalBytes / 1024 / 1024} MB or smaller`,
      status: 413,
    };
  }

  const buffered: BufferedUpload[] = [];
  for (const file of files) {
    const extension = getExtension(file.name);
    const definition = types[extension];
    if (!definition) {
      return {
        ok: false,
        error: `Unsupported ${kind.replace(/s$/, '')} extension: ${file.name}`,
        status: 400,
      };
    }

    const declaredType = file.type.toLowerCase();
    if (!genericContentTypes.has(declaredType) && !definition.acceptedTypes.has(declaredType)) {
      return {
        ok: false,
        error: `File type does not match its extension: ${file.name}`,
        status: 400,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasSignature(buffer, definition.signature)) {
      return {
        ok: false,
        error: `File content does not match its extension: ${file.name}`,
        status: 400,
      };
    }

    buffered.push({ file, buffer, extension, contentType: definition.contentType });
  }

  return { ok: true, files: buffered };
}

export function validateSpreadsheetRequestLength(request: Request) {
  return validateDeclaredLength(request, MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES);
}

export function validateImageRequestLength(request: Request) {
  return validateDeclaredLength(request, MAX_IMAGE_UPLOAD_TOTAL_BYTES);
}

export function validateBulletinRequestLength(request: Request) {
  return validateDeclaredLength(request, MAX_BULLETIN_UPLOAD_TOTAL_BYTES);
}

export function validateAndBufferSpreadsheetUploads(
  files: File[],
  maxFiles = MAX_SPREADSHEET_UPLOAD_FILES,
) {
  return validateAndBufferUploads({
    files,
    types: spreadsheetTypes,
    maxFiles,
    maxFileBytes: MAX_SPREADSHEET_UPLOAD_BYTES,
    maxTotalBytes: MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES,
    kind: 'spreadsheets',
  });
}

export async function validateAndBufferImageUploads(
  files: File[],
): Promise<UploadValidationResult> {
  if (files.length === 0) {
    return { ok: false, error: 'No files uploaded', status: 400 };
  }
  if (files.length > MAX_IMAGE_UPLOAD_FILES) {
    return {
      ok: false,
      error: `Upload at most ${MAX_IMAGE_UPLOAD_FILES} images at a time`,
      status: 400,
    };
  }
  if (files.some((file) => file.size > MAX_IMAGE_UPLOAD_BYTES)) {
    return { ok: false, error: 'Each image must be 10 MB or smaller', status: 413 };
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_UPLOAD_TOTAL_BYTES) {
    return { ok: false, error: 'The combined upload must be 30 MB or smaller', status: 413 };
  }

  const buffered: BufferedUpload[] = [];
  for (const file of files) {
    const definition = imageTypes[file.type.toLowerCase()];
    if (!definition) {
      return {
        ok: false,
        error: 'Only JPEG, PNG, WebP, GIF, and AVIF images are allowed',
        status: 400,
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasSignature(buffer, definition.signature)) {
      return {
        ok: false,
        error: `File content does not match its declared image type: ${file.name}`,
        status: 400,
      };
    }

    buffered.push({
      file,
      buffer,
      extension: definition.extension,
      contentType: definition.contentType,
    });
  }

  return { ok: true, files: buffered };
}

export function validateAndBufferBulletinUploads(files: File[]) {
  return validateAndBufferUploads({
    files,
    types: bulletinTypes,
    maxFiles: MAX_BULLETIN_UPLOAD_FILES,
    maxFileBytes: MAX_BULLETIN_UPLOAD_BYTES,
    maxTotalBytes: MAX_BULLETIN_UPLOAD_TOTAL_BYTES,
    kind: 'attachments',
  });
}
