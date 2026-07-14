type ImageRuntimeEnv = {
  NEXT_PUBLIC_CLOUDFRONT_URL?: string;
  NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS?: string;
};

export function getStorefrontImageOrigins(
  env: ImageRuntimeEnv = {
    // Explicit public-env reads are replaced in Next's client bundle, keeping
    // the server-render and hydration optimization decision identical.
    NEXT_PUBLIC_CLOUDFRONT_URL: process.env.NEXT_PUBLIC_CLOUDFRONT_URL,
    NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS: process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS,
  },
) {
  const values = [
    env.NEXT_PUBLIC_CLOUDFRONT_URL,
    ...(env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS?.split(',') ?? []),
  ];

  return Array.from(new Set(values.flatMap((value) => {
    if (!value?.trim()) return [];
    try {
      return [new URL(value.trim()).origin];
    } catch {
      return [];
    }
  })));
}

export function getStorefrontRemoteImagePatterns(env?: ImageRuntimeEnv) {
  return getStorefrontImageOrigins(env).map((origin) => {
    const url = new URL(origin);
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      port: url.port,
      pathname: '/**',
    };
  });
}

export function isSafeProductImageUrl(value: string, env?: ImageRuntimeEnv) {
  if (/^\/(?![\\/])/.test(value)) return true;
  try {
    return getStorefrontImageOrigins(env).includes(new URL(value).origin);
  } catch {
    return false;
  }
}

export function isDisplayableProductImageUrl(value: string, env?: ImageRuntimeEnv) {
  if (isSafeProductImageUrl(value, env)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
