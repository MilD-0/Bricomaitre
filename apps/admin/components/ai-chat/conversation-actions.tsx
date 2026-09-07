'use client';
import type { ConversationSummary } from '../admin-ai-chat/types';
import { useConversationState } from './use-conversation-state';
export function useConversationActions({
  leaveStreamingTurn,
  conversationRequestRef,
  activeConversationRef,
  conversationKeyRef,
  setSelectedConversationId,
  setLoadingConversation,
  setConversationLoadError,
  setMessages,
  setInput,
  setConversations,
  t,
  messages,
}: Pick<
  ReturnType<typeof useConversationState> & Parameters<typeof useConversationState>[0],
  | 'leaveStreamingTurn'
  | 'conversationRequestRef'
  | 'activeConversationRef'
  | 'conversationKeyRef'
  | 'setSelectedConversationId'
  | 'setLoadingConversation'
  | 'setConversationLoadError'
  | 'setMessages'
  | 'setInput'
  | 'setConversations'
  | 't'
  | 'messages'
>) {
  function newChat() {
    leaveStreamingTurn();
    conversationRequestRef.current += 1;
    activeConversationRef.current = null;
    conversationKeyRef.current = crypto.randomUUID();
    setSelectedConversationId(null);
    setLoadingConversation(false);
    setConversationLoadError(false);
    setMessages([]);
    setInput('');
  }
  async function renameConversation(conversation: ConversationSummary, title: string) {
    const normalized = title.trim();
    if (!normalized) return false;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: normalized }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { conversation: ConversationSummary };
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? data.conversation : item)),
    );
    if (activeConversationRef.current?.id === conversation.id)
      activeConversationRef.current = data.conversation;
    return true;
  }
  async function deleteConversation(conversation: ConversationSummary) {
    if (!window.confirm(t('aiChat.deleteChatConfirm'))) return;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (activeConversationRef.current?.id === conversation.id) newChat();
  }
  async function rateAssistantMessage(
    messageRecordId: number,
    feedback: 'helpful' | 'not_helpful',
  ) {
    const previous = messages.find(
      (message) => message.messageRecordId === messageRecordId,
    )?.feedback;
    setMessages((current) =>
      current.map((message) =>
        message.messageRecordId === messageRecordId ? { ...message, feedback } : message,
      ),
    );
    const response = await fetch(`/api/ai/messages/${messageRecordId}/feedback`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    if (!response.ok) {
      setMessages((current) =>
        current.map((message) =>
          message.messageRecordId === messageRecordId
            ? { ...message, feedback: previous }
            : message,
        ),
      );
    }
  }
  return { newChat, renameConversation, deleteConversation, rateAssistantMessage };
}
