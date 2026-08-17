import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';
import { Checkbox } from './checkbox';
import { Button } from './button';
import { Card } from './card';
import { Field, FieldLabel } from './field';
import { Input } from './input';
import { NativeSelect, NativeSelectOption } from './native-select';
import { Switch } from './switch';
import { Textarea } from './textarea';

describe('theme primitives', () => {
  it('uses semantic button tokens', () => {
    render(<Button>Action</Button>);

    expect(screen.getByRole('button', { name: 'Action' })).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
    );
  });

  it('uses semantic card tokens', () => {
    const { container } = render(<Card>Card content</Card>);

    expect(container.firstElementChild).toHaveClass('bg-card', 'text-card-foreground');
  });

  it('uses semantic badge tokens', () => {
    const { container } = render(<Badge>Label</Badge>);

    expect(container.firstElementChild).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });

  it('uses semantic input tokens', () => {
    render(<Input aria-label="Field" />);

    expect(screen.getByLabelText('Field')).toHaveClass('border-input/15', 'bg-input');
  });

  it('uses semantic textarea tokens', () => {
    render(<Textarea aria-label="Notes" />);

    expect(screen.getByLabelText('Notes')).toHaveClass('border-input/15', 'bg-input');
  });

  it('uses semantic checkbox tokens', () => {
    render(<Checkbox aria-label="Enabled" />);

    expect(screen.getByLabelText('Enabled')).toHaveClass('border-input/15', 'bg-input');
  });

  it('uses semantic switch tokens', () => {
    render(<Switch aria-label="Enabled toggle" checked={false} />);

    expect(screen.getByRole('switch', { name: 'Enabled toggle' })).toHaveClass('bg-secondary');
  });

  it('uses semantic native select tokens', () => {
    render(
      <NativeSelect aria-label="Choice">
        <NativeSelectOption value="one">One</NativeSelectOption>
      </NativeSelect>,
    );

    expect(screen.getByLabelText('Choice')).toHaveClass('border-input/15', 'bg-input');
  });

  it('uses field composition helpers', () => {
    render(
      <Field>
        <FieldLabel htmlFor="example">Example</FieldLabel>
      </Field>,
    );

    expect(screen.getByText('Example')).toHaveClass('text-[0.75rem]', 'font-semibold', 'uppercase');
  });
});
