'use client'

import { LucideIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// SellerSectionShell — the section frame: ONE section title band, then the
// page. The section's child pages are navigation, and navigation has ONE
// home in this portal: the shell's SellerSectionNav bar (driven by the
// single SELLER_NAV_CHILDREN model), which renders above this frame on
// every seller page. This shell used to render a SECOND tab row of the
// section's children under its title — two stacked children bars (the
// shell bar + this one, its active pill in the portal's old teal) over
// the page's own header: the header collision the owner photographed.
// The duplicate row is gone; the children live in the one nav bar.
// ---------------------------------------------------------------------------

export function SellerSectionShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">{children}</div>
    </div>
  )
}

export function SellerLeafEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
