"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Asterisk,
  GraduationCap,
  Heart,
  HeartHandshake,
  LayoutGrid,
  Star,
  Users,
} from "lucide-react";
import type { BandCard, ShopBandsData } from "@/lib/shop-bands";

/**
 * ShopFeatureBands — the owner's two editorial bands (reference:
 * notes/shop-feature-bands-reference.png), rendered at the foot of
 * every shop page (mounted by ShopApp, above the site footer):
 * "Featured collections" and "Your people". Card data comes from
 * /api/shop-bands — real routes and real catalogue imagery only.
 */

const ICONS = {
  heart: Heart,
  users: Users,
  "heart-handshake": HeartHandshake,
  star: Star,
  "graduation-cap": GraduationCap,
} as const;

function BandCardView({ card }: { card: BandCard }) {
  const Icon = card.icon ? ICONS[card.icon] : null;
  // If a catalogue CDN asset ever fails to load, fall back to the
  // branded placeholder rather than a broken-image icon.
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Link href={card.href} className="band-card">
      <span className="band-card-media">
        {card.image && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <span className="band-card-placeholder" aria-hidden="true">
            <Asterisk size={34} />
          </span>
        )}
        {card.badge && <span className="band-card-badge">{card.badge}</span>}
        {Icon && (
          <span className="band-card-icon" aria-hidden="true">
            <Icon size={17} />
          </span>
        )}
      </span>
      <span className="band-card-foot">
        <span className="band-card-label">{card.label}</span>
        <span className="band-card-arrow" aria-hidden="true">
          <ArrowRight size={14} />
        </span>
      </span>
    </Link>
  );
}

export function ShopFeatureBands() {
  const [data, setData] = useState<ShopBandsData | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/shop-bands")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d) setData(d as ShopBandsData);
      })
      .catch(() => {
        /* bands are editorial — a failed fetch simply skips them */
      });
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;

  return (
    <div className="shop-bands">
      <section className="bands-panel" aria-label="Featured collections">
        <div className="bands-intro">
          <span className="eyebrow">Featured collections</span>
          <h2>
            Meaningful gifts for <em>every moment.</em>
          </h2>
          <p>
            Thoughtful collections for life’s big moments, quiet milestones and everything in
            between.
          </p>
          <Link href="/collections" className="bands-button">
            Shop all collections <ArrowRight size={15} />
          </Link>
        </div>
        <div className="bands-grid">
          {data.collections.map((card) => (
            <BandCardView key={card.label} card={card} />
          ))}
          <Link href="/collections" className="band-card band-card-explore">
            <span className="band-explore-icon" aria-hidden="true">
              <LayoutGrid size={22} />
            </span>
            <span className="band-explore-title">Explore</span>
            <span className="band-explore-sub">
              Shop all collections <span aria-hidden="true">›</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="bands-panel" aria-label="Your people">
        <div className="bands-intro">
          <span className="eyebrow">Your people</span>
          <h2>
            The people who make <em>life richer.</em>
          </h2>
          <p>
            Celebrate the ones who show up, support you, challenge you and make the journey
            brighter.
          </p>
          <Link href="/relationships" className="bands-button">
            Shop all relationships <ArrowRight size={15} />
          </Link>
        </div>
        <div className="bands-grid">
          {data.relationships.map((card) => (
            <BandCardView key={card.label} card={card} />
          ))}
          <div className="band-feeling">
            <div className="band-feeling-head">
              <span className="band-feeling-icon" aria-hidden="true">
                <Heart size={18} />
              </span>
              <span>Shop by feeling</span>
            </div>
            <div className="band-feeling-rows">
              {data.feelings.map((f) => (
                <Link key={f.label} href={f.href} className="band-feeling-row">
                  <span>{f.label}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ))}
            </div>
            <Link href="/relationships" className="band-feeling-explore">
              Explore <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
