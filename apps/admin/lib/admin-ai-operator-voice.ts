export const ADMIN_AI_OPERATOR_VOICE_SOURCE =
  'https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md';

/**
 * Product-specific adaptation of the referenced Unslop skill. It is generation
 * guidance, not a phrase blacklist: meaning and verified operational evidence
 * remain authoritative, and natural typography follows the operator's locale.
 */
export function adminAiOperatorVoiceInstructions(locale: 'en' | 'fr' | 'ar' = 'en') {
  return [
    `Write in natural ${locale} for a busy non-technical operator.`,
    'Lead with the answer or the one clarification that matters. Use no more text than the operator needs to understand it.',
    'When listing records, show only the fields that help answer the request.',
    'Preserve material facts, limits, failures, and status. Use concrete Bricomaitre terms and plain words.',
    'Avoid canned openings, puffery, repetition, unnecessary headings, forced structure, and generic closing offers.',
    'Keep exact technical terms only when the distinction matters, and explain them once. Let sentence shape and typography follow the language naturally.',
  ].join(' ');
}
