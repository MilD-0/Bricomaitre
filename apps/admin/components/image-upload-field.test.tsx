import {
  cleanup,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '../messages/en.json';
import { ImageUploadField } from './image-upload-field';

function render(ui: ReactNode) {
  return testingRender(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

class MockXHR {
  responseType = '';
  status = 0;
  response: unknown = null;
  upload = {
    onprogress: null as
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  open = vi.fn();
  send = vi.fn(() => {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    setTimeout(() => {
      this.status = 200;
      this.response = { urls: ['https://cdn.example.com/uploaded.jpg'] };
      this.onload?.();
    }, 80);
  });
}

describe('ImageUploadField', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a thumbnail and upload progress before applying the returned URL', async () => {
    const onChange = vi.fn();

    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={[]}
        onChange={onChange}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, new File(['img'], 'preview.png', { type: 'image/png' }));

    expect(await screen.findByText('preview.png')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/uploaded.jpg']);
    });
  });

  it('uploads an image dropped on the upload field', async () => {
    const onChange = vi.fn();

    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={[]}
        onChange={onChange}
      />,
    );

    const dropzone = screen.getByRole('button', { name: /choose image/i });
    const file = new File(['img'], 'dropped.png', { type: 'image/png' });

    fireEvent.dragEnter(dropzone, {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByRole('button', { name: /drop images to upload/i })).toHaveClass(
      'border-primary/80',
    );

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByText('dropped.png')).toBeInTheDocument();

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/uploaded.jpg']);
    });
  });

  it('opens a full-size preview when clicking an uploaded image card', async () => {
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={['https://cdn.example.com/existing.jpg']}
        onChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open image 1' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Image 1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/existing.jpg',
    );
    expect(screen.getByRole('img', { name: 'Image 1' }).parentElement).toHaveClass(
      'bg-[hsl(var(--background)/0.86)]',
    );
  });

  it('renders pointer cursors for image actions', () => {
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={['https://cdn.example.com/existing.jpg']}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open image 1' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('button', { name: 'Change image 1' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('button', { name: 'Delete image 1' })).toHaveClass('cursor-pointer');
  });

  it('asks for confirmation before deleting an image', async () => {
    const onChange = vi.fn();

    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={['https://cdn.example.com/existing.jpg']}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete image 1' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete image?')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('locks body scrolling while a popup is open', async () => {
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={['https://cdn.example.com/existing.jpg']}
        onChange={vi.fn()}
      />,
    );

    expect(document.body.style.overflow).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Open image 1' }));
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog overlay' }));
    expect(document.body.style.overflow).toBe('');
  });
});
