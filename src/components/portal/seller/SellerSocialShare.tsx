'use client'

import { useState } from "react"
import {
  Share2,
  Facebook,
  Twitter,
  Mail,
  Link2,
  Check,
  Loader2,
  Pin,
  ExternalLink,
  AlertCircle,
  MessageCircle,
  AtSign,
  Instagram,
} from "lucide-react"
import {
  listingPublicUrl,
  shareIntents,
  type ShareTarget,
} from "@/lib/sellers/social-share"

// ---------------------------------------------------------------------------
// SellerSocialShare — "post once, push out" for ONE listing.
//
// Two legs, both built on the listing's real title / image / public PDP
// URL:
//   * Share intents (every surface): Facebook sharer, X intent, Pinterest
//     create-button, copy-link, mailto — plain links that open the
//     network's own share flow. Instagram/TikTok have no web share-intent
//     endpoint, so sellers reach them with copy-link; no dead buttons.
//   * Pinterest API push (seller surfaces, listingId present): board
//     picker fed by GET /api/seller/social (the connected account's real
//     boards) + a push button posting to the same route. When the
//     platform Pinterest token is absent the leg says so plainly
//     ("not connected") — it never renders a fake success.
// ---------------------------------------------------------------------------

type Board = { id: string; name: string; pinCount: number | null }

type PushResult =
  | { kind: "published"; url: string; recorded: boolean; recordNote?: string }
  | { kind: "error"; message: string }

const INTENT_ICONS: Record<string, typeof Facebook> = {
  facebook: Facebook,
  x: Twitter,
  whatsapp: MessageCircle,
  threads: AtSign,
  email: Mail,
  pinterest: Pin,
}

