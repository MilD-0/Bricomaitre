import React from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import Image from "next/image";

export default function SimpleSlider({data}) {
  var settings = {
    dots: true,
    infinite: false,
    speed: 500,
    slidesToShow: 8,
    slidesToScroll: 1,


  };
  return (
    <Slider {...settings} >

 {data.map((item) => (

        <div key={item._id}>
        <Image
          key={`image-${item.id}`} // add a unique key to each image
          src={item.images[0]}
          alt={'img'}
          height={500}
          width={500}
          className="crsl"
        />
      </div>

      ))}

    </Slider>
  );
}