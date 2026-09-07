'use client';
import { AiProposalWorkspaceView } from './proposals/proposals-view';
import { useAiProposalWorkspace } from './proposals/use-proposals';
export function AiProposalWorkspace(...args: Parameters<typeof useAiProposalWorkspace>) {
  const model = useAiProposalWorkspace(...args);
  if (model.view === null) return model.fallback;
  return <AiProposalWorkspaceView {...model.view} />;
}
