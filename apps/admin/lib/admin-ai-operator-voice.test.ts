import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_OPERATOR_VOICE_SOURCE,
  adminAiOperatorVoiceInstructions,
} from './admin-ai-operator-voice';

describe('admin AI operator voice', () => {
  it('adapts the correct source without turning it into a phrase blacklist', () => {
    expect(ADMIN_AI_OPERATOR_VOICE_SOURCE).toBe(
      'https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md',
    );
    expect(adminAiOperatorVoiceInstructions('fr')).toContain('natural fr');
    expect(adminAiOperatorVoiceInstructions('fr')).toContain('typography follow the language');
  });

  it('makes proportional, factual writing the whole style contract', () => {
    const instructions = adminAiOperatorVoiceInstructions('en');
    expect(instructions).toContain('no more text than the operator needs');
    expect(instructions).toContain('only the fields that help answer the request');
    expect(instructions).toContain('Preserve material facts, limits, failures, and status');
    expect(instructions).not.toContain('silently check');
  });
});
