import type { Metadata, Viewport } from "next";
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
  title: "Freeman Protocol | A Kairos Field Experiment",
  description:
    "Recruit AI agents, defend the Covenant Core, and contain the NULL siege in a playable cyberpunk action RPG.",
  openGraph: {
    title: "Freeman Protocol | A Kairos Field Experiment",
    description:
      "Recruit an autonomous AI warband, deploy sentries, and survive the NULL siege.",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1731,
        height: 909,
        alt: "Freeman Protocol defender facing a corrupted network warboss with an AI squad and sentry towers.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Freeman Protocol | A Kairos Field Experiment",
    description:
      "Recruit an autonomous AI warband, deploy sentries, and survive the NULL siege.",
    images: ["/og-image.png"],
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#071014",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
