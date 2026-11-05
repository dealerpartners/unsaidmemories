"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Share2 } from "lucide-react";
import { OrderCard, Thumb, fmtDay, isDelivered } from "./order-card";
import { PaymentMethodsCard } from "./payment-methods-card";
import { AdvertisingCard } from "./advertising-card";
import { CustomerSupport } from "@/components/site/customer-support";
import { ContactForm } from "@/components/contact-form";
import { faqEntries } from "@/lib/faq";

// The account center sections, converted from Sunny's mockup
// (UnSaid_customer_account__mockup___1.html) onto the real customer
// APIs: Overview / Orders / Saved / My posts / Notifications /
// Preferences / Help and care. Every control here calls a real
// endpoint; anything the platform cannot do yet is left out and
// reported, never faked.

function useToast(): [string | null, (m: string) => void] {
  const [toast, setToast] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  }, []);
  return [toast, show];
}

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="ua-toast" role="status">
      {msg}
    </div>
  );
}

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------------------------------------------------------------- Overview

export function OverviewSection() {
  const [toast, showToast] = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [me, ord, wl, ps, nt] = await Promise.allSettled([
      jfetch("/api/customers/me"),
      jfetch("/api/customers/me/orders"),
      jfetch("/api/customers/me/wishlist"),
      jfetch("/api/customers/me/posts"),
      jfetch("/api/customers/me/notifications"),
    ]);
    if (me.status === "fulfilled") setProfile(me.value);
    if (ord.status === "fulfilled") setOrders(ord.value.orders ?? []);
    if (wl.status === "fulfilled") setSavedCount((wl.value.items ?? []).length);
    if (ps.status === "fulfilled") setPostCount((ps.value.posts ?? []).length);
    if (nt.status === "fulfilled") setUnread(Number(nt.value.unread) || 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="ua-mut">Loading your account…</p>;

  const tiles = [
    {
      href: "/account/orders",
      label: "Orders",
      note: orders.length
        ? `${orders.length} order${orders.length === 1 ? "" : "s"}`
        : "No orders yet",
    },
    {
      href: "/account/saved",
      label: "Saved",
      note: savedCount ? `${savedCount} saved` : "Nothing saved yet",
    },
    {
      href: "/account/posts",
      label: "Reviews & questions",
      note: postCount ? `${postCount} posted` : "Nothing posted yet",
    },
    {
      href: "/account/notifications",
      label: "Notifications",
      note: unread ? `${unread} unread` : "All caught up",
    },
  ];

  return (
    <>
      <section className="ua-blk">
        <h2 className="ua-h2">
          {profile?.name ? `Hello, ${profile.name}.` : "Your latest order"}
        </h2>
        <p className="ua-sub">
          Orders are made to order, so each one shows where it is.
        </p>
        {orders.length ? (
          <OrderCard order={orders[0]} onToast={showToast} />
        ) : (
          <p className="ua-mut">
            No orders yet. <Link href="/shop">Browse the shop</Link>.
          </p>
        )}
        <p className="ua-sub" style={{ marginTop: 12 }}>
          Ordered as a guest? <Link href="/track-order">Find it with your email</Link>.
        </p>
      </section>

      <section className="ua-blk">
        <div className="ua-tiles">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="ua-tile">
              <span className="ua-tile-label">{t.label}</span>
              <span className="ua-tile-note">{t.note}</span>
            </Link>
          ))}
        </div>
      </section>
      <Toast msg={toast} />
    </>
  );
}

// ------------------------------------------------------------------ Orders

