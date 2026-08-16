import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const setThemeMock = vi.fn();

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'dark',
    setTheme: setThemeMock,
  }),
}));

import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  it('renders an icon-only control and switches to the opposite theme', async () => {
    render(<ThemeToggle />);

    const button = await screen.findByRole('button', { name: 'Switch to light mode' });
    expect(button).toBeInTheDocument();
    expect(button).not.toHaveTextContent(/\S/);

    await userEvent.click(button);

    expect(setThemeMock).toHaveBeenCalledWith('light');
  });
});
