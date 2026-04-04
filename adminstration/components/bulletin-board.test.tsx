import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./file-upload-field', () => ({
  FileUploadField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: Array<{ fileName: string; fileUrl: string; fileKey: string; contentType: string; size: number }>;
    onChange: (files: Array<{ fileName: string; fileUrl: string; fileKey: string; contentType: string; size: number }>) => void;
  }) => (
    <label>
      {label}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            {
              fileName: 'handoff.pdf',
              fileUrl: 'https://cdn.example.com/handoff.pdf',
              fileKey: 'bulletin/handoff.pdf',
              contentType: 'application/pdf',
              size: 4096,
            },
          ])
        }
      >
        Add attachment
      </button>
    </label>
  ),
}));

import { BulletinBoard } from './bulletin-board';
import messages from '../messages/en.json';
import { server } from '../test/mocks/server';

describe('BulletinBoard', () => {
  const createCalls: unknown[] = [];
  const patchCalls: Array<{ url: string; body: unknown }> = [];
  const deleteCalls: string[] = [];
  const deleteReplyCalls: string[] = [];
  const replyCalls: Array<{ url: string; body: unknown }> = [];
  const reactionCalls: Array<{ url: string; body: unknown }> = [];

  beforeEach(() => {
    createCalls.length = 0;
    patchCalls.length = 0;
    deleteCalls.length = 0;
    deleteReplyCalls.length = 0;
    replyCalls.length = 0;
    reactionCalls.length = 0;
    window.localStorage.clear();

    server.use(
      http.get('/api/bulletin', () =>
        HttpResponse.json({
          currentUserId: 'user-1',
          availableTags: ['ops', 'urgent'],
          permissions: {
            canModerate: true,
            canPost: true,
          },
          posts: [
            {
              id: 1,
              title: 'Pinned issue',
              body: 'The **front counter** printer needs toner before noon.',
              tags: ['ops', 'urgent'],
              attachments: [],
              reactions: [
                {
                  emoji: '👍',
                  count: 1,
                  reacted: false,
                  users: [
                    {
                      id: 'user-2',
                      name: 'Nadia',
                      email: 'nadia@example.com',
                    },
                  ],
                },
              ],
              replies: [
                {
                  id: 91,
                  body: 'I can cover this.',
                  createdAt: '2026-01-02T01:00:00.000Z',
                  updatedAt: '2026-01-02T01:00:00.000Z',
                  author: {
                    id: 'user-1',
                    name: 'You',
                    email: 'you@example.com',
                  },
                  reactions: [],
                  permissions: {
                    canDelete: true,
                  },
                },
              ],
              pinned: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-02T00:00:00.000Z',
              author: {
                id: 'user-2',
                name: 'Nadia',
                email: 'nadia@example.com',
              },
              permissions: {
                canEdit: true,
                canDelete: true,
                canPin: true,
              },
            },
            ...Array.from({ length: 21 }, (_, index) => ({
              id: index + 2,
              title: index === 20 ? 'Page two update' : `Packing reminder ${index + 1}`,
              body: 'Use the blue labels for campaign bundles only.',
              tags: ['ops'],
              attachments: [],
              reactions: [],
              replies: [],
              pinned: false,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: index === 20 ? '2025-12-01T00:00:00.000Z' : `2026-01-${String((index % 9) + 1).padStart(2, '0')}T00:00:00.000Z`,
              author: {
                id: 'user-1',
                name: 'You',
                email: 'you@example.com',
              },
              permissions: {
                canEdit: true,
                canDelete: true,
                canPin: true,
              },
            })),
          ],
        }),
      ),
      http.post('/api/bulletin', async ({ request }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        createCalls.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/bulletin/:id', async ({ request }) => {
        patchCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/bulletin/:id', ({ request }) => {
        deleteCalls.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
      http.delete('/api/bulletin/replies/:replyId', ({ request }) => {
        deleteReplyCalls.push(request.url);
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/bulletin/:id/replies', async ({ request }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        replyCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/bulletin/:id/reactions', async ({ request }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        reactionCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/bulletin/replies/:replyId/reactions', async ({ request }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        reactionCalls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json({ ok: true });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function renderBoard() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <BulletinBoard />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it('creates a post with normalized tags and attachments from the closed composer flow', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');
    expect(screen.queryByPlaceholderText('Post title')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New post' }));
    await userEvent.type(await screen.findByPlaceholderText('Post title'), 'Shift handoff');
    await userEvent.type(
      screen.getByPlaceholderText('Post content'),
      'Lock the paint cage after receiving the final truck.',
    );
    await userEvent.type(screen.getByPlaceholderText('Tags'), '#Ops, Closing, ops');
    await userEvent.click(screen.getByRole('button', { name: 'Attachments' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pin this post' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish post' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Post title')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(createCalls).toContainEqual({
        title: 'Shift handoff',
        body: 'Lock the paint cage after receiving the final truck.',
        tags: ['ops', 'closing'],
        tagsInput: '#Ops, Closing, ops',
        pinned: true,
        attachments: [
          {
            fileName: 'handoff.pdf',
            fileUrl: 'https://cdn.example.com/handoff.pdf',
            fileKey: 'bulletin/handoff.pdf',
            contentType: 'application/pdf',
            size: 4096,
          },
        ],
      });
    });
  }, 15_000);

  it('filters by plain tag labels, confirms delete, and paginates posts', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');

    await userEvent.click(screen.getByRole('button', { name: 'urgent' }));
    expect(screen.getByText('Pinned issue')).toBeInTheDocument();
    expect(screen.queryByText('Packing reminder 1')).not.toBeInTheDocument();
    expect(screen.queryByText('#urgent')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete post?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

    await waitFor(() => {
      expect(deleteCalls).toContain('http://localhost:3000/api/bulletin/1');
    });

    await userEvent.click(screen.getByRole('button', { name: 'All tags' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(await screen.findByText('Page two update')).toBeInTheDocument();
  }, 15_000);

  it('restores a draft after remount', async () => {
    const firstRender = renderBoard();

    await screen.findByText('Pinned issue');
    await userEvent.click(screen.getByRole('button', { name: 'New post' }));
    await userEvent.type(await screen.findByPlaceholderText('Post title'), 'Saved draft');
    await userEvent.type(
      screen.getByPlaceholderText('Post content'),
      'This draft should still be here after a remount.',
    );

    firstRender.unmount();

    renderBoard();

    expect(await screen.findByDisplayValue('Saved draft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('This draft should still be here after a remount.')).toBeInTheDocument();
  }, 15_000);

  it('submits post reactions and replies', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');

    await userEvent.click(screen.getAllByRole('button', { name: '👍1' })[0]);
    await waitFor(() => {
      expect(reactionCalls).toContainEqual({
        url: 'http://localhost:3000/api/bulletin/1/reactions',
        body: { emoji: '👍' },
      });
    });

    await userEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]);
    await userEvent.type(screen.getByPlaceholderText('Reply'), 'I will handle it.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => {
      expect(screen.getByText('I will handle it.')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(replyCalls).toContainEqual({
        url: 'http://localhost:3000/api/bulletin/1/replies',
        body: { body: 'I will handle it.' },
      });
    });
  });

  it('updates reply reactions optimistically', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');
    const replyCard = screen.getByText('I can cover this.').closest('.rounded-xl');

    expect(replyCard).not.toBeNull();

    await userEvent.click(within(replyCard as HTMLElement).getByRole('button', { name: '👏' }));

    await waitFor(() => {
      expect(reactionCalls).toContainEqual({
        url: 'http://localhost:3000/api/bulletin/replies/91/reactions',
        body: { emoji: '👏' },
      });
    });
  });

  it('confirms before deleting a reply', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');

    await userEvent.click(screen.getByRole('button', { name: 'Delete reply' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('I can cover this.').length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete reply' })[1]);

    await waitFor(() => {
      expect(deleteReplyCalls).toContain('http://localhost:3000/api/bulletin/replies/91');
    });
  });
});
