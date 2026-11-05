"use client";

// Help Center home — Sunny's design (unsaid-help-center spec) on the real
// /admin/help route. Search filters the real article index; every card
// and topic links to a real /admin/help/[slug] article route; the two
// guided wizards are dialogs on this page whose steps end at those same
// real guides. Article content lives in src/lib/help/articles.ts.

import { useMemo, useState } from "react";
import Link from "next/link";
import { HELP_ARTICLES } from "@/lib/help/articles";
import "./help-hub.css";

const TOPICS: { icon: string; name: string; desc: string; slugs: string[] }[] = [
  { icon: "⌂", name: "Getting around", desc: "The basics of using the admin", slugs: ["getting-started", "dashboard", "tabs"] },
  { icon: "▣", name: "Products & design", desc: "Create, manage, and publish products", slugs: ["inventory-products", "design-studio", "new-design-wizard", "publish-wizard"] },
  { icon: "▤", name: "Orders & customers", desc: "The customer and fulfillment journey", slugs: ["customers", "orders", "support"] },
  { icon: "＄", name: "Money & reporting", desc: "Understand the shop's financial performance", slugs: ["accounting", "analytics"] },
  { icon: "⌘", name: "Connections & tools", desc: "Connect services and manage access safely", slugs: ["connections-keys", "connect-a-service-wizard", "store-api"] },
  { icon: "⚙", name: "Store & administration", desc: "Configure the store and manage your team", slugs: ["settings", "users-roles", "trust-safety"] },
  { icon: "◷", name: "Marketing & publishing", desc: "Plan content and reach your audience", slugs: ["marketing-social", "create-a-social-post-wizard"] },
];

const POPULAR: { n: string; title: string; desc: string; slug: string; label: string }[] = [
  { n: "01", title: "Connect a service", desc: "Set up a provider, verify access, and confirm it works.", slug: "connect-a-service-wizard", label: "Open tutorial →" },
  { n: "02", title: "Create and publish a product", desc: "Move a finished design to a live product page.", slug: "publish-wizard", label: "Open tutorial →" },
  { n: "03", title: "Start a new design", desc: "Choose a product and supplier, then open the canvas.", slug: "new-design-wizard", label: "Open tutorial →" },
  { n: "04", title: "Write and schedule a post", desc: "Prepare one post and tailor it for each destination.", slug: "create-a-social-post-wizard", label: "Open tutorial →" },
  { n: "05", title: "Find an order and ship it", desc: "Understand the order journey and what happens next.", slug: "orders", label: "Open guide →" },
  { n: "06", title: "Understand your money", desc: "Find invoices, refunds, bills, and key reports.", slug: "accounting", label: "Open guide →" },
];

const TOURS = {
  tour: {
    kicker: "Welcome tour", title: "Your admin, at a glance", subtitle: "Five small steps. You can leave at any time.",
    steps: [
      ["Your dashboard", "Your dashboard is the overview: headline shop numbers, recent orders, and important activity. It helps you spot what needs attention without opening every work area.", "Start here when you sign in. Use the left navigation to move into the area where you want to work."],
      ["Find the right work area", "The navigation is grouped by the work you do — products, orders, customers, accounting, marketing, and administration.", "If you're unsure where something lives, use the Help Center search rather than guessing."],
      ["Use tabs to keep your place", "You can open more than one admin page and move between them without losing your place.", "Use tabs when comparing an order with a customer record or checking a product while editing a design."],
      ["Know before you click", "Buttons and controls include explanatory notes when you rest your pointer over them. Important actions should make their outcome clear before you commit.", "Pause before destructive or financial actions. Check the record, amount, and destination before confirming."],
      ["You're ready to explore", "That's the basic map. Pick a tutorial for a real task, or browse a topic whenever you need a reminder.", "A good first task is connecting a service and testing it, or opening an order and following its status."],
    ] as [string, string, string][],
  },
  task: {
    kicker: "Choose a tutorial", title: "What would you like to do?", subtitle: "Pick a task and we'll take you to the right step-by-step guide.",
    steps: [
      ["Connect a service", "Set up a supplier or platform connection, verify credentials, and confirm the connection is working.", "/admin/help/connect-a-service-wizard"],
      ["Publish a product", "Follow the publish checklist from product selection through the live product page.", "/admin/help/publish-wizard"],
      ["Create a design", "Start with the guided design wizard and arrive at the canvas with your choices made.", "/admin/help/new-design-wizard"],
      ["Schedule a social post", "Write, preview, choose destinations, and schedule a post.", "/admin/help/create-a-social-post-wizard"],
    ] as [string, string, string][],
  },
};

