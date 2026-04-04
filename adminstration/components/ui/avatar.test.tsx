import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';

describe('Avatar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the fallback until the image finishes loading', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Ada Lovelace" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );

    expect(within(container).getByText('AL')).toBeInTheDocument();
    expect(within(container).getByAltText('Ada Lovelace')).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('hides the fallback after the image loads successfully', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Ada Lovelace" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );

    const image = within(container).getByAltText('Ada Lovelace');
    fireEvent.load(image);

    expect(within(container).queryByText('AL')).not.toBeInTheDocument();
  });

  it('hides the image when loading fails so the fallback remains visible', () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Broken avatar" />
        <AvatarFallback>BA</AvatarFallback>
      </Avatar>,
    );

    const image = screen.getByAltText('Broken avatar');
    fireEvent.error(image);

    expect(image).toHaveClass('hidden');
    expect(screen.getByText('BA')).toBeInTheDocument();
  });

  it('hides the fallback when the image is already complete on mount', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(96);

    render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Cached avatar" />
        <AvatarFallback>CA</AvatarFallback>
      </Avatar>,
    );

    expect(screen.queryByText('CA')).not.toBeInTheDocument();
    expect(screen.getByAltText('Cached avatar')).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('resets to the fallback when the image source changes', () => {
    const { rerender } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar-a.png" alt="Switching avatar" />
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>,
    );

    const image = screen.getByAltText('Switching avatar');
    fireEvent.load(image);
    expect(screen.queryByText('SA')).not.toBeInTheDocument();

    rerender(
      <Avatar>
        <AvatarImage src="https://example.com/avatar-b.png" alt="Switching avatar" />
        <AvatarFallback>SA</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByText('SA')).toBeInTheDocument();
    expect(screen.getByAltText('Switching avatar')).toHaveAttribute('src', 'https://example.com/avatar-b.png');
  });
});
