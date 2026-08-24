import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ADMIN_AI_OPEN_EVENT } from '../lib/admin-ai-events';
import { AdminAiAskButton } from './admin-ai-ask-button';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({ ask: 'Demander à l’IA' })[key],
}));

describe('AdminAiAskButton', () => {
  it('opens the shared assistant with a localized action', () => {
    const open = vi.fn();
    window.addEventListener(ADMIN_AI_OPEN_EVENT, open);
    render(<AdminAiAskButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Demander à l’IA' }));

    expect(open).toHaveBeenCalledOnce();
    window.removeEventListener(ADMIN_AI_OPEN_EVENT, open);
  });
});
