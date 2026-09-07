import { afterEach, expect, it, vi } from 'vitest';
import { adminAiGenerationOptions } from './admin-ai-generation-options';

afterEach(() => vi.restoreAllMocks());

it('applies the same step, output, retry, and turn deadline settings to both callers', async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const options = adminAiGenerationOptions({
    maxRetries: 2,
    adminMaxSteps: 16,
    adminMaxOutputTokens: 3_200,
    adminRequestTimeoutMs: 60_000,
  });
  expect(options.maxOutputTokens).toBe(3_200);
  expect(options.maxRetries).toBe(2);
  expect(await options.stopWhen({ steps: Array(15).fill({}) })).toBe(false);
  expect(await options.stopWhen({ steps: Array(16).fill({}) })).toBe(true);
  expect(timeout).toHaveBeenCalledWith(60_000);
  expect(options.abortSignal?.aborted).toBe(false);
  deadline.abort(new Error('Turn deadline reached'));
  expect(options.abortSignal?.aborted).toBe(true);
});

it('keeps absent caps disabled and preserves the live request cancellation signal', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  const request = new AbortController();
  const options = adminAiGenerationOptions({ maxRetries: 2 }, request.signal);
  expect(await options.stopWhen({ steps: Array(100).fill({}) })).toBe(false);
  expect(options).not.toHaveProperty('maxOutputTokens');
  expect(options.abortSignal).toBe(request.signal);
  expect(timeout).not.toHaveBeenCalled();
  expect(adminAiGenerationOptions({ maxRetries: 2 }).abortSignal).toBeUndefined();
});

it.each(['request', 'deadline'])('combines the live request with the deadline: %s', (source) => {
  const request = new AbortController();
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  const options = adminAiGenerationOptions(
    { maxRetries: 2, adminRequestTimeoutMs: 60_000 },
    request.signal,
  );
  (source === 'request' ? request : deadline).abort();
  expect(options.abortSignal?.aborted).toBe(true);
});
