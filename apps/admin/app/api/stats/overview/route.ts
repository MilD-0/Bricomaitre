import { createStatsSectionHandlers } from '../../../../lib/stats-section-route';

const handlers = createStatsSectionHandlers('overview');

export const GET = handlers.GET;
export const PUT = handlers.PUT;
