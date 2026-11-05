"use client";

/**
 * Create a Social Post wizard — CHECKPOINT 1 (Steps 1–3 real,
 * Steps 4–5 honest placeholders; NOTHING is posted from here).
 *
 * Wizard #4 in notes/wizard-catalog.md, built under its 7 standing
 * rules: ONE job (one social post), ONE decision per step, defaults
 * from REAL data, checks inside the flow in plain language, Back
 * always allowed. The step list is What are you sharing → Write it →
 * Where → When → Review & send. Checkpoints 2+ will make When and
 * Review & send real and end on the engine's proof (each network's
 * live post link, read back from the post) — wizard rule 5. The
 * matching Help article (rule 7) is "create-a-social-post-wizard" in
 * lib/help/articles.
 *
 * Data contracts — the social engine's own, no parallel paths:
 *   Props arrive from this route's server page, which reads:
 *     - published products from `products` (status = "published"),
 *       photos resolved through the Share composer's own chain
 *       (variant fulfillment routes → supplier catalog image);
 *     - networks + caption limits from SOCIAL_PROVIDERS
 *       (lib/integrations/providers — the same registry behind GET
 *       /api/admin/integrations/social/providers);
 *     - connected accounts from listAccounts()
 *       (lib/integrations/service — the read behind GET
 *       /api/admin/integrations/social/accounts). Only accounts with
 *       status "connected" are passed in; a network with none says
 *       "Connect first" and links to the Connect a Service wizard —
 *       with zero accounts connected anywhere, Step 3 renders that
 *       honest state for every network and cannot be passed.
 *   Announcement photos upload through POST /api/admin/media (the
 *   canonical admin upload proxy into the cms-media bucket), which
 *   returns the public URL the post will carry.
 *
 * What the engine supports (verified in lib/integrations for CP1):
 * posts are created through POST /api/admin/integrations/social/
 * posts (caption, mediaUrls, productId, productUrl, per-network
 * targets with account ids, scheduledAt, publishNow) and published
 * by real per-network adapters in lib/integrations/publish.ts (X,
 * Facebook Page, Instagram, LinkedIn, Pinterest, TikTok, YouTube,
 * Threads), with a cron dispatcher for scheduled posts. CP1 wires
 * NONE of that: no create, no schedule, no send — Steps 4–5 say so.
 * Engine facts the steps surface honestly instead of hiding:
 * Instagram and Pinterest refuse a post with no image, and YouTube
 * refuses anything that is not a video file — the Step 2 previews
 * name those limits where the current photo cannot meet them.
 */

import { useMemo, useRef, useState } from "react";
import "./social-post-wizard.css";

interface ProductInfo {
  id: string;
  name: string;
  url: string;
  imageUrl: string | null;
}
interface NetworkInfo {
  id: string;
  label: string;
  captionLimit: number;
  color: string;
}
interface AccountInfo {
  id: string;
  network: string;
  handle: string | null;
  display_name: string | null;
}

type Step = 1 | 2 | 3 | 4 | 5;
type ShareMode = "product" | "announcement";

const STEP_LABELS = [
  "What are you sharing",
  "Write it",
  "Where",
  "When",
  "Review & send",
] as const;

/** Networks whose publisher refuses a post with no image at all. */
const IMAGE_REQUIRED: Record<string, string> = {
  instagram: "Instagram posts need a photo — the posting engine will refuse one without.",
  pinterest: "Pinterest pins need a photo — the posting engine will refuse one without.",
};
/** YouTube's publisher only accepts video files. */
const VIDEO_ONLY: Record<string, string> = {
  youtube: "YouTube posts need a video file (mp4 or mov) — a photo post cannot go to YouTube.",
};

function accountName(a: AccountInfo): string {
  return a.handle ?? a.display_name ?? "Account";
}

