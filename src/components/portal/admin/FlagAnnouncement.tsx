"use client";

// K5 · FlagAnnouncement — the feature-flag consumer surface. One
// instance per portal shell (and one global maintenance instance in
// the root layout): it reads the flags section of the page's shared
// session bootstrap (lib/session-bootstrap) and, when its flag key
// is enabled for the caller's audience, renders the flag's recorded
// description as an announcement bar. Flag absent or off → renders
// nothing (the store's contract: absence reads OFF). Announcements
// are the enhancement surface flags gate — never a core feature.

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { loadSessionBootstrap } from "@/lib/session-bootstrap";

// Slice 2: flags arrive on the page's ONE session bootstrap call —
// no separate /api/portal/flags request per pageview. Parsing is
// unchanged: bootstrap's flags/details sections ARE the flags
// endpoint's body, and its flag rows ride that endpoint's 60s cache.

export default function FlagAnnouncement({
  flagKey,
  tone = "default",
}: {
  flagKey: string;
  tone?: "default" | "alert";
}) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadSessionBootstrap().then((j) => {
      if (!live) return;
      if (j?.flags?.[flagKey]) {
        const d = (j.details || []).find((x: any) => x.key === flagKey);
        setMessage(d?.description || "Announcement");
      }
    });
    return () => {
      live = false;
    };
  }, [flagKey]);

  if (!message) return null;
  return (
    <div
      className={
        tone === "alert"
          ? "flex items-center gap-2 bg-amber-500 px-4 py-2 text-[13px] font-medium text-amber-950"
          : "flex items-center gap-2 bg-primary/10 px-4 py-2 text-[13px] text-foreground"
      }
      role="status"
    >
      <Megaphone className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
