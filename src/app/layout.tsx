import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Exchanger",
    template: "%s | Exchanger",
  },
  description:
    "Multi-currency wallet and peer-to-peer exchange for fiat and crypto.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Exchanger
            </Link>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 text-sm text-muted">
            Demo project. No real money is involved.
          </div>
        </footer>
      </body>
    </html>
  );
}