export default function HelpHome() {
  const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState<null | keyof typeof TOURS>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [toastMsg, setToastMsg] = useState("");

  const bySlug = useMemo(() => new Map(HELP_ARTICLES.map((a) => [a.slug, a])), []);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return HELP_ARTICLES.filter((a) => `${a.title} ${a.summary} ${a.keywords}`.toLowerCase().includes(q));
  }, [query]);

  const tour = wizard ? TOURS[wizard] : null;
  const step = tour?.steps[stepIndex];

  const closeWizard = () => setWizard(null);
  const openWizard = (w: keyof typeof TOURS) => { setWizard(w); setStepIndex(0); };

  return (
    <div className="hlp">
      <main>
        <div className="hero">
          <div>
            <h1>Help Center</h1>
          </div>
          <div className="search-wrap">
            <span>⌕</span>
            <input className="search" placeholder="Search help topics, tasks, or features…" autoComplete="off" aria-label="Search help topics"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {results !== null && (
          <div className="search-results show">
            {results.length === 0
              ? <div className="result">No matching guide found. Try a shorter search term.</div>
              : results.map((a) => (
                <Link key={a.slug} className="result" href={`/admin/help/${a.slug}`}>
                  <div><strong>{a.title}</strong><small>{a.summary}</small></div><em>Open →</em>
                </Link>
              ))}
          </div>
        )}

        <section>
          <div className="section-head"><div><h2>Start here</h2><p>Two guided starting points. No need to read everything first.</p></div></div>
          <div className="feature-grid">
            <article className="feature primary">
              <div className="feature-mark">✦</div>
              <div className="feature-kicker">Recommended · 5 minute tour</div>
              <h3>Get comfortable with your admin</h3>
              <p>Learn where things live, how to move between work areas, and the simple safety checks that protect your work.</p>
              <div className="actions">
                <button className="btn primary" onClick={() => openWizard("tour")}>Start the welcome tour →</button>
                <Link className="btn" href="/admin/help/getting-started">Read the guide</Link>
              </div>
            </article>
            <article className="feature feature-side">
              <div>
                <div className="feature-kicker">Learn by doing</div>
                <h3>Complete your first task</h3>
                <p>Choose a common job and follow a short walkthrough, one decision at a time.</p>
              </div>
              <div><button className="btn" onClick={() => openWizard("task")}>Choose a tutorial →</button></div>
            </article>
          </div>
        </section>

        <section>
          <div className="section-head"><div><h2>Popular tutorials</h2><p>Practical walkthroughs for the jobs you&apos;ll do most often.</p></div><a className="quiet-link" href="#all-topics">Browse all topics ↓</a></div>
          <div className="path-grid">
            {POPULAR.map((p) => (
              <article className="path" key={p.n}>
                <div className="path-num">{p.n}</div>
                <div><h3>{p.title}</h3><p>{p.desc}</p><Link href={`/admin/help/${p.slug}`}>{p.label}</Link></div>
              </article>
            ))}
          </div>
        </section>

        <section id="all-topics">
          <div className="section-head"><div><h2>Browse by area</h2><p>Topics are grouped by the kind of work you&apos;re doing. Open a group to see its guides.</p></div></div>
          <div className="topic-layout">
            {TOPICS.map((t, i) => (
              <details className="topic" key={t.name} open={i === 0}>
                <summary>
                  <div className="topic-left"><div className="topic-icon">{t.icon}</div><div><h3>{t.name}</h3><small>{t.desc}</small></div></div>
                  <span className="chev">⌄</span>
                </summary>
                <div className="topic-items">
                  {t.slugs.map((slug) => {
                    const a = bySlug.get(slug);
                    if (!a) return null;
                    return <Link key={slug} href={`/admin/help/${slug}`}>{a.title} <span>→</span></Link>;
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <p style={{ textAlign: "center", color: "#91a0a8", fontSize: 10, marginTop: 30 }}>Still stuck? Contact your administrator or open the Support Desk from the admin navigation.</p>
      </main>

      {tour && step && (
        <div className="wizard-overlay open" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) closeWizard(); }}>
          <div className="wizard">
            <div className="wizard-top">
              <div className="wizard-topline"><span className="wizard-kicker">{tour.kicker}</span><button className="x" aria-label="Close tutorial" onClick={closeWizard}>×</button></div>
              <h2>{tour.title}</h2>
              <p>{tour.subtitle}</p>
              <div className="progress"><span style={{ width: `${((stepIndex + 1) / tour.steps.length) * 100}%` }} /></div>
              <div className="step-dots">{tour.steps.map((_, i) => <span key={i} className={`step-dot ${i <= stepIndex ? "done" : ""}`} />)}</div>
            </div>
            <div className="wizard-body">
              {wizard === "task" ? (
                <>
                  <div className="step-label">Choose a task · {tour.steps.length} tutorials</div>
                  <h3>{step[0]}</h3><p>{step[1]}</p>
                  <div className="tip">{step[2]}<br /><br /><Link className="btn primary" href={step[2]}>Open this tutorial →</Link></div>
                </>
              ) : (
                <>
                  <div className="step-label">Step {stepIndex + 1} of {tour.steps.length}</div>
                  <h3>{step[0]}</h3><p>{step[1]}</p>
                  <div className="tip">{step[2]}</div>
                </>
              )}
            </div>
            <div className="wizard-foot">
              <button className="btn" style={{ visibility: stepIndex === 0 ? "hidden" : "visible" }} onClick={() => setStepIndex(stepIndex - 1)}>← Back</button>
              <div className="right">
                <button className="btn" onClick={closeWizard}>Exit</button>
                {stepIndex < tour.steps.length - 1
                  ? <button className="btn primary" onClick={() => setStepIndex(stepIndex + 1)}>Next step →</button>
                  : wizard === "task"
                    ? <Link className="btn primary" href={step[2]}>Open guide →</Link>
                    : <button className="btn primary" onClick={() => { closeWizard(); setToastMsg("Welcome tour complete. Choose a tutorial whenever you're ready."); setTimeout(() => setToastMsg(""), 3000); }}>Finish tour ✓</button>}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={`toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