export function ListingShareIntents({
  target,
  compact = false,
}: {
  target: ShareTarget
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [igCopied, setIgCopied] = useState(false)
  const intents = shareIntents(target)

  const copyForInstagram = async () => {
    try {
      // Instagram publishes no web share-intent endpoint; the honest
      // route is the attributed link on the clipboard to paste into a
      // post/story link sticker.
      await navigator.clipboard.writeText(
        // "instagram" is not a ShareNetwork intent (no web endpoint);
        // build the UTM params directly on the platform URL.
        (() => {
          const u = new URL(target.url)
          u.searchParams.set("utm_source", "instagram")
          u.searchParams.set("utm_medium", "social")
          u.searchParams.set("utm_campaign", "seller_share")
          if (target.sellerId) u.searchParams.set("utm_content", `seller_${target.sellerId}`)
          return u.toString()
        })(),
      )
      setIgCopied(true)
      setTimeout(() => setIgCopied(false), 2000)
    } catch {
      setIgCopied(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(target.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const cls = compact
    ? "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium hover:bg-muted"
    : "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"

  return (
    <div className="flex flex-wrap items-center gap-2">
      {intents.map((intent) => {
        const Icon = INTENT_ICONS[intent.network] || Share2
        return (
          <a
            key={intent.network}
            href={intent.href}
            target={intent.network === "email" ? undefined : "_blank"}
            rel="noopener noreferrer"
            className={cls}
          >
            <Icon className="h-3.5 w-3.5" />
            {intent.label.replace("Share on ", "").replace("Share by ", "")}
          </a>
        )
      })}
      <button type="button" onClick={copyLink} className={cls}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button type="button" onClick={copyForInstagram} className={cls}>
        {igCopied ? <Check className="h-3.5 w-3.5 text-green-700" /> : <Instagram className="h-3.5 w-3.5" />}
        {igCopied ? "Copied for Instagram" : "Copy for Instagram"}
      </button>
    </div>
  )
}

export function SellerSocialShare({
  listingId,
  title,
  slug,
  imageUrl,
  description,
  sellerId,
}: {
  listingId: string
  title: string
  slug: string | null
  imageUrl?: string | null
  description?: string | null
  sellerId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadingBoards, setLoadingBoards] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [pinState, setPinState] = useState<string | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [boardsError, setBoardsError] = useState<string | null>(null)
  const [boardId, setBoardId] = useState("")
  const [pushing, setPushing] = useState(false)
  const [result, setResult] = useState<PushResult | null>(null)

  const publicUrl = slug ? listingPublicUrl(slug) : null

  const loadBoards = () => {
    if (loaded) return
    setLoadingBoards(true)
    fetch("/api/seller/social", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          // A route error (auth, DB) is not "Pinterest not connected" —
          // show it as an error and leave the connection state unknown.
          setBoardsError(d.error)
          return
        }
        setConnected(Boolean(d.pinterest?.connected))
        setPinState(d.pinterest?.state ?? null)
        setBoards(Array.isArray(d.pinterest?.boards) ? d.pinterest.boards : [])
        // An expired/unreachable connection is a STATE, not a raw
        // upstream error string — the branches below render it in
        // plain language. Only unexpected errors surface as errors.
        if (d.pinterest?.error && !d.pinterest?.state) setBoardsError(d.pinterest.error)
        const first = d.pinterest?.boards?.[0]
        if (first) setBoardId(first.id)
      })
      .catch(() => setBoardsError("Could not load your Pinterest boards."))
      .finally(() => {
        setLoadingBoards(false)
        setLoaded(true)
      })
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) loadBoards()
  }

  const pushPin = async () => {
    if (!boardId) return
    setPushing(true)
    setResult(null)
    try {
      const r = await fetch("/api/seller/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, boardId }),
      })
      const d = await r.json()
      if (!r.ok || !d.published) {
        setResult({ kind: "error", message: d.error || "Pinterest rejected the pin." })
      } else {
        setResult({
          kind: "published",
          url: d.pin.url,
          recorded: Boolean(d.recorded),
          recordNote: d.recordNote,
        })
      }
    } catch {
      setResult({ kind: "error", message: "The push request failed — nothing was posted." })
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        aria-expanded={open}
      >
        <Share2 className="h-4 w-4" /> Promote
      </button>

      {open && (
        <div className="space-y-4 rounded-lg border bg-background p-4">
          {!publicUrl ? (
            <p className="flex items-start gap-2 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              This listing has no public URL yet, so there is nothing for social posts to link back to.
            </p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Share this listing
                </p>
                <ListingShareIntents
                  target={{ url: publicUrl, title, imageUrl, description, sellerId }}
                  compact
                />
              </div>

              <div className="border-t pt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Pin className="h-3.5 w-3.5" /> Push to Pinterest
                </p>
                {loadingBoards ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading boards…
                  </p>
                ) : pinState === "expired" || pinState === "unreachable" || connected === false ? (
                  // The control stays on the page in every state — a
                  // missing button reads as a broken page. When pins
                  // can't be pushed, the board picker and the Pinterest
                  // button render disabled and the line underneath says
                  // why, in plain copy.
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        disabled
                        aria-label="Pinterest board"
                        className="rounded-lg border bg-background px-3 py-2 text-sm opacity-60"
                      >
                        <option>
                          {pinState === "expired"
                            ? "No boards — connection expired"
                            : pinState === "unreachable"
                              ? "No boards — Pinterest unreachable"
                              : "No boards — Pinterest not connected"}
                        </option>
                      </select>
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#e60023] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        <Pin className="h-4 w-4" /> Pinterest
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {pinState === "expired"
                        ? "The platform's Pinterest connection has expired — an admin needs to reconnect it before pins can be pushed. The share buttons above still work — they open Pinterest's own pin flow."
                        : pinState === "unreachable"
                          ? "Pinterest couldn't be reached just now, so pins can't be pushed. The share buttons above still work — they open Pinterest's own pin flow."
                          : "Pinterest isn't connected for the platform yet, so pins can't be pushed from here. The share buttons above still work — they open Pinterest's own pin flow."}
                    </p>
                  </div>
                ) : boardsError ? (
                  <p className="flex items-start gap-2 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {boardsError}
                  </p>
                ) : boards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    The connected Pinterest account has no boards yet — create a board on
                    Pinterest first, then push this listing to it.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={boardId}
                      onChange={(e) => setBoardId(e.target.value)}
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                      aria-label="Pinterest board"
                    >
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                          {b.pinCount != null ? ` (${b.pinCount} pins)` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={pushPin}
                      disabled={pushing || !boardId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#e60023] px-4 py-2 text-sm font-medium text-white hover:bg-[#c8001e] disabled:opacity-50"
                    >
                      {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pin className="h-4 w-4" />}
                      {pushing ? "Pushing…" : "Push pin"}
                    </button>
                  </div>
                )}

                {result?.kind === "published" && (
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="flex items-center gap-2 text-green-800">
                      <Check className="h-4 w-4" /> Pin published.
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium underline"
                      >
                        View pin <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </p>
                    {!result.recorded && result.recordNote && (
                      <p className="text-amber-800">{result.recordNote}</p>
                    )}
                  </div>
                )}
                {result?.kind === "error" && (
                  <p className="mt-3 flex items-start gap-2 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {result.message}
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  More ways to promote this listing
                </p>
                <div className="flex flex-wrap gap-2 text-sm">
                  <a href="/seller/social#composer" className="rounded-lg border px-3 py-1.5 font-medium hover:bg-muted">
                    Compose a social post
                  </a>
                  <a href="/seller/promotions" className="rounded-lg border px-3 py-1.5 font-medium hover:bg-muted">
                    Promotions &amp; discounts
                  </a>
                  <a href="/seller/advertising/campaigns" className="rounded-lg border px-3 py-1.5 font-medium hover:bg-muted">
                    Advertising campaign
                  </a>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  The social composer and the campaign form both carry a listing picker —
                  pick this listing there and its link goes out with your attribution.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
