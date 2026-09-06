import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getS3EndpointConfig } from '@bric/runtime/aws';

const DEFAULT_CATALOG_FEED_S3_KEY = 'exports/products/catalog-feed/latest.csv';

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required to read the catalog feed`);
  }

  return value;
}

export async function readCatalogFeed() {
  const bucket = readRequiredEnv('AWS_S3_BUCKET');
  const key = process.env.PRODUCT_CATALOG_FEED_S3_KEY?.trim() || DEFAULT_CATALOG_FEED_S3_KEY;
  const client = new S3Client({
    region: readRequiredEnv('AWS_REGION'),
    ...getS3EndpointConfig(),
  });

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
    body: Buffer.from(await response.Body.transformToByteArray()),
    contentType: response.ContentType?.trim() || 'text/csv; charset=utf-8',
    lastModified: response.LastModified ?? null,
    etag: response.ETag?.trim() || null,
  };
}
