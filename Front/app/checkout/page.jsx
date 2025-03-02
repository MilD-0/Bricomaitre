import Main from "./Main"
import { getTranslations } from "next-intl/server";


export async function generateMetadata() {
  const t = await getTranslations("Layout");

  return {
    title: t("cas")
  };}
export default function Home() {
  return <Main />
}