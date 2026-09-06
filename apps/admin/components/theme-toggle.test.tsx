import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { ThemeProvider } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

it('changes the provider theme and follows subsequent changes from another tab', async () => {
  window.localStorage.setItem('theme', 'dark');
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
  const button = await screen.findByRole('button', { name: 'Switch to light mode' });
  await userEvent.click(button);
  await waitFor(() => expect(document.documentElement).toHaveClass('light'));
  expect(window.localStorage.getItem('theme')).toBe('light');
  expect(button).toHaveAccessibleName('Switch to dark mode');

  fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
  await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  expect(button).toHaveAccessibleName('Switch to light mode');
});
