import type { Metadata } from "next"
import { Space_Grotesk, JetBrains_Mono, Press_Start_2P } from "next/font/google"

import { Toaster } from "@/components/ui/toaster"

import "./globals.css"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
})

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Spatial Brain",
  description:
    "A shared canvas where research becomes traceable, assignable work that agents can read.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrains.variable} ${pressStart.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
