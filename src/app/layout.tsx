import type { Metadata } from "next";
import "./globals.css";

const SITE_NAME = "Zafrul Islam | Full Stack Developer";
const SITE_DESCRIPTION = "Portfolio, blog, interview questions and AI assistant.";

export const metadata: Metadata = {
  metadataBase: new URL("https://zafrultechstack.com"),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}