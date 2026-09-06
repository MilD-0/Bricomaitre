import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import ar from '../../messages/ar.json';
import { StructuredToolResultCard } from './message-results';

afterEach(cleanup);

it.each([
  ['en', en],
  ['fr', fr],
  ['ar', ar],
] as const)(
  'routes uncertain outcomes to recovery while retrying only confirmed rejections in %s',
  async (locale, messages) => {
    const onPrompt = vi.fn();
    const copy = messages.aiChat.ecotrackTerminal;
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <StructuredToolResultCard
          onNavigate={() => {}}
          onPrompt={onPrompt}
          result={{
            toolName: 'ecotrack_posting_terminal',
            output: {
              kind: 'ecotrack_posting_terminal',
              outcomeClassificationVersion: 1,
              provider: 'emir',
              attemptNumber: 1,
              retryCount: 0,
              recoveryRequired: [
                { orderId: 21, tracking: 'ACCEPTED-21', message: 'Local apply failed.' },
              ],
              providerRejections: [{ orderId: 22, message: 'Telephone rejected.' }],
              retryableOrderIds: [22],
              repairableOrderIds: [22],
            },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/ACCEPTED-21/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.openRecovery })).toHaveAttribute(
      'href',
      `/${locale}/orders/ecotrack`,
    );
    await userEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(onPrompt).toHaveBeenCalledWith(
      copy.retryPrompt.replace('{ids}', '22').replace('{provider}', 'emir'),
    );
  },
);

it('does not offer a retry for saved legacy failures without remote-outcome evidence', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <StructuredToolResultCard
        onNavigate={() => {}}
        onPrompt={vi.fn()}
        result={{
          toolName: 'ecotrack_posting_terminal',
          output: {
            kind: 'ecotrack_posting_terminal',
            provider: 'emir',
            providerRejections: [{ orderId: 21, message: 'Legacy failure' }],
            retryableOrderIds: [21],
            repairableOrderIds: [21],
          },
        }}
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.queryByRole('button', { name: en.aiChat.ecotrackTerminal.retry }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: en.aiChat.ecotrackTerminal.openRecovery }),
  ).toBeInTheDocument();
});
