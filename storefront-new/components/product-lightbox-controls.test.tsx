import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProductLightboxControls } from './product-lightbox-controls';

const labels = {
  gallery: 'Photos du produit',
  zoom: 'Agrandir l’image',
  closeZoom: 'Fermer l’image agrandie',
  previousImage: 'Photo précédente',
  nextImage: 'Photo suivante',
};

describe('ProductLightboxControls', () => {
  afterEach(() => cleanup());

  it('portals compact accessible controls and forwards gallery actions', () => {
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    const actions = {
      onClose: vi.fn(),
      onZoom: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
    };

    render(
      <ProductLightboxControls
        portalTarget={portalTarget}
        index={1}
        count={3}
        direction="ltr"
        labels={labels}
        {...actions}
      />,
    );

    expect(portalTarget.querySelector('.product-lightbox-counter')).toHaveTextContent('2/3');
    fireEvent.click(screen.getByRole('button', { name: labels.zoom }));
    fireEvent.click(screen.getByRole('button', { name: labels.closeZoom }));
    fireEvent.click(screen.getByRole('button', { name: labels.previousImage }));
    fireEvent.click(screen.getByRole('button', { name: labels.nextImage }));

    expect(actions.onZoom).toHaveBeenCalledOnce();
    expect(actions.onClose).toHaveBeenCalledOnce();
    expect(actions.onPrevious).toHaveBeenCalledOnce();
    expect(actions.onNext).toHaveBeenCalledOnce();
    expect(portalTarget.querySelectorAll('.product-lightbox-control')).toHaveLength(4);
  });

  it('disables navigation at gallery boundaries', () => {
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    render(
      <ProductLightboxControls
        portalTarget={portalTarget}
        index={0}
        count={2}
        direction="rtl"
        labels={labels}
        onClose={vi.fn()}
        onZoom={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: labels.previousImage })).toBeDisabled();
    expect(screen.getByRole('button', { name: labels.nextImage })).toBeEnabled();
  });
});
