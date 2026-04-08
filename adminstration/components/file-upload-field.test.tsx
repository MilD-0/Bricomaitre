import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BulletinAttachment } from '../lib/bulletin';
import { FileUploadField } from './file-upload-field';

const mockUse = vi.fn();
const mockOn = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@uppy/core', () => ({
  default: class MockUppy {
    use = mockUse;
    on = mockOn;
    addFile = vi.fn();
    upload = vi.fn().mockResolvedValue(undefined);
    cancelAll = vi.fn();
    destroy = mockDestroy;
  },
}));

vi.mock('@uppy/xhr-upload', () => ({
  default: {},
}));

describe('FileUploadField', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const value: BulletinAttachment[] = [
    {
      fileName: 'plan.png',
      fileUrl: 'https://cdn.example.com/plan.png',
      fileKey: 'bulletin/plan.png',
      contentType: 'image/png',
      size: 4096,
    },
    {
      fileName: 'brief.pdf',
      fileUrl: 'https://cdn.example.com/brief.pdf',
      fileKey: 'bulletin/brief.pdf',
      contentType: 'application/pdf',
      size: 2048,
    },
  ];

  beforeEach(() => {
    mockUse.mockReset();
    mockOn.mockReset();
    mockDestroy.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('renders uploaded files, previews images, and exposes downloads', async () => {
    render(
      <FileUploadField
        uploadUrl="/api/uploads/bulletin"
        label="Attachments"
        value={value}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('plan.png')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Preview plan.png' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'plan.png' })[1]).toHaveAttribute('src', 'https://cdn.example.com/plan.png');
    expect(screen.getAllByRole('img', { name: 'plan.png' })[1].parentElement).toHaveClass('bg-[hsl(var(--background)/0.86)]');
  });

  it('confirms before deleting an uploaded file', async () => {
    const onChange = vi.fn();

    render(
      <FileUploadField
        uploadUrl="/api/uploads/bulletin"
        label="Attachments"
        value={value}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(screen.getByText('Delete attachment?')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);

    expect(onChange).toHaveBeenCalledWith([
      {
        fileName: 'brief.pdf',
        fileUrl: 'https://cdn.example.com/brief.pdf',
        fileKey: 'bulletin/brief.pdf',
        contentType: 'application/pdf',
        size: 2048,
      },
    ]);
  });

  it('forwards the upload response payload through onUploaded', async () => {
    const uploaded = {
      fileName: 'sheet.xlsx',
      fileUrl: 'https://cdn.example.com/sheet.xlsx',
      fileKey: 'stats/sheet.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1234,
    } satisfies BulletinAttachment;
    const onChange = vi.fn();
    const onUploaded = vi.fn();
    const listeners = new Map<string, (...args: unknown[]) => void>();

    mockOn.mockImplementation((event, callback) => {
      listeners.set(event, callback);
    });

    render(
      <FileUploadField
        uploadUrl="/api/uploads/bulletin"
        label="Attachments"
        value={[]}
        onChange={onChange}
        onUploaded={onUploaded}
      />,
    );

    listeners.get('upload-success')?.(
      { id: 'f1', name: 'sheet.xlsx' },
      { body: { files: [uploaded], import: { newOrders: 4 } } },
    );

    expect(onChange).toHaveBeenCalledWith([uploaded]);
    expect(onUploaded).toHaveBeenCalledWith({
      file: uploaded,
      body: { files: [uploaded], import: { newOrders: 4 } },
    });
  });
});
