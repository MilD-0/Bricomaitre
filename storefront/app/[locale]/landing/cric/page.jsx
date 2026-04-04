import {redirect} from "@/i18n/navigation";

export default async function CricLandingRedirect({params}) {
  const { locale } = await params;
  redirect({href: "/products", locale});
}
