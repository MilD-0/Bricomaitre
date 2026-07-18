import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(), getConfig: vi.fn(), generateText: vi.fn(), rateLimit: vi.fn(), rateHeaders: vi.fn(),
  searchProducts: vi.fn(), getProduct: vi.fn(),
}));

vi.mock('@bric/ai-core', () => ({ createOpenAiResponsesModel: mocks.createModel, getAiConfig: mocks.getConfig }));
vi.mock('ai', () => ({ generateText: mocks.generateText, stepCountIs: vi.fn(() => 'stop'), tool: (definition: unknown) => definition }));
vi.mock('@/lib/storefront-ai-rate-limit', () => ({ enforceStorefrontAiRateLimit: mocks.rateLimit, storefrontAiRateLimitHeaders: mocks.rateHeaders }));
vi.mock('@/lib/storefront-api', () => ({ fetchLegacyProductsPage: mocks.searchProducts, fetchLegacyProductByToken: mocks.getProduct }));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('https://bricomaitre.com/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' }, body: JSON.stringify(body) });
}

describe('storefront shopping assistant route', () => {
  beforeEach(() => {
    mocks.createModel.mockReset().mockReturnValue('model');
    mocks.getConfig.mockReset().mockReturnValue({});
    mocks.generateText.mockReset().mockResolvedValue({ text: 'Here are suitable products.', toolResults: [] });
    mocks.rateLimit.mockReset().mockResolvedValue({ ok: true });
    mocks.rateHeaders.mockReset().mockReturnValue({ 'retry-after': '10' });
  });

  it('accepts a bounded anonymous shopping conversation without forwarding it upstream', async () => {
    const response = await POST(request({ locale: 'fr', messages: [{ role: 'user', content: 'Je cherche une perceuse' }] }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Here are suitable products.', toolResults: [] });
    expect(mocks.createModel).toHaveBeenCalledWith({}, 'storefront');
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ instructions: expect.stringContaining('shopping assistant') }));
    expect(mocks.searchProducts).not.toHaveBeenCalled();
  });

  it('rejects a rate-limited client before invoking the model', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, limit: 12, remaining: 0, resetAt: 0, retryAfterSeconds: 10 });
    const response = await POST(request({ locale: 'fr', messages: [{ role: 'user', content: 'Bonjour' }] }));
    expect(response.status).toBe(429);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('rejects malformed or overlong conversation input', async () => {
    const response = await POST(request({ locale: 'fr', messages: [] }));
    expect(response.status).toBe(400);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
