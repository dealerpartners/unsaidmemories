"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Send, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { addToCart, fetchCart, fetchCurrentCustomerId } from "@/lib/commerce/cart-client";
import type { AssistantProduct } from "@/lib/assistant/catalog-search";

/**
 * Shoppy — the store's shopping assistant, a right-side drawer
 * launched from the header (and from the Ask Shoppy entry points
 * where "contact support" used to route away).
 *
 * Every product it shows comes from /api/assistant, which grounds
 * its answers in the live catalog (see the route's grounding
 * contract). The buy flow lives here too: Add to Bag writes to the
 * real cart through the shared cart client, Shoppy confirms in the
 * conversation with the running bag total, and checkout is gated
 * the way the store gates it — a guest is asked to sign in first
 * (their bag stays put), a signed-in shopper goes straight to the
 * real checkout. Shoppy never handles payment details.
 */

interface Msg {
  role: "user" | "assistant";
  text: string;
  products?: AssistantProduct[];
  /** Renders the bag action row (View bag / Checkout) under the text. */
  bag?: boolean;
  /** Renders the sign-in call to action under the text. */
  auth?: boolean;
}

const GREETING: Msg = {
  role: "assistant",
  text: "Hi, I'm Shoppy. Tell me who you're shopping for and what's going on in their life — a new baby, a hard loss, a big thank-you — and I'll find pieces that fit the moment, tell you what each one is, and add the one you love straight to your bag.",
};

