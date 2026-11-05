"use client";

// Home hero visual: the photo layer and its legibility shade stay
// invisible (opacity 0 over the section's white) until the hero
// photo itself has loaded, then both fade in together. Before this,
// the shade painted instantly over an empty hero, which read as a
// gray block standing in front of the photo while it downloaded.
// The section behind is white, so the pre-load state is clean white,
// never gray. A failed image still reveals the shade (onError) so
// the hero copy never sits trapped behind a broken photo.

import { useEffect, useState } from "react";

export default function HeroVisual({ imageUrl }: { imageUrl: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setLoaded(true);
    img.src = imageUrl;
    if (img.complete && img.naturalWidth > 0) setLoaded(true);
  }, [imageUrl]);

  const state = loaded ? " is-loaded" : "";
  return (
    <>
      <div
        className={`hero-image${state}`}
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
      <div className={`hero-shade${state}`} />
    </>
  );
}
