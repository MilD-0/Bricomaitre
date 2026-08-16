import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { GoogleLoginPanel } from '../../components/auth/google-login-panel';
import { auth, signIn } from '../../lib/auth';
import { getDefaultAuthorizedHref } from '../../lib/navigation-access';

export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  const session = await auth();

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

  const t = await getTranslations();

  return (
    <GoogleLoginPanel
      signInLabel={t('auth.signInWithGoogle')}
      onSignIn={async () => {
        'use server';
        await signIn('google', { redirectTo: `/${locale}/administration` });
      }}
    />
  );
}
