import { StorefrontFailure } from '@/components/storefront-failure';

export default function NotFound() {
  return <StorefrontFailure kind="not-found" locale="fr" />;
}
