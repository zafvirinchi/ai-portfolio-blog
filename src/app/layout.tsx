import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zafrul Islam | Full Stack Developer",
  description: "Portfolio, blog, interview questions and AI assistant.",
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