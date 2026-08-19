import { permanentRedirect } from 'next/navigation';

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  permanentRedirect(`/${locale}/administration/storefront`);
}
