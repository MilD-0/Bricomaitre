import type { getAiConfig } from '@bric/ai-core';
import { stepCountIs } from 'ai';

export function adminAiGenerationOptions(
  config: Pick<
    ReturnType<typeof getAiConfig>,
    'adminMaxSteps' | 'adminMaxOutputTokens' | 'adminRequestTimeoutMs' | 'maxRetries'
  >,
  requestSignal?: AbortSignal,
) {
  const timeout = config.adminRequestTimeoutMs
    ? AbortSignal.timeout(config.adminRequestTimeoutMs)
    : undefined;
  return {
    stopWhen: config.adminMaxSteps ? stepCountIs(config.adminMaxSteps) : () => false,
    abortSignal:
      timeout && requestSignal
        ? AbortSignal.any([requestSignal, timeout])
        : (timeout ?? requestSignal),
    maxRetries: config.maxRetries,
    ...(config.adminMaxOutputTokens ? { maxOutputTokens: config.adminMaxOutputTokens } : {}),
  };
}
