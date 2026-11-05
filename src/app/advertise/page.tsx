import type { Metadata } from "next";
import Link from "next/link";
import { createAuthClient } from "@/lib/supabase/server";
import "./advertise.css";

export const metadata: Metadata = {
  title: "Advertise with Unsaid — Thoughtful brand partnerships",
  description:
    "A more considered kind of advertising. Make your brand part of what matters with Unsaid's editorial spotlight, curated display, and co-branded collaborations.",
};

/**
 * /advertise — the public advertising landing page.
 *
 * The door to the Ad Center: visitors see the marketing page first. The
 * "Get started" CTA routes to /advertise/get-started, the 6-step
 * progressive onboarding flow that collects brand profile, objectives,
 * audience, creative, budget, and compliance — then creates the account
 * and continues into /ads. Signed-in users get a banner to skip ahead.
 */
export default async function AdvertisePage() {
  // If already signed in, show a "continue to Ad Center" banner.
  const authClient = await createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  const signedIn = !!user;

  return (
    <div className="ad-page">
      {signedIn && (
        <div className="ad-signed-in">
          You&apos;re signed in.
          <Link href="/ads">Continue to the Ad Center →</Link>
        </div>
      )}

      {/* HERO */}
      <section className="ad-hero">
        <div className="ad-hero-copy">
          <div className="ad-eyebrow">A more considered kind of advertising</div>
          <h1>
            Make your brand part of <em>what matters.</em>
          </h1>
          <p>
            Good partnerships feel natural. Unsaid creates space for thoughtful brand stories, relevant discovery, and connections that stay with people.
          </p>
          <div className="ad-actions">
            <Link className="ad-btn ad-btn-primary" href="/advertise/get-started">
              Get started <span aria-hidden="true">↗</span>
            </Link>
            <Link className="ad-btn ad-btn-secondary" href="#opportunities">
              Explore opportunities
            </Link>
          </div>
        </div>
        <div className="ad-hero-visual" aria-label="Abstract Unsaid brand campaign visual">
          <div className="ad-orbit" />
          <div className="ad-visual-card">
            <div className="ad-symbol">↔</div>
            <h2>Find the right connection</h2>
            <p>Unsaid · Keep what matters</p>
          </div>
          <div className="ad-float-note ad-note-one">
            <small>The bigger story</small>Make meaning shareable
          </div>
          <div className="ad-float-note ad-note-two">
            <small>The little things</small>Hold on to what matters
          </div>
        </div>
      </section>

      {/* APPROACH */}
      <section className="ad-section ad-white" id="approach">
        <div className="ad-wrap">
          <div className="ad-section-head">
            <div>
              <div className="ad-eyebrow">The Unsaid approach</div>
              <h2>
                Be present.
                <br />
                <em>Not intrusive.</em>
              </h2>
            </div>
            <p>
              We believe the strongest brand moments begin with relevance. The goal is not to add more noise, but to create a meaningful place for your message within the Unsaid experience.
            </p>
          </div>
          <div className="ad-principles">
            <article className="ad-principle">
              <div className="ad-number">01 · RELEVANCE</div>
              <h3>Start with meaning.</h3>
              <p>Bring a clear point of view and a message that makes sense for the people you want to reach.</p>
            </article>
            <article className="ad-principle">
              <div className="ad-number">02 · STORY</div>
              <h3>Give it a voice.</h3>
              <p>Shape a story that feels considered, memorable, and true to your brand.</p>
            </article>
            <article className="ad-principle">
              <div className="ad-number">03 · CONNECTION</div>
              <h3>Make it matter.</h3>
              <p>Create an experience that gives people a reason to notice, explore, and connect.</p>
            </article>
          </div>
        </div>
      </section>

      {/* OPPORTUNITIES */}
      <section className="ad-section" id="opportunities">
        <div className="ad-wrap">
          <div className="ad-section-head">
            <div>
              <div className="ad-eyebrow">Ways to work together</div>
              <h2>
                More than an <em>ad placement.</em>
              </h2>
            </div>
            <p>
              Every brand has a different story to tell. Partnership ideas can be shaped around your goals, your audience, and the kind of connection you want to create.
            </p>
          </div>
          <div className="ad-principles">
            <article className="ad-principle">
              <div className="ad-number">01 · DISCOVERY</div>
              <h3>Introduce your brand.</h3>
              <p>Build awareness through thoughtful visibility and relevant brand features.</p>
            </article>
            <article className="ad-principle">
              <div className="ad-number">02 · STORYTELLING</div>
              <h3>Share something useful.</h3>
              <p>Explore sponsored stories and content partnerships that give your message context.</p>
            </article>
            <article className="ad-principle">
              <div className="ad-number">03 · COLLABORATION</div>
              <h3>Create something together.</h3>
              <p>Develop a campaign concept that brings your brand perspective and the Unsaid spirit together.</p>
            </article>
          </div>
        </div>
      </section>

      {/* PARTNERSHIPS / FEATURE */}
      <section className="ad-section ad-white" id="formats">
        <div className="ad-wrap">
          <div className="ad-feature">
            <div className="ad-feature-visual" aria-hidden="true">
              <div className="ad-feature-panel">
                <small>A story worth sharing</small>
                <strong>Make room for what matters.</strong>
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="ad-feature-copy">
              <div className="ad-eyebrow">Built around your brief</div>
              <h2 style={{ fontSize: "clamp(40px,5vw,65px)", lineHeight: 0.98, letterSpacing: "-.06em", fontWeight: 700, margin: "0 0 24px" }}>
                Find the right way to <em style={{ fontFamily: "var(--ad-serif)", fontWeight: 400, color: "var(--ad-purple)" }}>show up.</em>
              </h2>
              <p>
                From a focused brand feature to a broader creative collaboration, we can start with the idea and shape an approach around it. The right format is the one that serves the story.
              </p>
              <div className="ad-checks">
                <div className="ad-check"><b>✓</b><span>Brand features and product spotlights</span></div>
                <div className="ad-check"><b>✓</b><span>Sponsored stories and editorial-style content</span></div>
                <div className="ad-check"><b>✓</b><span>Creative and campaign collaborations</span></div>
                <div className="ad-check"><b>✓</b><span>Partnership concepts shaped to your objectives</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATEMENT */}
      <section className="ad-section">
        <div className="ad-wrap">
          <div className="ad-statement">
            <blockquote>&ldquo;The right message, in the right place, can become part of a story people want to keep.&rdquo;</blockquote>
            <div className="ad-statement-side">
              <div className="ad-kicker">What we believe</div>
              <p>
                Unsaid is built around the things that matter. We want brand partnerships to respect that — thoughtful in their purpose, clear in their message, and memorable in how they connect.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING / CTA */}
      <section className="ad-closing" id="contact">
        <div className="ad-closing-inner">
          <div>
            <div className="ad-eyebrow">Let&apos;s make something meaningful</div>
            <h2>Have a story your brand wants to tell?</h2>
          </div>
          <div>
            <p>
              Set up your Ad Center account in a few steps. Tell us about your brand, your goals, and the kind of partnership you&apos;re looking to create.
            </p>
            <Link className="ad-btn ad-btn-primary" href="/advertise/get-started">
              Get started <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
