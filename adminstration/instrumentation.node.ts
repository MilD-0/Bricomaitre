import * as Sentry from '@sentry/nextjs';

import { startEcotrackScheduler } from './lib/ecotrack-scheduler';

Sentry.setTag('service', 'admin');
startEcotrackScheduler();
