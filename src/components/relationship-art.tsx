"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

// Cursor-driven parallax for the relationship band's orbital art.
// Writes CSS custom properties directly to the DOM (no React re-renders).
// Used on the home page and on /relationships.
export function RelationshipArt() {
  const artRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const handleArtMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = artRef.current;
    if (!el || reducedMotion.current) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--px", ((e.clientX - rect.left) / rect.width - 0.5).toFixed(4));
    el.style.setProperty("--py", ((e.clientY - rect.top) / rect.height - 0.5).toFixed(4));
  };

  const handleArtLeave = () => {
    const el = artRef.current;
    if (!el) return;
    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
  };

  return (
    <div
      className="relationship-art"
      ref={artRef}
      onMouseMove={handleArtMove}
      onMouseLeave={handleArtLeave}
    >
      <div className="gradient-orb orb-one" />
      <div className="gradient-orb orb-two" />
      <div className="orbit-ring ring-one" />
      <div className="orbit-ring ring-two" />
      <span className="orbit-word word-one">KIN</span>
      <span className="orbit-word word-two">CHOSEN</span>
      <span className="orbit-word word-three">ALWAYS</span>
      <div className="center-mark">u<span>.</span></div>
    </div>
  );
}
