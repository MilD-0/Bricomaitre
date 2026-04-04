import Image from "next/image";
import { Link } from "@/i18n/navigation";
import logo from "../../public/logo.png"

export default function Logo () {
    return (
        <Link href={'/'} className="inline-flex items-center">
<Image
  className="block h-auto w-[98px] md:w-[128px]"
  src={logo}
  alt="logo"
  width={logo.width}
  height={logo.height}
  sizes="(max-width: 768px) 98px, 128px"
></Image>
        </Link>

    );
}
