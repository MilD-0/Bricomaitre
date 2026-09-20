import { act } from '@testing-library/react';

import { ADMIN_AI_OPEN_EVENT } from '../lib/admin-ai-events';

export function openAdminAiChat() {
  act(() => window.dispatchEvent(new CustomEvent(ADMIN_AI_OPEN_EVENT)));
}
