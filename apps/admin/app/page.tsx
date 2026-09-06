import { getLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  redirect(`/${await getLocale()}`);
}
