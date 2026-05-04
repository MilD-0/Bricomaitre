"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { getDisplayImages } from "@/lib/image-order";

export default function SimpleSlider({ data }) {
  const images = useMemo(() => getDisplayImages(data), [data]);
  const hasMultipleImages = images.length > 1;
  const lastTapRef = useRef(0);
  const lightboxPointerStateRef = useRef({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
  });
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    direction: "ltr",
    loop: false,
  });

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const goToImage = (index) => {
    if (!images.length) return;

    const nextIndex = Math.min(Math.max(index, 0), images.length - 1);
    setCurrentImageIndex(nextIndex);
    setIsZoomed(false);
    emblaApi?.scrollTo(nextIndex, true);
  };

  const showPreviousImage = () => {
    if (!hasMultipleImages) return;
    emblaApi?.scrollPrev();
  };

  const showNextImage = () => {
    if (!hasMultipleImages) return;
    emblaApi?.scrollNext();
  };

  const toggleZoom = () => {
    setIsZoomed((zoomed) => !zoomed);
  };

  const openLightbox = (index) => {
    goToImage(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setIsZoomed(false);
  };

  const handleImageTap = () => {
    const now = Date.now();

    if (now - lastTapRef.current < 300) {
      toggleZoom();
      lastTapRef.current = 0;
      return;
    }

    lastTapRef.current = now;
  };

  const handleLightboxPointerDown = (event) => {
    lightboxPointerStateRef.current = {
      dragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handleLightboxPointerMove = (event) => {
    const pointerState = lightboxPointerStateRef.current;
    if (pointerState.pointerId !== event.pointerId || pointerState.dragging) {
      return;
    }

    const deltaX = Math.abs(event.clientX - pointerState.startX);
    const deltaY = Math.abs(event.clientY - pointerState.startY);
    if (deltaX > 6 || deltaY > 6) {
      pointerState.dragging = true;
    }
  };

  const handleLightboxPointerUp = (event) => {
    const pointerState = lightboxPointerStateRef.current;
    if (pointerState.pointerId !== event.pointerId) {
      return;
    }

    if (!pointerState.dragging) {
      handleImageTap();
    }

    lightboxPointerStateRef.current = {
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
  };

  const handleLightboxPointerCancel = () => {
    lightboxPointerStateRef.current = {
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
  };

  useEffect(() => {
    if (!emblaApi) return;

    const syncSelectedImage = () => {
      setCurrentImageIndex(emblaApi.selectedScrollSnap());
    };

    syncSelectedImage();
    emblaApi.on("select", syncSelectedImage);
    emblaApi.on("reInit", syncSelectedImage);

    return () => {
      emblaApi.off("select", syncSelectedImage);
      emblaApi.off("reInit", syncSelectedImage);
    };
  }, [emblaApi]);

  useEffect(() => {
    setCurrentImageIndex(0);
    setIsZoomed(false);
    emblaApi?.reInit({ align: "start", direction: "ltr", loop: false });
    emblaApi?.scrollTo(0, true);
  }, [emblaApi, images]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeLightbox();
      }
      if (e.key === "ArrowLeft") {
        showPreviousImage();
      }
      if (e.key === "ArrowRight") {
        showNextImage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentImageIndex, hasMultipleImages, isZoomed, lightboxOpen]);

  if (!images.length) {
    return null;
  }

  return (
    <>
      <div dir="ltr" className="space-y-4">
        <div
          className="embla relative"
          style={{ "--slide-spacing": "0rem", "--slide-size": "100%" }}
        >
          <div className="embla__viewport overflow-hidden" ref={emblaRef}>
            <div className="embla__container">
              {images.map((item, index) => (
                <div
                  key={`slide-${item}`}
                  className="embla__slide !flex-[0_0_100%] min-w-0"
                >
                  <div className="relative overflow-hidden">
                    <div className="md:hidden">
                      <div className="sf-image-frame relative p-4">
                        <Image
                          src={item}
                          alt={`Product image ${index + 1}`}
                          height={600}
                          width={600}
                          className="crsl h-auto w-full cursor-pointer object-contain"
                          onClick={() => openLightbox(index)}
                          sizes="100vw"
                        />
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <div className="sf-image-frame p-6">
                        <Image
                          src={item}
                          alt={`Product image ${index + 1}`}
                          height={500}
                          width={500}
                          className="crsl h-auto w-full object-contain"
                          sizes="(max-width: 1024px) 100vw, 50vw"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasMultipleImages ? (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/80 text-lg text-slate-700 backdrop-blur transition hover:bg-white"
                onClick={showPreviousImage}
                aria-label="Show previous image"
              >
                <span aria-hidden="true">{"<"}</span>
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/80 text-lg text-slate-700 backdrop-blur transition hover:bg-white"
                onClick={showNextImage}
                aria-label="Show next image"
              >
                <span aria-hidden="true">{">"}</span>
              </button>
            </>
          ) : null}
        </div>

        {hasMultipleImages ? (
          <div className="flex justify-center gap-2 overflow-x-auto px-1">
            {images.map((image, index) => (
              <button
                type="button"
                key={`gallery-thumb-${image}`}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white transition ${
                  index === currentImageIndex ? "border-teal-600" : "border-slate-200 opacity-80"
                }`}
                onClick={() => goToImage(index)}
                aria-label={`Show product image ${index + 1}`}
                aria-current={index === currentImageIndex ? "true" : undefined}
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  className="object-contain p-1"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        ) : null}

        {hasMultipleImages ? (
          <div className="flex justify-center gap-1.5 md:hidden">
            {images.map((image, index) => (
              <button
                type="button"
                key={`gallery-dot-${image}`}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  index === currentImageIndex ? "bg-teal-600" : "bg-slate-300"
                }`}
                onClick={() => goToImage(index)}
                aria-label={`Show product image ${index + 1}`}
                aria-current={index === currentImageIndex ? "true" : undefined}
              />
            ))}
          </div>
        ) : null}
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 text-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Product image viewer"
        >
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
              {currentImageIndex + 1} / {images.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl leading-none transition-colors hover:bg-white/25"
                onClick={toggleZoom}
                aria-label={isZoomed ? "Show full image" : "Zoom image"}
                aria-pressed={isZoomed}
              >
                {isZoomed ? "-" : "+"}
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-3xl leading-none transition-colors hover:bg-white/25"
                onClick={closeLightbox}
                aria-label="Close lightbox"
              >
                x
              </button>
            </div>
          </div>

          {hasMultipleImages && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none transition-colors hover:bg-white/25"
                onClick={showPreviousImage}
                aria-label="Show previous image"
              >
                {"<"}
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none transition-colors hover:bg-white/25"
                onClick={showNextImage}
                aria-label="Show next image"
              >
                {">"}
              </button>
            </>
          )}

          <div
            className={`flex h-full w-full items-center justify-center px-3 pb-24 pt-20 ${
              isZoomed ? "overflow-auto" : "overflow-hidden"
            }`}
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            <div
              className={`flex min-h-full min-w-full items-center justify-center ${
                isZoomed ? "cursor-zoom-out" : "cursor-zoom-in"
              }`}
              onPointerDown={handleLightboxPointerDown}
              onPointerMove={handleLightboxPointerMove}
              onPointerUp={handleLightboxPointerUp}
              onPointerCancel={handleLightboxPointerCancel}
              role="button"
              tabIndex={0}
              aria-label={isZoomed ? "Show full image" : "Zoom image"}
              aria-pressed={isZoomed}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleImageTap();
                }
              }}
            >
              <Image
                src={images[currentImageIndex]}
                alt={`Product image ${currentImageIndex + 1}`}
                height={1000}
                width={1000}
                className={`object-contain transition-transform duration-200 ${
                  isZoomed
                    ? "max-h-none max-w-none scale-150"
                    : "max-h-[82vh] max-w-[92vw]"
                }`}
                sizes="92vw"
                priority
              />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {hasMultipleImages ? (
              <div className="mx-auto flex max-w-full justify-center gap-2 overflow-x-auto">
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={`lightbox-thumb-${image}`}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition ${
                      index === currentImageIndex
                        ? "border-white"
                        : "border-white/25 opacity-70"
                    }`}
                    onClick={() => goToImage(index)}
                    aria-label={`Show product image ${index + 1}`}
                    aria-current={index === currentImageIndex ? "true" : undefined}
                  >
                    <Image
                      src={image}
                      alt=""
                      fill
                      className="object-contain p-1"
                      sizes="56px"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mx-auto h-1.5 w-10 rounded-full bg-white/40" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
