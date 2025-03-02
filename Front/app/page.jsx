import { getTranslations } from "next-intl/server";
import Main from "./Main"



export async function generateMetadata() {
  const t = await getTranslations("Layout");

  return {
   title: t("acc")+" | Bricomaitre"
  };}

export default function Home() {
  return <Main />
}