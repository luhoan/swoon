import type { Metadata } from "next";
import { Fraunces, Pinyon_Script, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
});

const pinyon = Pinyon_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pinyon",
});

const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Swoon — Live Video Speed Dating",
    template: "%s · Swoon",
  },
  description:
    "Skip the swipe. Meet real people on live three-minute video dates — because attraction isn't a profile, it's a conversation.",
  icons: { icon: "/brand/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${pinyon.variable} ${grotesk.variable} min-h-dvh antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
