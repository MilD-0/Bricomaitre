import Link from "next/link";
import Image from "next/image";
import logo from "../../public/logo.png";

export default function Logo() {
  return (
    <Link href={"/"} className=" flex gap-1 w-1/2">
      <Image
        className="  gap-1 scale-75 md:scale-100 -ms-4 -mt-1 md:m-0 flex "
        src={logo}
        alt="logo"
        width={100}
        height={70}
      ></Image>
    </Link>
  );
}
