import { describe, expect, it } from 'vitest';

import {
  getStorefrontImageOrigins,
  getStorefrontRemoteImagePatterns,
  isDisplayableProductImageUrl,
  isSafeProductImageUrl,
} from './product-images';

const env = {
  NEXT_PUBLIC_CLOUDFRONT_URL: 'https://cdn.example.com/catalog/',
  NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS:
    'https://media.example.com, invalid,https://cdn.example.com',
};

describe('product image policy', () => {
  it('deduplicates configured origins and ignores malformed values', () => {
    expect(getStorefrontImageOrigins(env)).toEqual([
      'https://cdn.example.com',
      'https://media.example.com',
    ]);
  });

  it('reads configured public origins through the default runtime policy', () => {
    const cloudfront = process.env.NEXT_PUBLIC_CLOUDFRONT_URL;
    const origins = process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS;
    process.env.NEXT_PUBLIC_CLOUDFRONT_URL = 'https://cdn.runtime.example.com/catalog/';
    process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = 'https://media.runtime.example.com';
    try {
      expect(getStorefrontImageOrigins()).toEqual([
        'https://cdn.runtime.example.com',
        'https://media.runtime.example.com',
      ]);
    } finally {
      if (cloudfront === undefined) delete process.env.NEXT_PUBLIC_CLOUDFRONT_URL;
      else process.env.NEXT_PUBLIC_CLOUDFRONT_URL = cloudfront;
      if (origins === undefined) delete process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS;
      else process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = origins;
    }
  });

  it('creates strict Next image patterns instead of wildcard hosts', () => {
    expect(getStorefrontRemoteImagePatterns(env)).toEqual([
      { protocol: 'https', hostname: 'cdn.example.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'media.example.com', port: '', pathname: '/**' },
    ]);
  });

  it('allows local and configured images while rejecting unknown origins', () => {
    expect(isSafeProductImageUrl('/product.jpg', env)).toBe(true);
    expect(isSafeProductImageUrl('https://cdn.example.com/product.jpg', env)).toBe(true);
    expect(isSafeProductImageUrl('//tracker.example.com/pixel.gif', env)).toBe(false);
    expect(isSafeProductImageUrl('/\\tracker.example.com/pixel.gif', env)).toBe(false);
    expect(isSafeProductImageUrl('https://tracker.example.com/pixel.gif', env)).toBe(false);
    expect(isSafeProductImageUrl('not a url', env)).toBe(false);
  });

  it('displays canonical legacy HTTPS images without trusting them for optimization or metadata', () => {
    expect(isDisplayableProductImageUrl('https://competitor.example/catalog/tool.jpg', env)).toBe(
      true,
    );
    expect(isSafeProductImageUrl('https://competitor.example/catalog/tool.jpg', env)).toBe(false);
    expect(isDisplayableProductImageUrl('http://competitor.example/catalog/tool.jpg', env)).toBe(
      false,
    );
    expect(
      isDisplayableProductImageUrl('https://user:secret@competitor.example/tool.jpg', env),
    ).toBe(false);
    expect(isDisplayableProductImageUrl('//competitor.example/tool.jpg', env)).toBe(false);
  });
});
