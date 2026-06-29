import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "AgroManage",
  description: "Sistema de Gestão Agrícola",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon-32x32.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="light" data-bs-theme="light" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </head>
      <body suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var allowed = { light: true, dark: true, contrast: true };
                var theme = localStorage.getItem("theme");
                if (!allowed[theme]) {
                  var user = JSON.parse(localStorage.getItem("user") || "null");
                  theme = user && allowed[user.theme] ? user.theme : "light";
                }
                document.documentElement.dataset.theme = theme;
                document.documentElement.dataset.bsTheme = theme === "dark" ? "dark" : "light";
                document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
              } catch (e) {}
            })();
          `}
        </Script>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