export function OrdersSection() {
  const [toast, showToast] = useToast();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<"all" | "progress" | "done">("all");

  useEffect(() => {
    jfetch("/api/customers/me/orders")
      .then((j) => setOrders(j.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  const shown = (orders ?? []).filter((o) =>
    filter === "all" ? true : filter === "done" ? isDelivered(o) : !isDelivered(o)
  );

  return (
    <section className="ua-blk">
      <h2 className="ua-h2">Orders</h2>
      <p className="ua-sub">Track, return, reorder, or review any item.</p>
      <div className="ua-tabs">
        {(
          [
            ["all", "All"],
            ["progress", "In progress"],
            ["done", "Delivered"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {orders === null ? (
        <p className="ua-mut">Loading your orders…</p>
      ) : shown.length ? (
        <div style={{ display: "grid", gap: 16 }}>
          {shown.map((o) => (
            <OrderCard key={`${o.source}-${o.id}`} order={o} full onToast={showToast} />
          ))}
        </div>
      ) : (
        <p className="ua-mut">
          {orders.length
            ? "No orders in this view."
            : "No orders yet. Orders you place will appear here, each with its tracking as soon as it ships."}
        </p>
      )}
      <Toast msg={toast} />
    </section>
  );
}

// ------------------------------------------------------------------- Saved

export function SavedSection() {
  const [toast, showToast] = useToast();
  const [items, setItems] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await jfetch("/api/customers/me/wishlist");
      setItems(j.items ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unsave(productId: string) {
    try {
      await jfetch(`/api/customers/me/wishlist?product_id=${encodeURIComponent(productId)}`, {
        method: "DELETE",
      });
      showToast("Removed from saved");
      await load();
    } catch (e: any) {
      showToast(e.message || "Could not remove that item.");
    }
  }

  async function share(item: any) {
    const url = `${window.location.origin}/product/${item.slug ?? item.product_id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast(url);
    }
  }

  return (
    <section className="ua-blk">
      <h2 className="ua-h2">Saved</h2>
      <p className="ua-sub">Saved items are private — only you can see this list.</p>
      {items === null ? (
        <p className="ua-mut">Loading your saved items…</p>
      ) : items.length ? (
        <div className="ua-grid">
          {items.map((item) => (
            <div className="ua-pc" key={item.id}>
              <Link href={item.slug ? `/product/${item.slug}` : "#"} className="img" style={{ display: "grid" }}>
                <div className="img">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="init">
                      {(item.name || "U").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>
              <div className="nm">{item.name ?? "Product"}</div>
              <div className="meta">
                <span />
                <span>{item.price != null ? `$${Number(item.price).toFixed(2)}` : ""}</span>
              </div>
              <div className="ua-acts">
                <button className="ua-ic on" onClick={() => unsave(item.product_id)} aria-pressed="true" aria-label="Saved — tap to remove">
                  <Bookmark size={18} fill="currentColor" /> Saved
                </button>
                <button className="ua-ic" onClick={() => share(item)} aria-label="Share">
                  <Share2 size={18} /> Share
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="ua-mut">
            Nothing saved. Tap the bookmark on any product to keep it here.
          </p>
          <Link className="ua-btn" href="/shop">
            Browse the shop
          </Link>
        </>
      )}
      <Toast msg={toast} />
    </section>
  );
}

// ------------------------------------------------------------------- Posts

const POST_STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "Live", cls: "ok" },
  pending: { label: "In review", cls: "warn" },
  rejected: { label: "Needs changes", cls: "bad" },
};

export function PostsSection() {
  const [posts, setPosts] = useState<any[] | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const j = await jfetch("/api/customers/me/posts");
      setPosts(j.posts ?? []);
      setQuestions(j.questions ?? []);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="ua-blk">
      <h2 className="ua-h2">Reviews &amp; questions</h2>
      <p className="ua-sub">
        You write reviews and ask questions on the product page — they go
        live right away, no approval needed. Everything you&rsquo;ve
        posted is collected here.
      </p>

      {posts === null ? (
        <p className="ua-mut">Loading…</p>
      ) : (
        <>
          <h3 style={{ margin: "22px 0 6px" }}>Your reviews</h3>
          {posts.length ? (
            <div className="ua-list">
              {posts.map((p) => (
                <div key={p.id}>
                  <div style={{ flex: 1 }}>
                    <div>
                      <span aria-label={`Rated ${p.rating ?? 0} out of 5`}>
                        {"★".repeat(Math.max(0, Math.min(5, Math.round(p.rating ?? 0))))}
                        {"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(p.rating ?? 0))))}
                      </span>{" "}
                      <b>{p.title || p.product_name || "Review"}</b>
                    </div>
                    {p.body ? <div style={{ marginTop: 2 }}>{p.body}</div> : null}
                    <div className="ua-mut" style={{ fontSize: 12.5 }}>
                      {p.product_name ? `${p.product_name} · ` : ""}
                      {fmtDay(p.created_at)}
                      {p.status === "published" ? " · Live" : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="ua-mut">
              No reviews yet. Find a piece in the{" "}
              <Link href="/shop">shop</Link> and tell people what you think.
            </p>
          )}

          <h3 style={{ margin: "26px 0 6px" }}>Your questions</h3>
          {questions.length ? (
            <div className="ua-list">
              {questions.map((q) => (
                <div key={q.id}>
                  <div style={{ flex: 1 }}>
                    <div>{q.body}</div>
                    <div className="ua-mut" style={{ fontSize: 12.5 }}>
                      {q.product_name ? `${q.product_name} · ` : ""}
                      {fmtDay(q.created_at)} ·{" "}
                      {q.answers
                        ? `${q.answers} answer${q.answers === 1 ? "" : "s"}`
                        : "Waiting for an answer"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="ua-mut">
              No questions yet. Ask from any product page — answers show up
              there and are counted here.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------ Notifications

export function NotificationsSection() {
  const [notes, setNotes] = useState<any[] | null>(null);
  const [prefs, setPrefs] = useState<any | null>(null);
  const [mobile, setMobile] = useState("");
  const [consent, setConsent] = useState<any | null>(null);
  const [smsOk, setSmsOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await jfetch("/api/customers/me/notifications");
      setNotes(j.notifications ?? []);
    } catch {
      setNotes([]);
    }
    try {
      const j = await jfetch("/api/customers/me/notification-preferences");
      setPrefs(j.prefs ?? null);
      setMobile(j.mobile ?? "");
      setConsent(j.smsConsent ?? null);
    } catch {
      setPrefs(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    await jfetch("/api/customers/me/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    await load();
  }

  const anySms = Boolean(
    prefs && (prefs.orderUpdates?.sms || prefs.replies?.sms || prefs.offers?.sms)
  );
  const smsAuthorized = Boolean(consent && consent.number && consent.number === mobile);

  async function savePrefs(next?: any, opts?: { unsubscribeAll?: boolean }) {
    setBusy(true);
    try {
      const j = await jfetch("/api/customers/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          opts?.unsubscribeAll
            ? { unsubscribeAll: true }
            : { prefs: next ?? prefs, mobile, smsConsent: smsOk || smsAuthorized }
        ),
      });
      setPrefs(j.prefs);
      setMobile(j.mobile ?? mobile);
      setConsent(j.smsConsent ?? null);
      setSmsOk(false);
      setToast(
        opts?.unsubscribeAll
          ? "All optional messages are off."
          : "Your choices are saved."
      );
    } catch (e: any) {
      setToast(e?.message || "Those choices couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(type: string, channel: "email" | "sms") {
    setPrefs((p: any) => ({
      ...p,
      [type]: { ...p[type], [channel]: !p[type][channel] },
    }));
  }

  const types: { key: string; title: string; blurb: string }[] = [
    {
      key: "orderUpdates",
      title: "Order updates",
      blurb: "When your order is made, ships, and arrives.",
    },
    {
      key: "replies",
      title: "Answers & replies",
      blurb: "When someone answers your question or replies to your review.",
    },
    {
      key: "offers",
      title: "New pieces & offers",
      blurb: "New designs, collections, and sales.",
    },
  ];

  return (
    <section className="ua-blk">
      <h2 className="ua-h2">Notifications</h2>

      <h3 style={{ margin: "20px 0 4px" }}>What you&rsquo;re willing to receive</h3>
      <p className="ua-sub">
        Pick the types of messages you want, and how they reach you. Turn
        anything off at any time — every choice takes effect right away.
      </p>

      {prefs === null ? (
        <p className="ua-mut">Loading your choices…</p>
      ) : (
        <>
          <div className="ua-list" style={{ marginTop: 10 }}>
            {types.map((t) => (
              <div key={t.key} style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <b>{t.title}</b>
                  <div className="ua-mut">{t.blurb}</div>
                </div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[t.key]?.email)}
                    onChange={() => toggle(t.key, "email")}
                  />
                  Email
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[t.key]?.sms)}
                    onChange={() => toggle(t.key, "sms")}
                  />
                  Text
                </label>
              </div>
            ))}
          </div>

          {anySms && (
            <div style={{ marginTop: 14, border: "1px solid var(--ua-line)", borderRadius: 14, padding: 14 }}>
              <div className="ua-f">
                <label htmlFor="ua-notif-mobile">Mobile number for texts</label>
                <input
                  id="ua-notif-mobile"
                  className="ua-input"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                />
              </div>
              {smsAuthorized ? (
                <p className="ua-mut" style={{ fontSize: 12.5 }}>
                  You authorized texts to {consent.number}
                  {consent.at
                    ? ` on ${new Date(consent.at).toLocaleDateString("en-US")}`
                    : ""}
                  . Turn a Text toggle off to stop that type.
                </p>
              ) : (
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={smsOk}
                    onChange={(e) => setSmsOk(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Yes — UnSaid Memories may text me at this number about
                    the types I&rsquo;ve turned on. Message &amp; data rates
                    may apply. Reply STOP to any text to end it.
                  </span>
                </label>
              )}
            </div>
          )}

          <p className="ua-mut" style={{ fontSize: 12.5, marginTop: 12 }}>
            Account and security messages — password resets, sign-in
            alerts — always send. They aren&rsquo;t optional and never
            carry marketing.
          </p>

          <div className="ua-row" style={{ marginTop: 12 }}>
            <button className="ua-btn" onClick={() => savePrefs()} disabled={busy}>
              Save my choices
            </button>
            <button
              className="ua-btn ghost"
              onClick={() => savePrefs(undefined, { unsubscribeAll: true })}
              disabled={busy}
            >
              Turn off all optional messages
            </button>
          </div>
        </>
      )}

      <div className="ua-row" style={{ justifyContent: "space-between", marginTop: 30 }}>
        <h3 style={{ margin: 0 }}>Your notifications</h3>
        <button className="ua-btn ghost sm" onClick={markAllRead}>
          Mark all read
        </button>
      </div>
      {notes === null ? (
        <p className="ua-mut">Loading your notifications…</p>
      ) : notes.length ? (
        <div className="ua-list" style={{ marginTop: 14 }}>
          {notes.map((n) => (
            <div key={n.id}>
              <span className={`ua-dot${n.read_at ? " off" : ""}`} />
              <div style={{ flex: 1 }}>
                {n.title}
                {n.body ? <div className="ua-mut">{n.body}</div> : null}
              </div>
              <span className="ua-mut">{fmtDay(n.created_at)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="ua-mut" style={{ marginTop: 14 }}>
          Nothing here yet. When an order ships or someone answers your
          question, it shows up here.
        </p>
      )}
      <Toast msg={toast} />
    </section>
  );
}

// ------------------------------------------------------------- Preferences

const emptyAddress = {
  first_name: "",
  last_name: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "US",
  phone: "",
};

export function PreferencesSection() {
  const [toast, showToast] = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState("");
  const [addresses, setAddresses] = useState<any[]>([]);
  const [newAddress, setNewAddress] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [me, addr] = await Promise.allSettled([
      jfetch("/api/customers/me"),
      jfetch("/api/customers/me/addresses"),
    ]);
    if (me.status === "fulfilled") {
      setProfile(me.value);
      setName(me.value.name ?? "");
    }
    if (addr.status === "fulfilled") setAddresses(addr.value.addresses ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile() {
    if (!name.trim()) {
      showToast("Enter a name first");
      return;
    }
    setBusy(true);
    try {
      await jfetch("/api/customers/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      showToast("Saved");
      await load();
    } catch (e: any) {
      showToast(e.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function addAddress() {
    setBusy(true);
    try {
      await jfetch("/api/customers/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAddress),
      });
      setNewAddress(emptyAddress);
      setShowForm(false);
      showToast("Address saved");
      await load();
    } catch (e: any) {
      showToast(e.message || "Could not save that address.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/customers/me/addresses/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: any) =>
    setNewAddress((a) => ({ ...a, [k]: e.target.value }));

  return (
    <>
      <section className="ua-blk">
        <h2 className="ua-h2">Profile</h2>
        <p className="ua-sub">
          {profile?.memberSince
            ? `Member since ${fmtDay(profile.memberSince)}. `
            : ""}
          {profile?.emailConfirmed ? "Email confirmed." : "Email not confirmed yet."}
        </p>
        <div className="ua-f">
          <label htmlFor="ua-pn">Display name</label>
          <input id="ua-pn" className="ua-input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ua-f">
          <label>Email</label>
          <input className="ua-input" type="email" value={profile?.email ?? ""} disabled />
        </div>
        <button className="ua-btn" onClick={saveProfile} disabled={busy}>
          Save profile
        </button>
      </section>

      <section className="ua-blk">
        <h2 className="ua-h2">Addresses</h2>
        {addresses.length ? (
          <div style={{ marginBottom: 14 }}>
            {addresses.map((a) => (
              <div className="ua-item" key={a.id}>
                <div className="nm">
                  <div>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || "Address"}
                    {a.is_default ? " · Default" : ""}
                  </div>
                  <div className="ua-mut">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""} · {a.city}, {a.state}{" "}
                    {a.postal_code} · {a.country_code ?? a.country}
                  </div>
                </div>
                <button className="ua-btn ghost sm" onClick={() => deleteAddress(a.id)} disabled={busy}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="ua-sub">No saved addresses yet.</p>
        )}
        {showForm ? (
          <div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f"><label>First name</label><input className="ua-input" value={newAddress.first_name} onChange={set("first_name")} /></div>
              <div className="ua-f"><label>Last name</label><input className="ua-input" value={newAddress.last_name} onChange={set("last_name")} /></div>
            </div>
            <div className="ua-f"><label>Street address</label><input className="ua-input" value={newAddress.line1} onChange={set("line1")} /></div>
            <div className="ua-f"><label>Apartment, suite (optional)</label><input className="ua-input" value={newAddress.line2} onChange={set("line2")} /></div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f"><label>City</label><input className="ua-input" value={newAddress.city} onChange={set("city")} /></div>
              <div className="ua-f"><label>State</label><input className="ua-input" value={newAddress.state} onChange={set("state")} /></div>
            </div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f"><label>Postal code</label><input className="ua-input" value={newAddress.postal_code} onChange={set("postal_code")} /></div>
              <div className="ua-f"><label>Country</label><input className="ua-input" value={newAddress.country_code} onChange={(e) => setNewAddress((a) => ({ ...a, country_code: e.target.value.toUpperCase() }))} maxLength={2} /></div>
            </div>
            <div className="ua-row">
              <button className="ua-btn" onClick={addAddress} disabled={busy}>Save address</button>
              <button className="ua-btn ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="ua-btn ghost" onClick={() => setShowForm(true)}>
            Add an address
          </button>
        )}
      </section>

      <section className="ua-blk">
        <PaymentMethodsCard />
      </section>

      <section className="ua-blk">
        <AdvertisingCard />
      </section>
      <Toast msg={toast} />
    </>
  );
}

// -------------------------------------------------------------------- Help

/** Search the help guides from inside the portal (owner ruling,
    2026-11-03): customers find answers themselves by searching,
    without leaving their account. Runs over the same FAQ entries
    the public help page renders. */
function HelpSearch() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length < 2) return [];
    return faqEntries
      .filter((e) =>
        [e.category, e.question, ...e.answer].join(" ").toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [query]);
  return (
    <div style={{ marginTop: 14 }}>
      <input
        className="ua-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search help — try 'tracking' or 'returns'"
        aria-label="Search help"
      />
      {query.length >= 2 ? (
        results.length ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {results.map((e) => (
              <details
                key={e.question}
                style={{ border: "1px solid #ddd6e8", borderRadius: 10, padding: "10px 14px", background: "#fff" }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#171420" }}>
                  {e.question}
                  <span style={{ display: "block", fontWeight: 400, fontSize: 12, color: "#5c5670", marginTop: 2 }}>
                    {e.category}
                  </span>
                </summary>
                <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.7, color: "#3d3852" }}>
                  {e.answer.map((para, i) => (
                    <p key={i} style={{ margin: "0 0 8px" }}>{para}</p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="ua-mut" style={{ marginTop: 10 }}>
            Nothing matches that — try different words, or write to us below and the team will help directly.
          </p>
        )
      ) : null}
    </div>
  );
}

export function HelpSection() {
  return (
    <>
      <section className="ua-blk">
        <h2 className="ua-h2">Help and care</h2>
        <p className="ua-sub">
          Search the help guides, write to us, and read every reply — all right here in your account.
        </p>
        <HelpSearch />
      </section>

      <section className="ua-blk">
        <Suspense fallback={null}>
          <CustomerSupport />
        </Suspense>
      </section>

      <section className="ua-blk" id="write-to-us">
        <h2 className="ua-h2">Write to us</h2>
        <p className="ua-sub">
          Your message opens a conversation with the team — the whole thread lives on this page.
        </p>
        <div style={{ marginTop: 12 }}>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
