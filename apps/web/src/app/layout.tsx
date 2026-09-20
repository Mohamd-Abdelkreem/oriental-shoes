import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import type { ReactNode } from "react";

import { AppProviders } from "@/app/providers";
import "@/styles/globals.css";
import "@/styles/oriental.css";
import "@/styles/oriental-auth.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-cairo",
});

export const metadata: Metadata = {
  title: {
    default: "الحذاء الشرقي — نظام إدارة طلبات التصنيع",
    template: "%s | الحذاء الشرقي",
  },
  description: "واجهة إدارة طلبات تصنيع الحذاء الشرقي",
  icons: { icon: "/favicon.svg" },
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
