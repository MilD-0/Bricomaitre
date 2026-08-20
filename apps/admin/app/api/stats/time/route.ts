import { createStatsSectionHandlers } from '../../../../lib/stats-section-route';

const handlers = createStatsSectionHandlers('time');

export const GET = handlers.GET;
export const PUT = handlers.PUT;