export default function SocialPostWizard({
  products,
  networks,
  accounts,
}: {
  products: ProductInfo[];
  networks: NetworkInfo[];
  accounts: AccountInfo[];
}) {
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<ShareMode>("product");
  const [productId, setProductId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [captionTouched, setCaptionTouched] = useState(false);
  /** network id → chosen account id */
  const [targets, setTargets] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );
  const accountsByNetwork = useMemo(() => {
    const map = new Map<string, AccountInfo[]>();
    for (const a of accounts) {
      const list = map.get(a.network) ?? [];
      list.push(a);
      map.set(a.network, list);
    }
    return map;
  }, [accounts]);

  /** The photo this post will carry, whichever way it was shared. */
  const mediaUrl = mode === "product" ? product?.imageUrl ?? null : photoUrl;
  /** The shop link the publishers attach for a product share. */
  const linkUrl = mode === "product" ? product?.url ?? null : null;

  const canLeave1 =
    mode === "product" ? product !== null : photoUrl !== null;
  const canLeave2 = caption.trim().length > 0;
  const canLeave3 = Object.keys(targets).length > 0;

  function pickProduct(p: ProductInfo) {
    setProductId(p.id);
    if (!captionTouched) {
      setCaption(`New in the shop: ${p.name} — made to order, made to mean something.`);
    }
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("path", "social");
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        setUploadError(json.error ?? "The photo upload failed. Try again.");
        return;
      }
      setPhotoUrl(String(json.url));
    } catch {
      setUploadError("The photo upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function toggleNetwork(networkId: string) {
    setTargets((cur) => {
      const next = { ...cur };
      if (networkId in next) delete next[networkId];
      else next[networkId] = accountsByNetwork.get(networkId)?.[0]?.id ?? "";
      return next;
    });
  }

  /* ---- Stepper header ---- */
  const stepState = (n: number): "done" | "current" | "todo" =>
    n < step ? "done" : n === step ? "current" : "todo";
  /** Clicking a finished step goes back to it (rule 6). */
  const jumpBack = (n: number) => {
    if (n < step) setStep(n as Step);
  };
  const back = () => {
    if (step > 1) setStep((step - 1) as Step);
  };
  const next = () => {
    if (step < 5) setStep((step + 1) as Step);
  };

  return (
    <div className="spw-wrap">
      <div className="spw-head">
        <h1>Create a social post</h1>
      </div>

      <ol className="spw-steps" aria-label="Social post steps">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = stepState(n);
          const labelEl = (
            <>
              <span className="spw-step-num" aria-hidden="true">
                {state === "done" ? "✓" : n}
              </span>
              <span className="spw-step-label">{label}</span>
              {n >= 4 && <span className="spw-step-next">Next checkpoint</span>}
            </>
          );
          return (
            <li
              key={label}
              className={`spw-step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? (
                <button
                  type="button"
                  onClick={() => jumpBack(n)}
                  data-tip={`Go back to the ${label} step.`}
                >
                  {labelEl}
                </button>
              ) : (
                labelEl
              )}
            </li>
          );
        })}
      </ol>

      {/* ================= STEP 1 — What are you sharing ================= */}
      {step === 1 && (
        <section className="spw-panel" aria-label="Step 1: what are you sharing">
          <h2>Step 1 of 5 — What are you sharing?</h2>
          <p className="spw-lede">
            Share a product that is already live in your shop — its photo,
            title, and shop link attach themselves — or make a fresh
            announcement with a photo of your own.
          </p>

          <div className="spw-choices" role="radiogroup" aria-label="What to share" style={{ marginBottom: 16 }}>
            <label className={`spw-choice ${mode === "product" ? "spw-choice-selected" : ""}`}>
              <input
                type="radio"
                name="spw-mode"
                checked={mode === "product"}
                onChange={() => setMode("product")}
              />
              <span>
                <span className="spw-choice-title">A published product</span>
                Pick from the products live in your shop right now.
              </span>
            </label>
            <label className={`spw-choice ${mode === "announcement" ? "spw-choice-selected" : ""}`}>
              <input
                type="radio"
                name="spw-mode"
                checked={mode === "announcement"}
                onChange={() => setMode("announcement")}
              />
              <span>
                <span className="spw-choice-title">A fresh announcement</span>
                Upload a photo — news, a hello, a behind-the-scenes moment.
              </span>
            </label>
          </div>

          {mode === "product" &&
            (products.length === 0 ? (
              <p className="spw-empty">
                No products are published yet, so there is nothing to pick.
                Publish a product first (Design Studio → Publish wizard), or
                choose “A fresh announcement” above.
              </p>
            ) : (
              <div className="spw-products" role="radiogroup" aria-label="Published products">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`spw-product ${productId === p.id ? "spw-product-selected" : ""}`}
                    onClick={() => pickProduct(p)}
                    aria-pressed={productId === p.id}
                    data-tip={`Share “${p.name}” — its photo and shop link attach themselves.`}
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" />
                    ) : (
                      <span className="spw-no-photo">No photo on file</span>
                    )}
                    <span className="spw-product-name">{p.name}</span>
                    <span className="spw-product-link">{p.url}</span>
                  </button>
                ))}
              </div>
            ))}

          {mode === "announcement" && (
            <div>
              {photoUrl ? (
                <div className="spw-summary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl} alt="" />
                  <dl>
                    <dt>Photo</dt>
                    <dd>Uploaded and ready — this is the photo your post will carry.</dd>
                    <dt>Link</dt>
                    <dd>{photoUrl}</dd>
                  </dl>
                </div>
              ) : (
                <p className="spw-empty">
                  No photo yet. An announcement in this wizard starts with one
                  photo — upload it and it is stored with your shop&apos;s
                  media, ready for the post.
                </p>
              )}
              {uploadError && (
                <div className="spw-error" role="alert">
                  {uploadError}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhoto(f);
                  e.target.value = "";
                }}
              />
              <div className="spw-actions" style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="spw-btn"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  data-tip="Upload a photo from your computer — it is stored with your shop's media."
                >
                  {uploading ? "Uploading…" : photoUrl ? "Use a different photo" : "Upload a photo"}
                </button>
              </div>
              <p className="spw-field-hint">
                Images only, up to 10&nbsp;MB — the same limit as every photo
                upload in this admin.
              </p>
            </div>
          )}

          <div className="spw-actions">
            <button
              type="button"
              className="spw-btn spw-btn-primary"
              disabled={!canLeave1}
              onClick={next}
              data-tip="Continue to writing the post."
            >
              Continue — write it
            </button>
          </div>
          {!canLeave1 && (
            <p className="spw-field-hint">
              {mode === "product"
                ? "Pick a product above to continue."
                : "Upload a photo above to continue."}
            </p>
          )}
        </section>
      )}

      {/* ================= STEP 2 — Write it ================= */}
      {step === 2 && (
        <section className="spw-panel" aria-label="Step 2: write the post">
          <h2>Step 2 of 5 — Write it</h2>
          <p className="spw-lede">
            Write your words once. Beside them, every network&apos;s preview
            shows the post exactly as that network will receive it
            {mode === "product" && product
              ? ` — including “${product.name}”'s shop link, which attaches itself`
              : ""}
            , with a friendly count under each one.
          </p>

          <div className="spw-write-grid">
            <div className="spw-field">
              <label htmlFor="spw-caption">Your words</label>
              <textarea
                id="spw-caption"
                className="spw-textarea"
                rows={8}
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value);
                  setCaptionTouched(true);
                }}
                placeholder="Say it the way you'd say it to a friend…"
              />
              <p className="spw-field-hint">
                {caption.trim().length === 0
                  ? "The post needs some words before you can continue."
                  : `${caption.length} characters written.`}
              </p>
            </div>

            <div className="spw-previews" aria-label="Preview per network">
              {networks.map((n) => {
                const over = n.captionLimit > 0 && caption.length > n.captionLimit;
                const pct =
                  n.captionLimit > 0
                    ? Math.min(100, Math.round((caption.length / n.captionLimit) * 100))
                    : 0;
                const needsImage = IMAGE_REQUIRED[n.id] && !mediaUrl;
                const videoOnly = VIDEO_ONLY[n.id];
                return (
                  <div className="spw-preview" key={n.id}>
                    <div className="spw-preview-head">
                      <span className="spw-dot" style={{ background: n.color }} aria-hidden="true" />
                      <span className="spw-preview-name">{n.label}</span>
                    </div>
                    {mediaUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl} alt="" />
                    )}
                    {caption.trim() ? (
                      <p className="spw-preview-text">{caption}</p>
                    ) : (
                      <p className="spw-preview-empty">Your words will appear here as you type.</p>
                    )}
                    {linkUrl && <p className="spw-preview-link">{linkUrl}</p>}
                    {needsImage && <p className="spw-meter">{IMAGE_REQUIRED[n.id]}</p>}
                    {videoOnly && <p className="spw-meter">{VIDEO_ONLY[n.id]}</p>}
                    {n.captionLimit > 0 ? (
                      <div className={`spw-meter ${over ? "spw-meter-over" : ""}`}>
                        {over
                          ? `${caption.length - n.captionLimit} over ${n.label}'s ${n.captionLimit}-character limit — it would refuse this as written. Shorten the words, or leave ${n.label} unticked in the next step.`
                          : `${caption.length} of ${n.captionLimit} characters`}
                        <div className="spw-meter-bar" aria-hidden="true">
                          <div className="spw-meter-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="spw-meter">{n.label} has no character limit.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="spw-actions">
            <button type="button" className="spw-btn" onClick={back} data-tip="Go back to choosing what to share.">
              Back
            </button>
            <button
              type="button"
              className="spw-btn spw-btn-primary"
              disabled={!canLeave2}
              onClick={next}
              data-tip="Continue to choosing where the post goes."
            >
              Continue — where it goes
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 3 — Where ================= */}
      {step === 3 && (
        <section className="spw-panel" aria-label="Step 3: where the post goes">
          <h2>Step 3 of 5 — Where does it go?</h2>
          <p className="spw-lede">
            Tick the networks this post should go to. These are your real
            connected accounts, with their real names — a network that is not
            connected yet says so and takes you to connect it, never to a dead
            end.
          </p>

          {accounts.length === 0 && (
            <div className="spw-note" role="note" style={{ margin: "0 0 16px" }}>
              No social accounts are connected yet, so there is nowhere for a
              post to go. Connect at least one network first — the{" "}
              <a href="/admin/integrations/connect">Connect a Service wizard</a>{" "}
              walks you through it, and the Social accounts page under
              Integrations is where the sign-in finishes. Your words and photo
              stay right here while you go.
            </div>
          )}

          <div className="spw-choices">
            {networks.map((n) => {
              const mine = accountsByNetwork.get(n.id) ?? [];
              const checked = n.id in targets;
              if (mine.length === 0) {
                return (
                  <div className="spw-choice spw-choice-disabled" key={n.id}>
                    <input type="checkbox" checked={false} disabled aria-hidden="true" tabIndex={-1} />
                    <span>
                      <span className="spw-choice-title">{n.label}</span>
                      <span className="spw-connect-line">
                        Connect first —{" "}
                        <a href="/admin/integrations/connect">
                          open the Connect a Service wizard
                        </a>{" "}
                        to link your {n.label} account.
                      </span>
                    </span>
                  </div>
                );
              }
              return (
                <label
                  key={n.id}
                  className={`spw-choice ${checked ? "spw-choice-selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleNetwork(n.id)}
                  />
                  <span>
                    <span className="spw-choice-title">{n.label}</span>
                    {mine.length === 1 ? (
                      <>Posting as {accountName(mine[0])}</>
                    ) : (
                      <>
                        Posting as
                        <select
                          className="spw-select spw-account-select"
                          disabled={!checked}
                          value={targets[n.id] ?? mine[0].id}
                          onChange={(e) =>
                            setTargets((cur) => ({ ...cur, [n.id]: e.target.value }))
                          }
                          aria-label={`Which ${n.label} account posts this`}
                        >
                          {mine.map((a) => (
                            <option key={a.id} value={a.id}>
                              {accountName(a)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="spw-actions">
            <button type="button" className="spw-btn" onClick={back} data-tip="Go back to writing the post.">
              Back
            </button>
            <button
              type="button"
              className="spw-btn spw-btn-primary"
              disabled={!canLeave3}
              onClick={next}
              data-tip="Continue to the When step."
            >
              Continue — when it goes out
            </button>
          </div>
          {!canLeave3 && (
            <p className="spw-field-hint">
              {accounts.length === 0
                ? "Connect a network above to continue — a post needs somewhere to go."
                : "Tick at least one network above to continue."}
            </p>
          )}
        </section>
      )}

      {/* ================= STEP 4 — When (NEXT CHECKPOINT) ================= */}
      {step === 4 && (
        <section className="spw-panel" aria-label="Step 4: when the post goes out">
          <h2>Step 4 of 5 — When does it go out?</h2>
          <p className="spw-lede">
            This step arrives in the next checkpoint — it is shown here so
            you can see the whole journey, and it holds no controls yet on
            purpose.
          </p>
          <div className="spw-note" style={{ marginTop: 0 }}>
            When this step opens, you will choose <b>Post now</b>, or pick a
            date and time on a calendar. The posting engine already supports
            both — it keeps a schedule for every post and a background
            publisher sends each one when its time comes, the same engine
            behind Calendar &amp; queue. Until the step is wired here, use{" "}
            <a href="/admin/integrations/share">Share a product</a> or the{" "}
            <a href="/admin/integrations/calendar">Calendar &amp; queue</a> to
            send and schedule posts the way you do today. Nothing you picked
            in Steps 1–3 is lost by going back.
          </div>
          <div className="spw-actions">
            <button type="button" className="spw-btn" onClick={back} data-tip="Go back to choosing where the post goes.">
              Back
            </button>
            <button
              type="button"
              className="spw-btn"
              onClick={next}
              data-tip="Look at the review step — sending also arrives in the next checkpoint."
            >
              Continue — review
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 5 — Review & send (NEXT CHECKPOINT) ================= */}
      {step === 5 && (
        <section className="spw-panel" aria-label="Step 5: review and send">
          <h2>Step 5 of 5 — Review &amp; send</h2>
          <p className="spw-lede">
            Sending arrives in the next checkpoint, together with Step 4.
            Here is your post as you have built it, so you can check it —
            there is no Send button yet, and nothing on this page can post.
          </p>

          <div className="spw-summary">
            {mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl} alt="" />
            )}
            <dl>
              <dt>Sharing</dt>
              <dd>
                {mode === "product" && product
                  ? `${product.name} — ${product.url}`
                  : "A fresh announcement with your uploaded photo"}
              </dd>
              <dt>Words</dt>
              <dd>{caption}</dd>
              <dt>Going to</dt>
              <dd>
                {Object.entries(targets)
                  .map(([networkId, accountId]) => {
                    const net = networks.find((n) => n.id === networkId);
                    const acc = accounts.find((a) => a.id === accountId);
                    return `${net?.label ?? networkId} (${acc ? accountName(acc) : "first connected account"})`;
                  })
                  .join(", ") || "No networks picked yet"}
              </dd>
            </dl>
          </div>

          <div className="spw-note">
            When this step opens, you will see the previews once more and
            press Send. The wizard will then hand the post to the posting
            engine and end on proof — each network&apos;s live post link,
            read back from the engine — never just a “done”. Until then,{" "}
            <a href="/admin/integrations/share">Share a product</a> remains
            the working way to send a post today.
          </div>

          <div className="spw-actions">
            <button type="button" className="spw-btn" onClick={back} data-tip="Go back to the When step.">
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
