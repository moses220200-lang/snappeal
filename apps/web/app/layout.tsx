import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SnappealSplash } from "@/components/SnappealSplash";
import { InstallBanner } from "@/components/InstallBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://snappeal.ai",
  ),
  title: "Snappeal — Appeal a London parking ticket in under five taps",
  description:
    "Snappeal drafts your appeal from a photo of your PCN and submits it to your London council in five taps. £2.99 — one-off, non-refundable. You pay for the work, not the outcome.",
  applicationName: "Snappeal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Snappeal",
  },
  openGraph: {
    title: "Snappeal — Appeal a London parking ticket",
    description:
      "AI drafts and submits your PCN appeal in five taps. £2.99 one-off, non-refundable.",
    type: "website",
    siteName: "Snappeal",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "Snappeal — Appeal a London parking ticket",
    description:
      "AI drafts and submits your PCN appeal in five taps. £2.99 one-off, non-refundable.",
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
        <SnappealSplash />
        {children}
        <InstallBanner variant="landing" />
      </body>
    </html>
  );
}
