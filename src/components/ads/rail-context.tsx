"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* Shared channel between the ads layout's Contextual Right Rail and the
   campaign creation / editing pages inside it. A page publishes the
   configuration it is working with (budget, placements, the campaign
   being edited); the rail reads it and computes real estimates, policy
   state and recommendations from the live APIs. With nothing published,
   the rail shows honest empty states — never sample numbers. */

export type RailConfig = {
  campaignId?: string;
  budgetDollars?: number;
  placementKeys?: string[];
  days?: number;
  specialCategory?: string | null;
};

const RailCtx = createContext<{ config: RailConfig; setConfig: (c: RailConfig) => void }>({
  config: {},
  setConfig: () => {},
});

export function RailConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RailConfig>({});
  return <RailCtx.Provider value={{ config, setConfig }}>{children}</RailCtx.Provider>;
}

export function useRailConfig() {
  return useContext(RailCtx);
}

/** Publish this page's working configuration to the rail while mounted. */
export function usePublishRailConfig(cfg: RailConfig) {
  const { setConfig } = useRailConfig();
  const key = JSON.stringify(cfg);
  useEffect(() => {
    setConfig(JSON.parse(key) as RailConfig);
    return () => setConfig({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
