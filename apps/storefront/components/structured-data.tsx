import { serializeStructuredData } from '@/lib/product-seo';

export function StructuredData({ value, nonce }: { value: unknown; nonce?: string }) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(value) }}
    />
  );
}
