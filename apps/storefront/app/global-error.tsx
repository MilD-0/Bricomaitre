'use client';

import { StorefrontFailure } from '@/components/storefront-failure';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;

  return (
    <html lang="fr">
      <body>
        <StorefrontFailure kind="error" locale="fr" onRetry={reset} />
      </body>
    </html>
  );
}
