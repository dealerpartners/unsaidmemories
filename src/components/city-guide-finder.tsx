"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, ArrowUpRight, MapPin } from "lucide-react";
import { CITY_GUIDE_INDEX } from "@/lib/city-guide-index";

// City finder for /guides-stories — a state → city directory that routes
// to the 4,955 SEO city-guide pages at /guides/{slug}. Mirrors the gift-
// finder pattern: a search box, a state grid, then a city list.
//
// The SEO pages themselves (public/guides/*.html) are served via
// next.config.ts rewrites; this finder is the in-app navigation surface
// that makes them discoverable from the main site instead of sitemap-only.
export function CityGuideFinder() {
  const [activeState, setActiveState] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const active = useMemo(
    () => CITY_GUIDE_INDEX.find((s) => s.stateSlug === activeState) ?? null,
    [activeState],
  );

  // Filter cities by the search box when a state is selected.
  const filteredCities = useMemo(() => {
    if (!active) return [];
    const q = query.trim().toLowerCase();
    if (!q) return active.cities;
    return active.cities.filter((c) => c.city.toLowerCase().includes(q));
  }, [active, query]);

  // Global search (no state selected): match cities across all states.
  const globalResults = useMemo(() => {
    if (activeState || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    const results: { city: string; stateName: string; slug: string }[] = [];
    for (const state of CITY_GUIDE_INDEX) {
      for (const c of state.cities) {
        if (c.city.toLowerCase().includes(q)) {
          results.push({ city: c.city, stateName: state.stateName, slug: c.slug });
          if (results.length >= 50) return results;
        }
      }
    }
    return results;
  }, [query, activeState]);

  return (
    <div className="cg-finder">
      <div className="cg-finder-head">
        <span className="eyebrow">Find your city</span>
        <h2>Browse guides by <em>location.</em></h2>
        <p>
          Thoughtful city guides for communities across the country. Pick a state
          to see every city — or search for one by name.
        </p>
        <div className="cg-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder={activeState ? `Search cities in ${active?.stateName}…` : "Search any city…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cities"
          />
        </div>
      </div>

      {/* Global search results (when no state is selected) */}
      {globalResults.length > 0 && (
        <div className="cg-global-results">
          <div className="cg-results-head">
            <span>{globalResults.length}{globalResults.length >= 50 ? "+" : ""} cities match &ldquo;{query}&rdquo;</span>
          </div>
          <div className="cg-city-list">
            {globalResults.map((r) => (
              <Link key={r.slug} href={`/guides/${r.slug}`} className="cg-city-item">
                <span className="cg-city-name">{r.city}</span>
                <span className="cg-city-state">{r.stateName}</span>
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* State grid */}
      {!activeState && globalResults.length === 0 && (
        <div className="cg-state-grid">
          {CITY_GUIDE_INDEX.map((s) => (
            <button
              key={s.stateSlug}
              type="button"
              className="cg-state-card"
              onClick={() => { setActiveState(s.stateSlug); setQuery(""); }}
            >
              <span className="cg-state-name">{s.stateName}</span>
              <span className="cg-state-count">{s.cityCount} guides</span>
              <ChevronRight size={16} aria-hidden />
            </button>
          ))}
        </div>
      )}

      {/* City list (when a state is selected) */}
      {activeState && active && (
        <div className="cg-state-detail">
          <div className="cg-detail-head">
            <button
              type="button"
              className="cg-back"
              onClick={() => { setActiveState(null); setQuery(""); }}
            >
              ← All states
            </button>
            <h3>
              <MapPin size={18} aria-hidden />
              {active.stateName}
            </h3>
            <span className="cg-detail-count">
              {filteredCities.length} of {active.cityCount} cities
            </span>
          </div>
          <div className="cg-city-list cg-city-list-grid">
            {filteredCities.map((c) => (
              <Link key={c.slug} href={`/guides/${c.slug}`} className="cg-city-item">
                <span className="cg-city-name">{c.city}</span>
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            ))}
            {filteredCities.length === 0 && (
              <p className="cg-empty">No cities in {active.stateName} match &ldquo;{query}&rdquo;.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
