import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders with a pointer cursor by default', () => {
    render(<Button type="button">Save brand</Button>);

    expect(screen.getByRole('button', { name: 'Save brand' })).toHaveClass('cursor-pointer');
  });
});
