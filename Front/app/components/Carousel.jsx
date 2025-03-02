import React from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";

export default function SimpleSlider({ data }) {
  var settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
  };
  return (
    <Slider {...settings}>
      {data.map((item) => (
        <div key={item.id}>
          <div>
            <div className="md:hidden">
              <Zoom>
                <Image
                  key={`image-${item.id}`} // add a unique key to each image
                  src={item}
                  alt={"img"}
                  height={500}
                  width={500}
                  className="crsl"
                />
              </Zoom>
            </div>
            <div className="hidden md:block">
              <Image
                key={`image-${item.id}`} // add a unique key to each image
                src={item}
                alt={"img"}
                height={500}
                width={500}
                className=" crsl"
              />
            </div>
          </div>
        </div>
      ))}
    </Slider>
  );
}
