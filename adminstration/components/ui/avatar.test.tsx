import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';

describe('Avatar', () => {
  it('renders an image when a source is available', () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.png" alt="Ada Lovelace" />
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );

    expect(screen.getByAltText('Ada Lovelace')).toHaveAttribute('src', 'https://example.com/avatar.png');
    expect(screen.getByText('AL')).toBeInTheDocument();
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
});
