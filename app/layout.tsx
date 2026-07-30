import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = "https://freeman.skillrivals.com";

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "Freeman Protocol",
    url: siteUrl,
    description:
      "A playable cyber-defense action RPG where you recruit an autonomous AI warband, deploy sentries, and survive the NULL siege.",
    image: `${siteUrl}/og-image.jpg`,
    genre: ["Action RPG", "Tower defense", "Cyberpunk"],
    applicationCategory: "GameApplication",
    operatingSystem: "Web Browser",
    playMode: "SinglePlayer",
    gamePlatform: "Web Browser",
    author: {
      "@type": "Person",
      name: "Ian Goh",
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: siteUrl,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Freeman Protocol",
    url: siteUrl,
    description:
      "Recruit AI agents, defend the Covenant Core, and contain the NULL siege.",
  },
  {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: "Freeman Protocol — Cinematic Trailer",
    description:
      "A cinematic trailer for Freeman Protocol, a cyber-defense action RPG about building an autonomous AI warband and surviving the NULL siege.",
    thumbnailUrl: `${siteUrl}/video/freeman-protocol-trailer-poster.jpg`,
    uploadDate: "2026-07-29T00:00:00+08:00",
    duration: "PT10S",
    contentUrl: `${siteUrl}/video/freeman-protocol-trailer.mp4`,
    inLanguage: "en",
    isFamilyFriendly: true,
    mainEntityOfPage: siteUrl,
  },
];

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Freeman Protocol | A Kairos Field Experiment",
  description:
    "Recruit AI agents, defend the Covenant Core, and contain the NULL siege in a playable cyberpunk action RPG.",
  keywords: [
    "Freeman Protocol",
    "cyberpunk game",
    "AI warband game",
    "browser RPG",
    "tower defense RPG",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Freeman Protocol | A Kairos Field Experiment",
    description:
      "Recruit an autonomous AI warband, deploy sentries, and survive the NULL siege.",
    type: "website",
    images: [
      {
      url: "/og-image.jpg",
      type: "image/jpeg",
      width: 1200,
      height: 630,
        alt: "Freeman Protocol defender facing a corrupted network warboss with an AI squad and sentry towers.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Freeman Protocol | A Kairos Field Experiment",
    description:
      "Recruit an autonomous AI warband, deploy sentries, and survive the NULL siege.",
    images: ["/og-image.jpg"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
