import { useSearchParams } from "next/navigation";

import { Link, useRouter } from "@/i18n/navigation";

export default function Pagination ({ totalPages, page, limit,brnd,srt,ctg, childCategory }) {

  const searchParams = useSearchParams();
  const stk = searchParams.get("instock");
  const searchQuery = searchParams.get("search") || "";
  const prevPageNumber = Number(page) - 1;
  const nextPageNumber = Number(page) + 1;
    const router = useRouter()
const pageClass= " w-10 border-y border-gray-400 ring-1.5 pt-1.5 aspect-square text-center align-middle"
    const nextPage = () => {

        if (nextPageNumber <= totalPages) {


          router.push(`/products?page=${nextPageNumber}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}`);
        }
      };
  const prevPage = () => {

    if (prevPageNumber > 0) {

      router.push(`/products?page=${prevPageNumber}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}`);
    }
  };
    return (
        <div dir="ltr" className="w-full flex justify-center mt-5 lg:px-12">


<div className="mt-1 text-lg  bg-white flex flex-row rounded">                 {page > 1 && <button className={pageClass + " bg-teal-600 rounded-s-xl ps-2 pb-1  text-white "} onClick={prevPage}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>

</button>  }
{Number(page)>2 &&<Link href={`/products?page=${1}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass + " border-s"}>1</Link>}

{Number(page)>3 &&<select value="" onChange={(ev) => {router.push(`/products?page=${ev.target.value}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}`)} }   className={pageClass + " outline-0 appearance-none border-s bg-white  lg:block hidden "}>
  <option  value="">...</option>
  {Array.from({ length: totalPages }, (_, i) => (
    <option key={i + 1} value={i + 1}>
      {i + 1}
    </option>
  ))}</select>}

{page > 4 && <Link  href={`/products?page=${Number(page)-2}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass + " border-s hidden lg:block"}>{Number(page)-2}</Link>}

{page-1 > 0 && (<Link  href={`/products?page=${Number(page)-1}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass+ "  border-s "}> {page-1}</Link>)}

<div   className={pageClass + " bg-blue-500 text-white border-0  " + ( page ==1 && " rounded-s-xl " )
   + ( page == totalPages && " rounded-e-xl " ) }>{page}</div >

 {Number(page)+1 <totalPages && <Link  href={`/products?page=${nextPageNumber}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass + " border-s "}>{Number(page)+1}</Link>}

 {page < totalPages-2 && <Link  href={`/products?page=${Number(page)+2}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass + " border-s hidden lg:block"}>{Number(page)+2}</Link>}

{Number(page)+2 < totalPages &&<select value="" onChange={(ev) => {router.push(`/products?page=${ev.target.value}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}`)} }   className={pageClass + " outline-0 appearance-none border-s bg-white "}>
  <option  value="">...</option>
  {Array.from({ length: totalPages }, (_, i) => (
    <option key={i + 1} value={i + 1}>
      {i + 1}
    </option>
  ))}</select>

   }

 {page < totalPages &&<Link  href={`/products?page=${totalPages}&limit=${limit}${searchQuery ? `&search=${searchQuery}` : ""}${brnd ? `&brand=${brnd}` : ""}${ctg ? `&category=${ctg}` : ""}${`&childCategory=${childCategory}`}${srt ? `&sortby=${srt}` : ""}${stk==="true" ? `&instock=${stk}` : ""}` } className={pageClass + "  border-s" }>{totalPages}</Link>}

          {page < totalPages &&    <button className={pageClass + " bg-teal-600 rounded-e-xl ps-2 pb-1  text-white "} onClick={nextPage}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="size-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>

        </button>}   </div>



            </div>
    )
}
