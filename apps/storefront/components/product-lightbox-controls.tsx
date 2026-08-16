'use client';

import { createPortal } from 'react-dom';
import { MotionConfig } from 'motion/react';

import { Button } from '@/components/ui/button';
import { ChevronLeftIcon } from '@/components/ui/chevron-left';
import { ChevronRightIcon } from '@/components/ui/chevron-right';
import { ExpandIcon } from '@/components/ui/expand';
import { XIcon } from '@/components/ui/x';

type ProductLightboxControlsProps = {
  portalTarget: HTMLElement;
  index: number;
  count: number;
  direction: 'ltr' | 'rtl';
  labels: {
    gallery: string;
    zoom: string;
    closeZoom: string;
    previousImage: string;
    nextImage: string;
  };
  onClose: () => void;
  onZoom: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function ProductLightboxControls({
  portalTarget,
  index,
  count,
  direction,
  labels,
  onClose,
  onZoom,
  onPrevious,
  onNext,
}: ProductLightboxControlsProps) {
  const PreviousIcon = direction === 'rtl' ? ChevronRightIcon : ChevronLeftIcon;
  const NextIcon = direction === 'rtl' ? ChevronLeftIcon : ChevronRightIcon;

  return createPortal(
    <MotionConfig reducedMotion="user">
      <div className="product-lightbox-controls" aria-label={labels.gallery}>
        <div className="product-lightbox-counter" aria-live="polite" aria-atomic="true">
          {index + 1}
          <span aria-hidden="true">/</span>
          {count}
        </div>

        <div className="product-lightbox-toolbar">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="product-lightbox-control"
            aria-label={labels.zoom}
            onClick={onZoom}
          >
            <ExpandIcon size={19} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="product-lightbox-control"
            aria-label={labels.closeZoom}
            onClick={onClose}
          >
            <XIcon size={20} aria-hidden="true" />
          </Button>
        </div>

        {count > 1 ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="product-lightbox-control product-lightbox-previous"
              aria-label={labels.previousImage}
              disabled={index === 0}
              onClick={onPrevious}
            >
              <PreviousIcon size={22} aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="product-lightbox-control product-lightbox-next"
              aria-label={labels.nextImage}
              disabled={index === count - 1}
              onClick={onNext}
            >
              <NextIcon size={22} aria-hidden="true" />
            </Button>
          </>
        ) : null}
      </div>
    </MotionConfig>,
    portalTarget,
  );
}
