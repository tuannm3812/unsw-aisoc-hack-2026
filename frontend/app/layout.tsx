import type { Metadata } from "next"
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google"

import { Toaster } from "@/components/ui/toaster"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
})

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Spatial Brain",
  description:
    "A shared canvas where research becomes traceable, assignable work that agents can read.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${instrument.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
