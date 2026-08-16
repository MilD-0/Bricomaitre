import type { MetadataRoute } from 'next';

import { buildStorefrontRobots } from '@/lib/seo-routes';

export default function robots(): MetadataRoute.Robots {
  return buildStorefrontRobots();
}
