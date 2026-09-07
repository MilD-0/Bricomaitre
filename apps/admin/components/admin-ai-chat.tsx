'use client';
import { AdminAiChatView } from './ai-chat/ai-chat-view';
import { useAdminAiChat } from './ai-chat/use-ai-chat';
export function AdminAiChat(...args: Parameters<typeof useAdminAiChat>) {
  const model = useAdminAiChat(...args);
  if (model.view === null) return model.fallback;
  return <AdminAiChatView {...model.view} />;
}
