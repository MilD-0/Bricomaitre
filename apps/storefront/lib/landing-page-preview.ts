import {
  landingPagePreviewSchema,
  type LandingPagePreview,
} from '@bric/storefront-core/landing-pages';

export type LandingPagePreviewSearchParams = {
  previewRevision?: string | string[];
  previewTimestamp?: string | string[];
  previewSignature?: string | string[];
};

export function parseLandingPagePreviewSearchParams(searchParams: LandingPagePreviewSearchParams): {
  requested: boolean;
  preview: LandingPagePreview | null;
} {
  const requested = [
    searchParams.previewRevision,
    searchParams.previewTimestamp,
    searchParams.previewSignature,
  ].some((value) => value !== undefined);
  if (!requested) return { requested: false, preview: null };

  const parsed = landingPagePreviewSchema.safeParse({
    revision:
      typeof searchParams.previewRevision === 'string' ? searchParams.previewRevision : undefined,
    timestamp:
      typeof searchParams.previewTimestamp === 'string' ? searchParams.previewTimestamp : undefined,
    signature:
      typeof searchParams.previewSignature === 'string' ? searchParams.previewSignature : undefined,
  });
  return { requested: true, preview: parsed.success ? parsed.data : null };
}
