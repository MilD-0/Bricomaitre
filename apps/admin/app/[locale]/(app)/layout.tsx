import { StorefrontOriginProvider } from '../../../components/storefront-origin';
import { getStorefrontPublicBaseUrl } from '../../../lib/storefront-public-url';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AppShell } from '../../../components/layout/app-shell';
import { getDb, hasDb } from '@bric/db/client';
import { users } from '@bric/db/schema';
import { auth } from '../../../lib/auth';
import { eq } from 'drizzle-orm';
import { getAdminAiModelOptions } from '../../../lib/admin-ai-models';

export default async function ProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  await connection();
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.isAllowed) {
    redirect(`/${locale}`);
  }
  const userId = session?.user?.id ?? null;
  const persistedUser =
    hasDb() && userId
      ? await getDb().query.users.findFirst({
          where: eq(users.id, userId),
          columns: {
            image: true,
          },
        })
      : null;

  return (
    <StorefrontOriginProvider value={getStorefrontPublicBaseUrl()}>
      <AppShell
        adminAiModelIds={getAdminAiModelOptions(process.env.AI_PROVIDER?.trim().toLowerCase()).map(
          (option) => option.id,
        )}
        initialPermissions={session?.user?.permissions ?? []}
        initialRole={session?.user?.role ?? 'viewer'}
        initialIsAllowed={session?.user?.isAllowed ?? false}
        initialRoleLabel={session?.user?.roleLabel ?? null}
        initialUserEmail={session?.user?.email ?? null}
        initialUserImage={persistedUser?.image ?? session?.user?.image ?? null}
        initialUserName={session?.user?.name ?? null}
      >
        {children}
      </AppShell>
    </StorefrontOriginProvider>
  );
}
