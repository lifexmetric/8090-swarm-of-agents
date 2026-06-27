import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Atlas — Codebase Visualizer",
  description:
    "Paste a GitHub repo URL. Explore the full system as a navigable 3D graph with agent-ready context for every connection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Prevent light/dark flash — must run before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('atlas-theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col text-[15px]">{children}</body>
    </html>
  );
}
