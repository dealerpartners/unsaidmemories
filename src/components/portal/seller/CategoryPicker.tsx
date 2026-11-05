"use client"

// ---------------------------------------------------------------------------
// CategoryPicker — the seller files a product under the shop's real
// taxonomy (taxonomy_nodes, served by /api/seller/categories). Cascading
// selects walk animal -> department -> category -> subcategory; the value
// is the deepest node chosen, which is the node whose shop category page
// the product will appear on (department and animal pages roll subtrees
// up server-side). No free text, no second category list.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react"

type TaxNode = {
  id: string
  parentId: string | null
  name: string
  slug: string
  depth: number
  nodeType: string
}

const LEVEL_LABELS = ["Animal", "Department", "Category", "Subcategory", "Group"]

export default function CategoryPicker({
  value,
  onChange,
}: {
  /** Currently selected node id (deepest chosen), or null. */
  value: string | null
  onChange: (nodeId: string | null, pathNames: string[]) => void
}) {
  const [nodes, setNodes] = useState<TaxNode[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chain, setChain] = useState<string[]>([])

  useEffect(() => {
    let live = true
    fetch("/api/seller/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!live) return
        setNodes(Array.isArray(d?.categories) ? d.categories : [])
      })
      .catch(() => {
        if (live) setLoadError("Categories could not be loaded. Reload the page to try again.")
      })
    return () => {
      live = false
    }
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, TaxNode>()
    for (const n of nodes || []) m.set(n.id, n)
    return m
  }, [nodes])

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, TaxNode[]>()
    for (const n of nodes || []) {
      const key = n.parentId
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(n)
    }
    return m
  }, [nodes])

  // Seed the cascade from an existing value (edit form) once nodes land.
  useEffect(() => {
    if (!value || !nodes || chain.length > 0) return
    const path: string[] = []
    let cur: TaxNode | undefined = byId.get(value)
    while (cur) {
      path.unshift(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    if (path.length > 0) setChain(path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, nodes])

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>
  }
  if (!nodes) {
    return <p className="text-sm text-neutral-500">Loading categories…</p>
  }
  if (nodes.length === 0) {
    return (
      <p className="text-sm text-red-600">
        No categories are published yet, so this product cannot be filed in
        the shop. Ask an admin to publish the taxonomy first.
      </p>
    )
  }

  const levels: { parentKey: string | null; options: TaxNode[] }[] = []
  let parentKey: string | null = null
  for (let i = 0; i <= chain.length; i++) {
    const options = childrenOf.get(parentKey) || []
    if (options.length === 0) break
    levels.push({ parentKey, options })
    const chosen = chain[i]
    if (!chosen) break
    parentKey = chosen
  }

  const pick = (level: number, id: string) => {
    const next = [...chain.slice(0, level), ...(id ? [id] : [])]
    setChain(next)
    const deepest = next.length > 0 ? next[next.length - 1] : null
    onChange(
      deepest,
      next.map((nid) => byId.get(nid)?.name || "").filter(Boolean),
    )
  }

  const chosenNames = chain
    .map((nid) => byId.get(nid)?.name)
    .filter(Boolean) as string[]

  return (
    <div className="space-y-2">
      {levels.map((lvl, i) => (
        <select
          key={i}
          aria-label={LEVEL_LABELS[i] || `Level ${i + 1}`}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          value={chain[i] || ""}
          onChange={(e) => pick(i, e.target.value)}
        >
          <option value="">
            {i === 0 ? "Choose an animal…" : `Choose a ${LEVEL_LABELS[i]?.toLowerCase() || "category"}…`}
          </option>
          {lvl.options.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      ))}
      {chosenNames.length > 0 && (
        <p className="text-xs text-neutral-500">
          Files under: {chosenNames.join(" › ")} — the product appears on
          this shop category page.
        </p>
      )}
    </div>
  )
}
