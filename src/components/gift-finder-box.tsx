"use client";

import { useState } from "react";
import { CatalogCard } from "@/components/catalog-card";
import { MATERIALS, OCCASIONS, PRICE_BANDS, RECIPIENTS } from "@/lib/gift-finder-options";
import type { GiftProduct } from "@/lib/gift-finder";

/**
 * GiftFinderBox — the gift finder on /shop, rebuilt real (the seeded
 * demo box is gone). Every facet is backed by live catalogue data —
 * see src/lib/gift-finder.ts for what backs each one and why there is
 * no "ships in" facet (no supplier lead-time data exists).
 *
 * FULFILMENT options are the connected print suppliers.
 */
const SUPPLIERS = [
  { value: "printful", label: "Printful" },
  { value: "gelato", label: "Gelato" },
  { value: "prodigi", label: "Prodigi" },
  { value: "gooten", label: "Gooten" },
  { value: "teemill", label: "Teemill" },
  { value: "spreadconnect", label: "SpreadConnect" },
];

interface FinderState {
  products: GiftProduct[];
  total: number;
  capped: boolean;
}

export function GiftFinderBox({ catalogTotal }: { catalogTotal: number }) {
  const [recipient, setRecipient] = useState("");
  const [occasion, setOccasion] = useState("");
  const [personalization, setPersonalization] = useState("");
  const [memoryLink, setMemoryLink] = useState("");
  const [material, setMaterial] = useState("");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyMore, setBusyMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FinderState | null>(null);

  function buildParams() {
    const params = new URLSearchParams();
    if (recipient) params.set("recipient", recipient);
    if (occasion) params.set("occasion", occasion);
    if (personalization) params.set("personalization", personalization);
    if (memoryLink) params.set("memoryLink", "1");
    if (material) params.set("material", material);
    if (price) params.set("price", price);
    if (supplier) params.set("supplier", supplier);
    return params;
  }

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/gift-finder?${buildParams().toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The finder couldn't search just now. Please try again.");
      } else {
        setResult(data as FinderState);
      }
    } catch {
      setError("The finder couldn't search just now. Please try again.");
    }
    setBusy(false);
  }

  async function loadMore() {
    if (!result || busyMore) return;
    setBusyMore(true);
    setError(null);
    try {
      const params = buildParams();
      params.set("offset", String(result.products.length));
      const res = await fetch(`/api/gift-finder?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The finder couldn't search just now. Please try again.");
      } else {
        const page = data as FinderState;
        setResult((cur) =>
          cur ? { ...page, products: [...cur.products, ...page.products] } : page,
        );
      }
    } catch {
      setError("The finder couldn't search just now. Please try again.");
    }
    setBusyMore(false);
  }

  function reset() {
    setRecipient("");
    setOccasion("");
    setPersonalization("");
    setMemoryLink("");
    setMaterial("");
    setPrice("");
    setSupplier("");
    setResult(null);
    setError(null);
  }

  return (
    <section className="finder" aria-label="Gift finder">
      <div className="finder-head">
        <h2>Gift finder</h2>
        <span className="finder-count">
          Filter across the whole store · {catalogTotal.toLocaleString()} products in the live
          catalogue
        </span>
      </div>
      <form onSubmit={apply}>
        <div className="finder-grid">
          <div className="finder-intro">
            <div className="eyebrow">Find your next keepsake</div>
            <h3>Built for “I don’t know where to start.”</h3>
            <p>
              Start with the person or the moment. Add material or price only if they narrow
              things in a useful way — every result is a real product you can open, personalise
              and order today.
            </p>
          </div>
          <div className="finder-fields">
            <label>
              Recipient
              <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option value="">Anyone</option>
                {RECIPIENTS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Occasion
              <select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                <option value="">Any moment</option>
                {OCCASIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Personalization
              <select value={personalization} onChange={(e) => setPersonalization(e.target.value)}>
                <option value="">Either way</option>
                <option value="custom">Make it their own (studio designs)</option>
                <option value="ready">Ready-made</option>
              </select>
            </label>
            <label>
              Memory Link
              <select value={memoryLink} onChange={(e) => setMemoryLink(e.target.value)}>
                <option value="">Not required</option>
                <option value="1">Memory Link &amp; memory boxes</option>
              </select>
            </label>
            <label>
              Material
              <select value={material} onChange={(e) => setMaterial(e.target.value)}>
                <option value="">Any material</option>
                {MATERIALS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Price range
              <select value={price} onChange={(e) => setPrice(e.target.value)}>
                <option value="">Any price</option>
                {PRICE_BANDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fulfilment
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">Any maker</option>
                {SUPPLIERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="finder-actions">
          <button className="finder-apply" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Apply filters"} <span aria-hidden="true">↗</span>
          </button>
          <button className="finder-reset" type="button" onClick={reset}>
            Reset
          </button>
        </div>
        {error && <p className="brand-form-error" style={{ marginTop: 14 }}>{error}</p>}
        <p className="finder-foot">
          Every result opens its real product page. Prices shown are each product’s starting
          price; made-to-order timing is confirmed per product at checkout, so we don’t guess
          at it here.
        </p>
      </form>

      {result && (
        <div className="finder-results">
          <div className="finder-results-head">
            <h3>
              {result.total === 0
                ? "Nothing matched that combination"
                : `${result.total} ${result.total === 1 ? "keepsake" : "keepsakes"} found`}
            </h3>
            <span>
              {result.capped
                ? "Searched the first matches across the catalogue — narrow the filters to see more specific results."
                : "Live from the catalogue."}
            </span>
          </div>
          {result.total === 0 ? (
            <p className="finder-foot">
              Try loosening one filter — a different material or a wider price range usually
              opens things up.
            </p>
          ) : (
            <div className="product-grid">
              {result.products.map((p, i) => (
                <CatalogCard key={p.id} p={p} index={i} />
              ))}
            </div>
          )}
          {result.total > 0 && result.products.length < result.total && (
            <div className="finder-actions" style={{ justifyContent: "center", marginTop: 24 }}>
              <button className="finder-apply" type="button" onClick={loadMore} disabled={busyMore}>
                {busyMore
                  ? "Loading…"
                  : `Show more keepsakes (${result.products.length} of ${result.total})`}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
