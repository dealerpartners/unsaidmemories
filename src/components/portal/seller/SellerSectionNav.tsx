'use client'

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { SELLER_NAV_CHILDREN } from "@/lib/sellers/nav"
import type { DawgNavSection } from "@/lib/types"
import { cn } from "@/lib/utils"

// On-page children navigation — the section's child pages live ON the
// page, in a bar under the shell bars, on every page of the section.
// The owner's law (the tree is the navigation): a parent page carries
// its child nodes where the reader can see them; the sidebar rail is
// not a substitute, and a child that exists only as a route is
// homeless. Sections without children render nothing. Active state
// follows the real URL — an exact path+query match wins (Social
// Push's views), otherwise the longest matching child path wins, so
// a detail page lights its parent child, not the section index.
function SectionNavInner({ section }: { section: DawgNavSection }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const children = SELLER_NAV_CHILDREN[section]
  if (!children || children.length === 0) return null

  const query = searchParams.toString()
  const current = query ? `${pathname}?${query}` : pathname
  const exact = children.find((c) => c.href === current)
  let activeHref = exact?.href ?? ""
  if (!activeHref) {
    let longest = -1
    for (const child of children) {
      const base = child.href.split(/[?#]/)[0]
      if (base && (pathname === base || pathname?.startsWith(base + "/")) && base.length > longest) {
        longest = base.length
        activeHref = child.href
      }
    }
  }

  return (
    <nav aria-label="Section pages" className="border-b border-border bg-background px-5">
      <ul className="custom-scrollbar flex items-center gap-1 overflow-x-auto py-2">
        {children.map((child) => {
          const active = child.href === activeHref
          return (
            <li key={child.href} className="shrink-0">
              <Link
                href={child.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {child.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SellerSectionNav({ section }: { section: DawgNavSection }) {
  return (
    <Suspense fallback={null}>
      <SectionNavInner section={section} />
    </Suspense>
  )
}
