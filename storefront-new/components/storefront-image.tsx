import Image, { type ImageProps } from 'next/image';

import { isSafeProductImageUrl } from '@/lib/product-images';

type StorefrontImageProps = ImageProps & { src: string };

export function StorefrontImage({ src, alt, ...props }: StorefrontImageProps) {
  if (isSafeProductImageUrl(src)) {
    return <Image src={src} alt={alt} {...props} />;
  }

  const {
    blurDataURL: _blurDataURL,
    fill: _fill,
    placeholder: _placeholder,
    preload: _preload,
    quality: _quality,
    ...nativeProps
  } = props;
  void _blurDataURL;
  void _fill;
  void _placeholder;
  void _preload;
  void _quality;

  // Legacy catalog origins load directly in the browser; only explicitly
  // trusted origins are allowed through Next's server-side image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} decoding="async" {...nativeProps} />;
}
