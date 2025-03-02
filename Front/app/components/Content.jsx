import React from 'react'
import logo from "../../public/logo.png"
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function Content() {

  return (
    <div className='  bg-gray-300 lg:text-lg py-8 px-6 pe-0 h-full w-full flex flex-col justify-between lg:justify-center mx-auto '>
        <Section1  />
        <Section2 />
    </div>
  )
}

const Section1 = () => {
    return (
        <div>
            <Nav />
        </div>
    )
}

const Section2 = () => {
    return (
        <div className='scale-75 md:scale-100 lg:mt-16 lg:pl-[20%]'>
            <Image src={logo} alt="logo" width={200} height={200}></Image>

        </div>
    )
}

const Nav = () => {
    const t = useTranslations("Layout");
    return (
        <div className='flex-col md:flex-row flex shrink-0 gap-8 overflow-x-auto mt-4  md:mt-12  lg: justify-between lg:px-96  '>
            <h2 className='md:hidden mb-2 text-lg text-center me-5 text-gray-400 uppercase'>Bricomaitre®</h2>
            <div className='flex flex-col gap-2 md:border-s-2  border-gray-400 md:px-4'>
                <h3 className='mb-2 text-lg uppercase text-teal-700'>{t("parc")}</h3>
                <Link  href={"/"} className='hover:text-teal-600'> • {t('acc')}</Link>
                <Link  href={"/products"} className='hover:text-teal-600'> • {t('prods')}</Link>
                <Link  href={"/"} className='hover:text-teal-600'> • {t('cart')}</Link>
                <Link  href={"/"} className='hover:text-teal-600'> • {t('con')}</Link>
            </div>
            <div className='flex flex-col gap-2  md:border-s-2 border-gray-400 md:px-4 '>
                <h3 className='mb-2 uppercase text-teal-700 text-lg'>{t('dispo')}</h3>
               <ul className='list-disc ms-5'>
                <li className='mb-1'>                <Link target='_blank' className='hover:text-teal-600 flex flex-row items-center ' href={"https://www.facebook.com/profile.php?id=61562272954715"}>Facebook<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4">
  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
</svg>
</Link></li>
                <li className='mb-1'>{t('tel')}:0778 81 03 60</li>
                <li className='text-sm mb-1 lg:text-base'>bricomaitre@gmail.com</li>
                <li className='mb-1'><Link className='hover:text-teal-600' href={"https://maps.app.goo.gl/MpAM58nHS2G5JBah8"}><div className='flex items-center text-wrap '><p className='text-wrap lg:text-sm text-xs'>BT N20, CITE 08 MAI 45, Bab Ezzouar 16024, Alger</p><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-4  text-center animate-pulse duration-1000 text-teal-600  ">
  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
</svg></div></Link></li>

               </ul>






            </div>
        </div>
    )
}