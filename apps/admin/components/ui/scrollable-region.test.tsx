import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScrollableRegion } from './scrollable-region';

describe('ScrollableRegion', () => {
  it('exposes horizontal content as a named keyboard-focusable region', () => {
    render(
      <ScrollableRegion label="Workflow results" className="custom-class">
        <table>
          <tbody>
            <tr>
              <td>Catalog enrichment</td>
            </tr>
          </tbody>
        </table>
      </ScrollableRegion>,
    );

    const region = screen.getByRole('region', { name: 'Workflow results' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-x-auto', 'custom-class');
  });
});
