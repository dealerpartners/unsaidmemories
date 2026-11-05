"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Broken-image logic (Sunny, 2026-11-04): a dead image URL must never
 * reach the shopper as a broken glyph. SafeImage walks its fallback
 * chain when a source fails, and when every source has failed it
 * renders the branded placeholder block instead of an <img>.
 */
export function ImagePlaceholder({ label }: { label?: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f1f6",
      }}
    >
      <span
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: "44px",
          color: "#b9b0c4",
          lineHeight: 1,
        }}
      >
        {(label ?? "U").trim().charAt(0).toUpperCase() || "U"}
      </span>
    </div>
  );
}

type SafeImageProps = {
  src: string | null | undefined;
  /** Other URLs to try, in order, when a source fails. */
  fallbacks?: string[];
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  className?: string;
};

export function SafeImage({ src, fallbacks = [], alt, ...rest }: SafeImageProps) {
  const chain = Array.from(new Set([src, ...fallbacks].filter((u): u is string => !!u)));
  const [idx, setIdx] = useState(0);
  const [dead, setDead] = useState(false);

  if (dead || idx >= chain.length) {
    return <ImagePlaceholder label={alt} />;
  }
  return (
    <Image
      unoptimized
      src={chain[idx]}
      alt={alt}
      onError={() => {
        if (idx + 1 < chain.length) setIdx(idx + 1);
        else setDead(true);
      }}
      {...rest}
    />
  );
}
