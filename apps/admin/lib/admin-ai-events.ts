export const ADMIN_AI_OPEN_EVENT = 'bricomaitre:admin-ai-open';

export function openAdminAi() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_AI_OPEN_EVENT));
}
