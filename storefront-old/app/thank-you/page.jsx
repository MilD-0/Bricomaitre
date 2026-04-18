import Thank from "./Thank"
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
  const t = await getTranslations("Layout");

  return {
    title: t("mrc")
  };}
export default function Home() {
  return <Thank />
}