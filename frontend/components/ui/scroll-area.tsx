"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Fallback ScrollArea using native scrolling
// If @radix-ui/react-scroll-area is not installed, this provides basic functionality
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative overflow-auto", className)}
    {...props}
  >
    {children}
  </div>
))
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { orientation?: "vertical" | "horizontal" }
>(({ className, orientation = "vertical", ...props }, ref) => {
  // ScrollBar is a no-op in the fallback version
  // Native scrollbars are handled by the browser
  return null
})
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
