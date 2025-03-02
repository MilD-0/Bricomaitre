'use client'

import {  League_Spartan } from "next/font/google";
import "./globals.css";
import  SessionProvider  from "./components/SessionProvider";

const spartan = League_Spartan({ subsets: ["latin"] });


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">

      <body ><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
/* className={spartan.className}*/