import * as React from 'react';

import { cn } from '../../lib/utils';

export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full bg-card shadow-[var(--shadow-vapor)]', className)} {...props} />;
}

export function AvatarImage({ className, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    setHidden(false);
  }, [props.src]);

  return (
    <img
      alt={alt}
      className={cn('size-full object-cover', hidden && 'hidden', className)}
      onError={() => setHidden(true)}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
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
