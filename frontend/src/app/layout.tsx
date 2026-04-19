import type { Metadata } from "next";
import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css";

export const metadata: Metadata = {
  title: "AgroManage",
  description: "Plataforma de gestão agropecuária",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-bs-theme="light">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}