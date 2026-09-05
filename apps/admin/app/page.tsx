import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { GoogleLoginPanel } from '../components/auth/google-login-panel';
import { auth, signIn } from '../lib/auth';
import { isDemoMode, signInDemo } from '../lib/demo-auth';
import { getDefaultAuthorizedHref } from '../lib/navigation-access';

export default async function HomePage() {
  await connection();
  const session = await auth();
  const locale = await getLocale();
  const t = await getTranslations();
  const demo = isDemoMode();

  if (session?.user?.isAllowed) {
    redirect(
      getDefaultAuthorizedHref({
        isAllowed: session.user.isAllowed,
        locale,
        permissions: session.user.permissions,
        role: session.user.role,
      }),
    );
  }

  return (
    <GoogleLoginPanel
      demo={demo}
      signInLabel={t(demo ? 'auth.enterDemo' : 'auth.signInWithGoogle')}
      onSignIn={async () => {
        'use server';
        const redirectTo = `/${locale}/administration`;
        if (isDemoMode()) {
          await signInDemo(redirectTo);
          return;
        }
        await signIn('google', { redirectTo });
      }}
    />
  );
}
