"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Reusable horizontal-scroll arrows. Sit on either side of a scrollable
// row, advance by one card+gap per click; the next arrow hides at the
// end and the previous arrow hides at the start. Re-checks on scroll,
// resize, and a delayed mount check (images/layout may not have settled
// when the effect first runs).
export function RowScrollArrow({
  gridSelector,
  arrowClassName = "collection-scroll-arrow",
}: {
  gridSelector: string;
  arrowClassName?: string;
}) {
  const [atEnd, setAtEnd] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const gridRef = useRef<HTMLElement | null>(null);

  const check = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    // Only hide the next arrow if the row can actually scroll AND we're
    // at the end. If scrollWidth <= clientWidth the row hasn't
    // overflowed yet — the end state also covers that case.
    const canScroll = el.scrollWidth > el.clientWidth + 2;
    setAtEnd(!canScroll || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    setAtStart(!canScroll || el.scrollLeft <= 2);
  }, []);

  useEffect(() => {
    const grid = document.querySelector<HTMLElement>(gridSelector);
    if (!grid) return;
    gridRef.current = grid;
    check();
    // Re-check after a beat — flexbox + images settle late.
    const t1 = setTimeout(check, 200);
    const t2 = setTimeout(check, 1000);
    grid.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(grid);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      grid.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [gridSelector, check]);

  function step(direction: 1 | -1) {
    const el = gridRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".collection-card, .department-card, .product-card");
    if (!card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    el.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
  }

  return (
    <>
      {!atStart && (
        <button
          type="button"
          className={`${arrowClassName} scroll-arrow-prev`}
          onClick={() => step(-1)}
          aria-label="See previous cards"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          className={arrowClassName}
          onClick={() => step(1)}
          aria-label="See more cards"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </>
  );
}
