import React, { useState } from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";

export default function SimpleSlider({ data }) {
  var settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
  };

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openLightbox = (index) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
    // Prevent body scroll when lightbox is open
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    // Re-enable body scroll
    document.body.style.overflow = '';
  };

  // Handle keyboard events
  React.useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen]);

  return (
    <>
      <Slider {...settings}>
        {data.map((item, index) => (
          <div
            key={`slide-${index}`}
            className="relative overflow-hidden"
          >
            <div className="md:hidden">
              <div className="relative">
                <Image
                  src={item}
                  alt={`Product image ${index + 1}`}
                  height={600}
                  width={600}
                  className="crsl w-full h-auto cursor-pointer"
                  onClick={() => openLightbox(index)}
                />
              </div>
            </div>

            <div className="hidden md:block">
              <Image
                key={`image-lg-${index}`}
                src={item}
                alt={`Product image ${index + 1}`}
                height={500}
                width={500}
                className=" crsl"
              />
            </div>
          </div>
        ))}
      </Slider>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white text-3xl z-10 w-10 h-10 flex items-center justify-center"
            onClick={closeLightbox}
            aria-label="Close lightbox"
          >
            ×
          </button>

          {/* Main image */}
          <div
            className="max-w-full max-h-full p-4 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={data[currentImageIndex]}
              alt={`Product image ${currentImageIndex + 1}`}
              height={800}
              width={800}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
