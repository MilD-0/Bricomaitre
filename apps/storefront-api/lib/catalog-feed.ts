import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DEFAULT_CATALOG_FEED_S3_KEY = 'exports/products/catalog-feed/latest.csv';

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to read the catalog feed`);
  }

  return value;
}

function getCatalogFeedKey() {
  return process.env.PRODUCT_CATALOG_FEED_S3_KEY?.trim() || DEFAULT_CATALOG_FEED_S3_KEY;
}

function getCatalogFeedClient() {
  return new S3Client({
    region: readRequiredEnv('AWS_REGION'),
  });
}

async function readBodyAsBuffer(body: unknown) {
  if (
    typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray ===
    'function'
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk),
    );
  }

  return Buffer.concat(chunks);
}

export async function readCatalogFeed() {
  const bucket = readRequiredEnv('AWS_S3_BUCKET');
  const key = getCatalogFeedKey();
  const client = getCatalogFeedClient();

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`S3 object body missing for ${key}`);
  }

  return {
    body: await readBodyAsBuffer(response.Body),
    contentType: response.ContentType?.trim() || 'text/csv; charset=utf-8',
    lastModified: response.LastModified ?? null,
    etag: response.ETag?.trim() || null,
  };
}
