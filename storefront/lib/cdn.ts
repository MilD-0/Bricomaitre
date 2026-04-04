export function parseOriginUrl(value: string | undefined | null) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getCloudfrontOrigin() {
  return parseOriginUrl(process.env.NEXT_PUBLIC_CLOUDFRONT_URL);
}

export function getStorefrontAssetPrefix() {
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  const configured = process.env.NEXT_PUBLIC_ASSET_PREFIX?.trim();
  if (!configured) {
    return undefined;
  }

  return configured.replace(/\/$/, '');
}
