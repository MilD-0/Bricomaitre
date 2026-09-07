import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./file-upload-field', () => ({
  FileUploadField: ({
    label,
    value,
    onChange,
    onUploadingChange,
  }: {
    label: string;
    onUploadingChange?: (uploading: boolean) => void;
    value: Array<{
      fileName: string;
      fileUrl: string;
      fileKey: string;
      contentType: string;
      size: number;
    }>;
    onChange: (
      files: Array<{
        fileName: string;
        fileUrl: string;
        fileKey: string;
        contentType: string;
        size: number;
      }>,
    ) => void;
  }) => (
    <label>
      {label}
      <button type="button" aria-label="Start upload" onClick={() => onUploadingChange?.(true)}>
        Start upload
      </button>
      <button type="button" aria-label="Finish upload" onClick={() => onUploadingChange?.(false)}>
        Finish upload
      </button>
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

import { bulletinPostPatchSchema } from '../lib/bulletin';
import messages from '../messages/en.json';
import { server } from '../test/mocks/server';
import { BulletinBoard } from './bulletin-board';

describe('BulletinBoard', () => {
  let additionalPostCount = 0;
  const createCalls: unknown[] = [];
  const patchCalls: Array<{ url: string; body: unknown }> = [];
  const deleteCalls: string[] = [];
  const deleteReplyCalls: string[] = [];
  const replyCalls: Array<{ url: string; body: unknown }> = [];
  const reactionCalls: Array<{ url: string; body: unknown }> = [];

  beforeEach(() => {
    additionalPostCount = 0;
    createCalls.length = 0;
    patchCalls.length = 0;
    deleteCalls.length = 0;
    deleteReplyCalls.length = 0;
    replyCalls.length = 0;
    reactionCalls.length = 0;
    window.localStorage.clear();

    server.use(
      http.get('/api/bulletin', ({ request }) => {
        const url = new URL(request.url);
        const requestedPage = Number(url.searchParams.get('page') ?? 1);
        const requestedLimit = Number(url.searchParams.get('limit') ?? 20);
        const tag = url.searchParams.get('tag') ?? 'all';
        const allPosts = [
          {
            id: 1,
            title: 'Pinned issue',
            body: 'The **front counter** printer needs toner before noon.\nSecond line stays visible.\n\n- Replace cartridge\n- Run a test page',
            tags: ['ops', 'urgent'],
            attachments: [],
            reactions: [
              {
                emoji: '👍',
                count: 1,
                reacted: false,
                users: [{ id: 'user-2', name: 'Nadia', email: 'nadia@example.com' }],
              },
            ],
            replies: [
              {
                id: 91,
                body: 'I can cover this.',
                createdAt: '2026-01-02T01:00:00.000Z',
                updatedAt: '2026-01-02T01:00:00.000Z',
                author: { id: 'user-1', name: 'You', email: 'you@example.com' },
                reactions: [],
                permissions: { canDelete: true },
              },
            ],
            pinned: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            author: { id: 'user-2', name: 'Nadia', email: 'nadia@example.com' },
            permissions: { canEdit: true, canDelete: true, canPin: true },
          },
          ...Array.from({ length: additionalPostCount }, (_, index) => ({
            id: index + 2,
            title: index === 20 ? 'Page two update' : `Packing reminder ${index + 1}`,
            body: 'Use the blue labels for campaign bundles only.',
            tags: ['ops'],
            attachments: [],
            reactions: [],
            replies: [],
            pinned: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt:
              index === 20
                ? '2025-12-01T00:00:00.000Z'
                : `2026-01-${String((index % 9) + 1).padStart(2, '0')}T00:00:00.000Z`,
            author: { id: 'user-1', name: 'You', email: 'you@example.com' },
            permissions: { canEdit: true, canDelete: true, canPin: true },
          })),
        ];
        const filtered = allPosts
          .filter((post) => tag === 'all' || post.tags.includes(tag))
          .sort(
            (left, right) =>
              Number(right.pinned) - Number(left.pinned) ||
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
              right.id - left.id,
          );
        const totalPages = Math.max(1, Math.ceil(filtered.length / requestedLimit));
        const page = Math.min(requestedPage, totalPages);
        return HttpResponse.json({
          currentUserId: 'user-1',
          availableTags: ['ops', 'urgent'],
          permissions: {
            canModerate: true,
            canPost: true,
          },
          posts: filtered.slice((page - 1) * requestedLimit, page * requestedLimit),
          pagination: {
            page,
            limit: requestedLimit,
            totalItems: filtered.length,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        });
      }),
      http.post('/api/bulletin', async ({ request }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        createCalls.push(await request.json());
        return HttpResponse.json({ ok: true });
      }),
      http.patch('/api/bulletin/:id', async ({ request }) => {
        const body = await request.json();
        const parsed = bulletinPostPatchSchema.safeParse(body);
        if (!parsed.success)
          return HttpResponse.json({ error: parsed.error.message }, { status: 400 });
        patchCalls.push({ url: request.url, body });
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

  it('keeps a failed reply available for retry', async () => {
    server.use(
      http.post('/api/bulletin/:id/replies', () =>
        HttpResponse.json({ error: 'Unavailable' }, { status: 503 }),
      ),
    );
    renderBoard();
    await screen.findByText('Pinned issue');
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByPlaceholderText('Reply'), 'Keep these handoff details.');
    await userEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled());
    expect(screen.getByPlaceholderText('Reply')).toHaveValue('Keep these handoff details.');
  });

  it('rolls back a failed reaction in its original tag view after navigation', async () => {
    additionalPostCount = 1;
    let finish!: () => void;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.use(
      http.post('/api/bulletin/:id/reactions', async () => {
        await response;
        return HttpResponse.json({ error: 'Unavailable' }, { status: 503 });
      }),
    );
    renderBoard();
    await screen.findByText('Packing reminder 1');
    try {
      await userEvent.click(screen.getAllByRole('button', { name: '👍1' })[0]);
      await userEvent.click(screen.getByRole('button', { name: 'urgent' }));
      await waitFor(() => expect(screen.queryByText('Packing reminder 1')).not.toBeInTheDocument());
      finish();
      await waitFor(() => expect(screen.getByRole('button', { name: '👍1' })).toBeEnabled());
      expect(screen.queryByText('Packing reminder 1')).not.toBeInTheDocument();
    } finally {
      finish();
    }
  });

  it('lets operators compose when browser draft storage is blocked', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Full');
    });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    try {
      renderBoard();
      await screen.findByText('Pinned issue');
      await userEvent.click(screen.getByRole('button', { name: 'New post' }));
      await userEvent.type(screen.getByPlaceholderText('Post title'), 'Available composer');
      expect(screen.getByPlaceholderText('Post title')).toHaveValue('Available composer');
    } finally {
      get.mockRestore();
      set.mockRestore();
      remove.mockRestore();
    }
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
  }, 15_000);
});
