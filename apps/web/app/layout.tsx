import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ParkingRabbitSplash } from "@/components/ParkingRabbitSplash";
import { InstallBanner } from "@/components/InstallBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://parkingrabbit.com",
  ),
  title: "ParkingRabbit — Pay or challenge London parking tickets in minutes",
  description:
    "ParkingRabbit helps you pay or challenge London parking tickets in one place. Upload your PCN, choose pay or appeal, and track the outcome. UK-focused, mobile-first.",
  applicationName: "ParkingRabbit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ParkingRabbit",
  },
  openGraph: {
    title: "ParkingRabbit — Pay or challenge a London parking ticket",
    description:
      "Upload your PCN, then pay or appeal in minutes. UK-focused. We help you handle it.",
    type: "website",
    siteName: "ParkingRabbit",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "ParkingRabbit — Pay or challenge a London parking ticket",
    description:
      "Upload your PCN, then pay or appeal in minutes. UK-focused. We help you handle it.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#007aff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-GB"
      className={`${inter.variable} antialiased`}
      // Browser extensions (Grammarly, GCR/screen-recorders, etc.) often
      // inject attributes onto <html> before React hydrates. Without this
      // flag React reports a hydration mismatch every time. The flag only
      // suppresses the warning at this exact level — it does NOT suppress
      // mismatches inside the page tree.
      suppressHydrationWarning
    >
      <body className="font-sans" suppressHydrationWarning>
        <ParkingRabbitSplash />
        {children}
        <InstallBanner variant="landing" />
      </body>
    </html>
  );
}
