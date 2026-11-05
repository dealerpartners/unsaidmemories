"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";
import { CITY_GUIDE_INDEX, type CityGuideState } from "@/lib/city-guide-index";
import "./city-guide-directory.css";

// City guide directory — matches the sitemap template: 51 state cards
// in a grid, each expandable to show its cities. Click a city → /guides/{slug}.
export function CityGuideDirectory() {
  const [query, setQuery] = useState("");
  const [openState, setOpenState] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLDetailsElement | null)[]>([]);

  const q = query.trim().toLowerCase();

  // Filter states by search (matches state name or any city within).
  const filteredStates = useMemo(() => {
    if (!q) return CITY_GUIDE_INDEX;
    return CITY_GUIDE_INDEX.filter((s) => {
      if (s.stateName.toLowerCase().includes(q)) return true;
      return s.cities.some((c) => c.city.toLowerCase().includes(q));
    });
  }, [q]);

  // Auto-expand all cards when searching.
  useEffect(() => {
    cardRefs.current.forEach((el) => {
      if (el) el.open = !!q;
    });
  }, [q]);

  const totalCities = useMemo(
    () => CITY_GUIDE_INDEX.reduce((sum, s) => sum + s.cityCount, 0),
    [],
  );

  return (
    <div className="cgd-page">
      <main className="cgd-main">
        {/* INTRO */}
        <section className="cgd-intro">
          <div>
            <p className="cgd-kicker">UnSaid Memories</p>
            <h1>Find your city</h1>
          </div>
          <span className="cgd-meta">
            {totalCities.toLocaleString()} guides across {CITY_GUIDE_INDEX.length} states
          </span>
        </section>

        {/* SEARCH */}
        <div className="cgd-tools">
          <div className="cgd-search-wrap">
            <Search className="cgd-search-icon" size={16} />
            <input
              className="cgd-search"
              type="text"
              placeholder="Search any city or state…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search city guides"
            />
          </div>
          <span className="cgd-result-count">
            {q
              ? `${filteredStates.length} states match`
              : "All states"}
          </span>
        </div>

        {/* STATE GRID */}
        <section className="cgd-group-block">
          <div className="cgd-group-heading">
            <h2>Browse by state</h2>
            <span className="cgd-rule" />
          </div>
          <div className="cgd-grid">
            {filteredStates.map((state, i) => (
              <StateCard
                key={state.stateSlug}
                index={i}
                state={state}
                searchMatch={!!q}
                refCallback={(el) => {
                  cardRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </section>

        {filteredStates.length === 0 && (
          <div className="cgd-empty cgd-show">
            No cities match &ldquo;{query}&rdquo;.
          </div>
        )}
      </main>
    </div>
  );
}

function StateCard({
  index,
  state,
  searchMatch,
  refCallback,
}: {
  index: number;
  state: CityGuideState;
  searchMatch: boolean;
  refCallback: (el: HTMLDetailsElement | null) => void;
}) {
  const idx = String(index + 1).padStart(2, "0");
  return (
    <article className="cgd-card">
      <details className="cgd-details" ref={refCallback}>
        <summary className="cgd-card-summary">
          <span className="cgd-card-index">
            <span className="cgd-index-rule" />
          </span>
          <span className="cgd-card-heading">
            <span className="cgd-card-title">{state.stateName}</span>
            <span className="cgd-card-subtitle">
              {state.cityCount} guides
            </span>
          </span>
          <span className="cgd-card-action" aria-hidden="true" />
        </summary>
        <div className="cgd-card-content">
          <ul className="cgd-city-list">
            {state.cities.map((c) => (
              <li key={c.slug}>
                <Link href={`/guides/${c.slug}`}>
                  <span>{c.city}</span>
                  <span className="cgd-link-arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </article>
  );
}