const SUGGESTIONS = [
  "A gift for my sister who lost her husband, under $60",
  "Something for a new baby, under $40",
  "A thank-you gift for a teacher",
  "A mug for my dad",
];

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function ProductCard({ p, onAdded }: { p: AssistantProduct; onAdded: (p: AssistantProduct) => void }) {
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [failed, setFailed] = useState(false);

  async function add() {
    setBusy(true);
    setFailed(false);
    try {
      const customerId = await fetchCurrentCustomerId();
      await addToCart({ customerId, supplier_catalog_variant_id: p.variantId, quantity: 1 });
      useStore.setState((s) => ({ cartCount: s.cartCount + 1 }));
      setAdded(true);
      onAdded(p);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant-card">
      <Link href={`/product/${p.slug}`} className="assistant-card-media">
        {p.image ? (
          <img src={p.image} alt={p.name} loading="lazy" />
        ) : (
          <span className="assistant-card-noimg" aria-hidden="true" />
        )}
      </Link>
      <div className="assistant-card-body">
        <span className="assistant-card-brand">{p.brand || "UnSaid"}</span>
        <Link href={`/product/${p.slug}`} className="assistant-card-name">
          {p.name}
        </Link>
        <span className="assistant-card-meta">
          {money(p.price)}
          {p.variantLabel ? ` · ${p.variantLabel}` : ""}
        </span>
        {p.description ? <span className="assistant-card-desc">{p.description}</span> : null}
        {added ? (
          <span className="assistant-card-added">
            <Check size={14} /> In your bag
          </span>
        ) : (
          <button className="assistant-card-add" onClick={add} disabled={busy}>
            {busy ? "Adding…" : failed ? "Try again" : "Add to bag"}
          </button>
        )}
      </div>
    </div>
  );
}

export function AssistantPanel() {
  const open = useStore((s) => s.assistantOpen);
  const setOpen = useStore((s) => s.setAssistantOpen);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [bag, setBag] = useState<{ count: number; subtotal: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  if (!open) return null;

  /** Re-read the real bag and mirror it into the conversation state. */
  async function refreshBag(): Promise<{ count: number; subtotal: number } | null> {
    try {
      const customerId = await fetchCurrentCustomerId();
      const { items } = await fetchCart(customerId);
      const count = items.reduce((n, i) => n + (i.quantity || 0), 0);
      const subtotal = items.reduce((n, i) => n + (i.quantity || 0) * Number(i.unit_price ?? 0), 0);
      const next = { count, subtotal };
      setBag(next);
      return next;
    } catch {
      return null;
    }
  }

  /** Shoppy confirms an add in the conversation, with the live bag state. */
  async function confirmAdded(p: AssistantProduct) {
    const b = await refreshBag();
    const tail = b && b.count > 0
      ? ` Your bag now has ${b.count} ${b.count === 1 ? "item" : "items"} · ${money(b.subtotal)}.`
      : "";
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: `Added — the ${p.name}${p.variantLabel ? ` (${p.variantLabel})` : ""} is in your bag.${tail}`,
        bag: true,
      },
    ]);
  }

  /** Execute an add the model requested ("I want to buy this"). The
   *  product object comes from this panel's own state — the catalog
   *  rows the shopper is looking at — never from the model. */
  async function executeAdd(productId: string, fresh: AssistantProduct[]) {
    const shown = [...fresh, ...messages.flatMap((m) => m.products ?? [])];
    const p = shown.find((x) => x.id === productId);
    if (!p) return;
    try {
      const customerId = await fetchCurrentCustomerId();
      await addToCart({ customerId, supplier_catalog_variant_id: p.variantId, quantity: 1 });
      useStore.setState((s) => ({ cartCount: s.cartCount + 1 }));
      await confirmAdded(p);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "I couldn't add that just now — tap Add to bag on its card and I'll pick it up from there." },
      ]);
    }
  }

  /** Checkout is the store's own gate: guests sign in first (the bag
   *  stays exactly where it is), signed-in shoppers go straight to
   *  the real checkout page. */
  async function startCheckout() {
    let signedIn = false;
    try {
      const r = await fetch("/api/customers/me", { cache: "no-store" });
      signedIn = r.ok;
    } catch {
      signedIn = false;
    }
    if (!signedIn) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "You're not signed in — I need you to sign in before we check out, so your order, tracking and receipts land safely in your account. Your bag stays right here while you do.",
          auth: true,
        },
      ]);
      return;
    }
    setOpen(false);
    window.location.assign("/checkout");
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    const history = messages
      .filter((m) => m !== GREETING)
      .map((m) => ({ role: m.role, content: m.text }));
    const shownIds = [...new Set(messages.flatMap((m) => (m.products ?? []).map((p) => p.id)))].slice(0, 24);
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, shownIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "assistant failed");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: String(data.reply || ""), products: data.products || [] },
      ]);
      if (data?.action?.type === "add_to_bag" && typeof data.action.productId === "string") {
        await executeAdd(data.action.productId, (data.products as AssistantProduct[]) || []);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I had trouble reaching the shop just now. Give it another try in a moment — or browse the shop, and something may catch your eye.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="assistant-backdrop" onClick={() => setOpen(false)}>
      <aside
        className="assistant-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Shoppy, the shopping assistant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="assistant-head">
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <img src="/favicon-512x512.png" alt="" width={44} height={44} style={{ borderRadius: 12, display: "block" }} />
            <div>
              <h2 style={{ margin: 0 }}>
                Shoppy
              </h2>
              <span className="eyebrow">Say it, <em>we&rsquo;ll find it.</em></span>
            </div>
          </div>
          <button className="icon-btn" aria-label="Close Shoppy" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="assistant-scroll" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`assistant-msg assistant-msg-${m.role}`}>
              <p>{m.text}</p>
              {m.products && m.products.length > 0 && (
                <div className="assistant-cards">
                  {m.products.map((p) => (
                    <ProductCard key={p.id} p={p} onAdded={confirmAdded} />
                  ))}
                </div>
              )}
              {m.bag && (
                <div className="assistant-actions">
                  <Link href="/bag" className="assistant-action" onClick={() => setOpen(false)}>
                    View bag
                  </Link>
                  <button type="button" className="assistant-action assistant-action-primary" onClick={startCheckout}>
                    Checkout <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {m.auth && (
                <div className="assistant-actions">
                  <Link
                    href="/login?next=/checkout"
                    className="assistant-action assistant-action-primary"
                    onClick={() => setOpen(false)}
                  >
                    Sign in to check out <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="assistant-msg assistant-msg-assistant">
              <p className="assistant-thinking">
                <Sparkles size={14} /> Looking through the shop…
              </p>
            </div>
          )}
          {messages.length === 1 && !sending && (
            <div className="assistant-suggestions">
              <span>TRY ONE OF THESE</span>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s} <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}
        </div>

        {bag && bag.count > 0 && (
          <div className="assistant-checkout-bar">
            <span>
              {bag.count} {bag.count === 1 ? "item" : "items"} in your bag · {money(bag.subtotal)}
            </span>
            <button type="button" className="assistant-checkout-link" onClick={startCheckout}>
              Go to checkout <ArrowRight size={14} />
            </button>
          </div>
        )}

        <form
          className="assistant-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Who are you shopping for?"
            aria-label="Describe who you are shopping for"
          />
          <button type="submit" disabled={sending || !input.trim()} aria-label="Send">
            <Send size={17} />
          </button>
        </form>
      </aside>
    </div>
  );
}
