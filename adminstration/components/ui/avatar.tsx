import * as React from 'react';

import { cn } from '../../lib/utils';

type AvatarImageStatus = 'idle' | 'loaded' | 'error';

const AvatarContext = React.createContext<{
  imageStatus: AvatarImageStatus;
  setImageStatus: React.Dispatch<React.SetStateAction<AvatarImageStatus>>;
} | null>(null);

function useAvatarContext() {
  const context = React.useContext(AvatarContext);

  if (!context) {
    throw new Error('Avatar components must be rendered within <Avatar>.');
  }

  return context;
}

export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [imageStatus, setImageStatus] = React.useState<AvatarImageStatus>('idle');

  return (
    <AvatarContext.Provider value={{ imageStatus, setImageStatus }}>
      <div
        className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full bg-card shadow-[var(--shadow-vapor)]', className)}
        {...props}
      />
    </AvatarContext.Provider>
  );
}

export function AvatarImage({ className, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { imageStatus, setImageStatus } = useAvatarContext();
  const imageRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    setImageStatus('idle');

    const image = imageRef.current;
    if (!image || !props.src || !image.complete) {
      return;
    }

    setImageStatus(image.naturalWidth > 0 ? 'loaded' : 'error');
  }, [props.src, setImageStatus]);

  return (
    <img
      ref={imageRef}
      alt={alt}
      className={cn('size-full object-cover', imageStatus === 'error' && 'hidden', className)}
      onError={() => setImageStatus('error')}
      onLoad={() => setImageStatus('loaded')}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  const { imageStatus } = useAvatarContext();

  if (imageStatus === 'loaded') {
    return null;
  }

  return (
    <span
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-secondary text-sm font-semibold text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}
