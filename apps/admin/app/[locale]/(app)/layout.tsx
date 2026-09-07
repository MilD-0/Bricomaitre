import { StorefrontOriginProvider } from '@/components/storefront-origin';
import { getStorefrontPublicBaseUrl } from '@/lib/storefront-public-url';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { AppShell } from '@/components/layout/app-shell';
import { auth } from '@/lib/auth';
import { getAdminAiModelOptions } from '@/lib/admin-ai-models';

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
  return (
    <StorefrontOriginProvider value={getStorefrontPublicBaseUrl()}>
      <AppShell
        adminAiModelIds={getAdminAiModelOptions(process.env.AI_PROVIDER?.trim().toLowerCase()).map(
          (option) => option.id,
        )}
        initialPermissions={session.user.permissions}
        initialRole={session.user.role}
        initialIsAllowed={session.user.isAllowed}
        initialRoleLabel={session.user.roleLabel}
        initialUserEmail={session.user.email}
        initialUserImage={session.user.image}
        initialUserName={session.user.name}
      >
        {children}
      </AppShell>
    </StorefrontOriginProvider>
  );
}
