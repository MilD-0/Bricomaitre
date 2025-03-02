import Main from "./Main"
import { getTranslations } from "next-intl/server";



export async function generateMetadata({params}) {
  const t = await getTranslations("common");
  const id=params.id
  const response = await fetch(`https://bricomaitre.com/api/products?id=${id}`);
  const product = await response.json();
  return {
    title: t("prodt", {name: product.title, namear: product.title_ar.length > 2 ? product.title_ar : product.title} ),
    description: t("prodd", {des: product?.description, desar: product?.description_ar.length > 2 ? product?.description_ar : product?.description} ),
    openGraph: {
      images: {
        url: product.images[0]
      },
    }
  };}
export default function Home({params}) {
  const id=params.id
  return <Main id={id}/>
}