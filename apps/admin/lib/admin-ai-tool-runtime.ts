import type { ActionActor } from './action-history';

export type AdminAiLiveToolRuntime = {
  kind: 'live';
  actorId: string;
  exportOwnerKey: string;
  actor: ActionActor;
  conversationId: number;
  autoAcceptProposals: boolean;
};

type AdminAiEvaluationToolRuntime = {
  kind: 'evaluation';
  actorId?: string;
};

export type AdminAiToolRuntime = AdminAiLiveToolRuntime | AdminAiEvaluationToolRuntime;

export type AdminAiToolBuildContext = {
  permissions: readonly import('./permissions').PermissionKey[];
  locale: 'en' | 'fr' | 'ar';
  now: Date;
  runtime: AdminAiToolRuntime;
};

function evaluationReceipt(input: unknown) {
  return {
    kind: 'evaluation_noop' as const,
    applied: false as const,
    reason: 'Read-only evaluation: no application state was changed.',
    receivedInput: input,
  };
}

export async function executeAdminAiToolForRuntime<T>(
  runtime: AdminAiToolRuntime,
  input: unknown,
  execute: (live: AdminAiLiveToolRuntime) => T | Promise<T>,
) {
  return runtime.kind === 'evaluation' ? evaluationReceipt(input) : execute(runtime);
}

export function adminAiToolActorId(runtime: AdminAiToolRuntime) {
  return runtime.kind === 'live' ? runtime.actorId : (runtime.actorId ?? 'admin-ai-eval');
}
