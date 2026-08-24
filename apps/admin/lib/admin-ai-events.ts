export const ADMIN_AI_OPEN_EVENT = 'bricomaitre:admin-ai-open';
export const ADMIN_AI_MUTATION_EVENT = 'bricomaitre:admin-ai-mutation';

export type AdminAiMutationEventDetail = {
  toolNames: string[];
};

export function notifyAdminAiMutation(toolNames: readonly string[]) {
  if (typeof window === 'undefined') return;
  const uniqueToolNames = [...new Set(toolNames.filter(Boolean))];
  if (uniqueToolNames.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<AdminAiMutationEventDetail>(ADMIN_AI_MUTATION_EVENT, {
      detail: { toolNames: uniqueToolNames },
    }),
  );
}
