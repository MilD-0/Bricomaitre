import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { http, HttpResponse } from 'msw';
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

import { BulletinBoard } from './bulletin-board';
import { bulletinPostPatchSchema } from '../lib/bulletin';
import messages from '../messages/en.json';
import { server } from '../test/mocks/server';

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

  it('edits a post through the strict API contract', async () => {
    const view = renderBoard();
    await screen.findByText('Pinned issue');
    const post = view.container.querySelector('[data-bulletin-post="1"]') as HTMLElement;
    await userEvent.click(within(post).getByRole('button', { name: 'Actions · Pinned issue' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const body = await screen.findByPlaceholderText('Post content');
    await userEvent.clear(body);
    await userEvent.type(body, 'Updated shift instructions');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(patchCalls).toContainEqual({
        url: expect.stringContaining('/api/bulletin/1'),
        body: expect.objectContaining({
          body: 'Updated shift instructions',
          tags: ['ops', 'urgent'],
        }),
      }),
    );
    expect((patchCalls[0]!.body as Record<string, unknown>).tagsInput).toBeUndefined();
  });

  it('blocks both publish and form submission while an attachment is uploading', async () => {
    renderBoard();
    await screen.findByText('Pinned issue');
    await userEvent.click(screen.getByRole('button', { name: 'New post' }));
    await userEvent.type(await screen.findByPlaceholderText('Post title'), 'Upload pending');
    await userEvent.type(screen.getByPlaceholderText('Post content'), 'Wait for the attachment.');
    await userEvent.click(screen.getByRole('button', { name: 'Start upload' }));
    const publish = screen.getByRole('button', { name: 'Publish post' });
    expect(publish).toBeDisabled();
    fireEvent.submit(publish.closest('form')!);
    await waitFor(() => expect(createCalls).toHaveLength(0));
    await userEvent.click(screen.getByRole('button', { name: 'Finish upload' }));
    await userEvent.click(publish);
    await waitFor(() => expect(createCalls).toHaveLength(1));
  });

  it('creates a post with normalized tags and attachments from the closed composer flow', async () => {
    const view = renderBoard();

    await screen.findByText('Pinned issue');
    expect(view.container.querySelector('[data-admin-workspace="bulletin"]')).toBeInTheDocument();
    expect(view.container.querySelectorAll('[data-workspace-frame]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-header]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-workspace-toolbar]')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Bulletin board' })).toHaveClass(
      'sr-only',
      'lg:not-sr-only',
    );
    expect(view.container.querySelector('[data-workspace-heading] span')).toHaveTextContent(
      '1 visible',
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(view.container.querySelector('[data-bulletin-post="1"]')).toHaveClass('max-w-5xl');
    expect(screen.queryByPlaceholderText('Post title')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New post' }));
    await userEvent.type(await screen.findByPlaceholderText('Post title'), 'Shift handoff');
    await userEvent.type(
      screen.getByPlaceholderText('Post content'),
      'Lock the paint cage after receiving the final truck.',
    );
    await userEvent.type(screen.getByPlaceholderText('Tags'), '#Ops, Closing, ops');
    await userEvent.click(screen.getByRole('button', { name: 'Add attachment' }));
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
  }, 30_000);

  it('filters by plain tag labels, confirms delete, and paginates posts', async () => {
    additionalPostCount = 21;
    const view = renderBoard();

    await screen.findByText('Pinned issue');
    expect(view.container.querySelector('[data-workspace-heading] span')).toHaveTextContent(
      '22 visible',
    );

    await userEvent.click(screen.getByRole('button', { name: 'urgent' }));
    expect(screen.getByText('Pinned issue')).toBeInTheDocument();
    expect(screen.queryByText('Packing reminder 1')).not.toBeInTheDocument();
    expect(screen.queryByText('#urgent')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Actions · Pinned issue' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete post?')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => {
      expect(deleteCalls).toContain('http://localhost:3000/api/bulletin/1');
    });

    await userEvent.click(screen.getByRole('button', { name: 'All tags' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(await screen.findByText('Page two update')).toBeInTheDocument();
  }, 15_000);

  it('renders markdown formatting and preserves line breaks in bulletin posts', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');

    expect(screen.getByText('front counter', { selector: 'strong' })).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_, node) =>
          node?.tagName === 'P' &&
          (node.textContent?.includes('Second line stays visible.') ?? false),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Replace cartridge', { selector: 'li' })).toBeInTheDocument();
    expect(screen.getByText('Run a test page', { selector: 'li' })).toBeInTheDocument();
  });

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
    expect(
      screen.getByDisplayValue('This draft should still be here after a remount.'),
    ).toBeInTheDocument();
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
  }, 30_000);

  it('updates reply reactions optimistically', async () => {
    renderBoard();

    await screen.findByText('Pinned issue');
    const replyCard = screen.getByText('I can cover this.').closest('[data-bulletin-reply]');

    expect(replyCard).not.toBeNull();

    await userEvent.click(within(replyCard as HTMLElement).getByRole('button', { name: '👏' }));

    await waitFor(() => {
      expect(reactionCalls).toContainEqual({
        url: 'http://localhost:3000/api/bulletin/replies/91/reactions',
        body: { emoji: '👏' },
      });
    });
  });

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
