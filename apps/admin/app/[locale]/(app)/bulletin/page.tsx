import { BulletinBoard } from '@/components/bulletin-board';
import { requirePageAccess } from '@/lib/page-access';

export default async function BulletinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePageAccess(locale, 'bulletin');
  return <BulletinBoard />;
}
