import type { SVGProps } from 'react';

import { Button } from '../ui/button';

type GoogleLoginPanelProps = {
  signInLabel: string;
  onSignIn: () => Promise<void>;
};

function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.68-.06-1.33-.17-1.95H12v3.69h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.76 2.97-4.35 2.97-7.26Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.24-2.5c-.9.6-2.05.95-3.37.95-2.59 0-4.78-1.75-5.56-4.1H3.1v2.58A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC04"
        d="M6.44 13.91A6 6 0 0 1 6.13 12c0-.66.11-1.3.31-1.91V7.5H3.1a10 10 0 0 0 0 9l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.79.5 3.82 1.48l2.87-2.87C16.95 2.98 14.69 2 12 2A9.99 9.99 0 0 0 3.1 7.5l3.34 2.59c.78-2.35 2.97-4.1 5.56-4.1Z"
      />
    </svg>
  );
}

export function GoogleLoginPanel({ signInLabel, onSignIn }: GoogleLoginPanelProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form action={onSignIn}>
        <Button
          type="submit"
          variant="outline"
          className="h-12 whitespace-nowrap px-5 [&_svg]:size-5"
        >
          <GoogleMark />
          {signInLabel}
        </Button>
      </form>
    </main>
  );
}
