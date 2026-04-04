import {redirect} from "@/i18n/navigation";

export default async function ClesAChocsLandingRedirect({params}) {
  const { locale } = await params;
  redirect({href: "/products", locale});
}
