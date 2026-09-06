import {
  act,
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

let deferUploadCompletion = false;
const requests: MockXHR[] = [];
let failureMessage: string | null = null;
const pendingUploadCompletions: Array<() => void> = [];

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
  onabort: (() => void) | null = null;
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    requests.push(this);
  }

  open = vi.fn();
  send = vi.fn(() => {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    const complete = () => {
      this.status = failureMessage ? 400 : 200;
      this.response = failureMessage
        ? { error: failureMessage }
        : { urls: ['https://cdn.example.com/uploaded.jpg'] };
      this.onload?.();
    };
    if (deferUploadCompletion) {
      pendingUploadCompletions.push(complete);
      return;
    }
    setTimeout(complete, 80);
  });
}

describe('ImageUploadField', () => {
  beforeEach(() => {
    deferUploadCompletion = false;
    failureMessage = null;
    requests.length = 0;
    pendingUploadCompletions.length = 0;
    vi.stubGlobal('XMLHttpRequest', MockXHR as unknown as typeof XMLHttpRequest);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aborts active requests and releases previews when the editor closes', async () => {
    deferUploadCompletion = true;
    const onChange = vi.fn();
    const { unmount } = render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={[]}
        onChange={onChange}
      />,
    );
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['img'], 'pending.png', { type: 'image/png' }),
    );
    unmount();
    expect(requests[0]?.abort).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    await act(async () => pendingUploadCompletions.splice(0).forEach((complete) => complete()));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps server failures visible until the same file is retried successfully', async () => {
    failureMessage = 'File content does not match its declared image type';
    const onChange = vi.fn();
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={[]}
        onChange={onChange}
      />,
    );
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['img'], 'retry.png', { type: 'image/png' }),
    );
    expect(await screen.findByText(failureMessage)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    failureMessage = null;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/uploaded.jpg']),
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('limits simultaneous uploads to three and rejects oversized batches before uploading', async () => {
    deferUploadCompletion = true;
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        multiple
        label="Images"
        value={[]}
        onChange={vi.fn()}
      />,
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = Array.from(
      { length: 13 },
      (_, i) => new File(['img'], `${i}.png`, { type: 'image/png' }),
    );
    await userEvent.upload(fileInput, files);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose up to 12 images');
    expect(requests).toHaveLength(0);
    await userEvent.upload(fileInput, files.slice(0, 5));
    expect(requests).toHaveLength(3);
    await act(async () => pendingUploadCompletions.splice(0).forEach((complete) => complete()));
    expect(requests).toHaveLength(5);
    await act(async () => pendingUploadCompletions.splice(0).forEach((complete) => complete()));
  });

  it('shows a thumbnail and upload progress before applying the returned URL', async () => {
    const onChange = vi.fn();
    const onUploadingChange = vi.fn();
    deferUploadCompletion = true;

    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        value={[]}
        onChange={onChange}
        onUploadingChange={onUploadingChange}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, new File(['img'], 'preview.png', { type: 'image/png' }));

    expect(await screen.findByText('preview.png')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(onUploadingChange).toHaveBeenLastCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      pendingUploadCompletions.splice(0).forEach((complete) => complete());
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(['https://cdn.example.com/uploaded.jpg']);
      expect(onUploadingChange).toHaveBeenLastCalledWith(false);
      expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(
        onUploadingChange.mock.invocationCallOrder[1]!,
      );
    });
  });

  it('preserves a pending replacement when another file is dropped or image edits are attempted', async () => {
    const onChange = vi.fn();
    deferUploadCompletion = true;
    render(
      <ImageUploadField
        uploadUrl="/api/uploads/test"
        label="Images"
        multiple
        value={['https://cdn.example.com/existing.jpg']}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change image 1' }));
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['img'], 'replacement.png', { type: 'image/png' }),
    );
    expect(screen.getByRole('button', { name: 'Change image 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete image 1' })).toBeDisabled();
    const add = screen.getByRole('button', { name: /add images/i });
    expect(add).toBeDisabled();
    fireEvent.drop(add, {
      dataTransfer: { files: [new File(['img'], 'second.png', { type: 'image/png' })] },
    });
    await act(async () => pendingUploadCompletions.splice(0).forEach((complete) => complete()));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['https://cdn.example.com/uploaded.jpg']);
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
