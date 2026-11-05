"use client";

// ---------------------------------------------------------------------------
// useTenantLocations — hydrates the shell's location state with the
// ACTIVE tenant's real locations from tenant_locations. There is no
// mock seed anywhere in this path: the zustand store starts empty and
// this hook is the only writer of the shell's location list.
//
//   source 'admin'  → GET /api/admin/locations?tenant_id=active
//                     (the portal_active_tenant cookie scopes it; the
//                     admin tenant switcher reloads the page, so a
//                     switch re-runs this and loads the new tenant's
//                     locations)
//   source 'public' → GET /api/locations (active locations; used by
//                     the non-admin portals whose sessions cannot pass
//                     the admin gate)
//
// After loading, the persisted selectedLocation is reconciled: if it
// names a location this tenant does not have (e.g. a stale value from
// before this wiring), it resets to the tenant's primary location —
// or to '' when the tenant has none, and the switchers hide.
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { useAppStore } from "@/lib/portal-store";
import type { LocationItem } from "@/lib/types";

interface TenantLocationRow {
  id: string;
  name: string;
  address: unknown;
  timezone?: string | null;
  is_primary?: boolean | null;
  is_active?: boolean | null;
}

function mapRow(row: TenantLocationRow): LocationItem {
  let street = "";
  let cityStateZip = "";
  let phone = "";
  let email = "";
  const addr = row.address;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    street = [a.line1, a.line2].filter((v) => typeof v === "string" && v).join(", ");
    const city = typeof a.city === "string" ? a.city : "";
    const state = typeof a.state === "string" ? a.state : "";
    const zip = typeof a.postal_code === "string" ? a.postal_code : "";
    cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (typeof a.phone === "string") phone = a.phone;
    if (typeof a.email === "string") email = a.email;
  } else if (typeof addr === "string" && addr.trim()) {
    // Master tenant's row stores the address as one string:
    // "699 Waring Rd, Memphis, TN 38122" — street, then the rest.
    const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
    street = parts[0] || "";
    cityStateZip = parts.slice(1).join(", ");
  }
  return {
    id: String(row.id),
    name: row.name,
    type: "Salon",
    address: street,
    cityStateZip,
    phone,
    email,
    manager: "",
    status: "Active",
    stationCount: 0,
    operatingHours: "",
    isDefault: Boolean(row.is_primary),
  };
}

export function useTenantLocations(source: "admin" | "public") {
  const setLocations = useAppStore((s) => s.setLocations);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          source === "admin" ? "/api/admin/locations?tenant_id=active" : "/api/locations",
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const rows: TenantLocationRow[] =
          source === "admin" ? (json?.data ?? []) : (json?.locations ?? []);
        if (cancelled || !Array.isArray(rows)) return;
        // The shell switches between ACTIVE locations; inactive rows
        // stay managed on the Locations settings screen itself.
        const items = rows
          .filter((r) => r && r.is_active !== false)
          .map(mapRow);
        setLocations(items);
        const state = useAppStore.getState();
        if (!items.some((l) => l.name === state.selectedLocation)) {
          const primary = items.find((l) => l.isDefault) || items[0];
          state.setSelectedLocation(primary ? primary.name : "");
        }
      } catch {
        /* locations stay empty — switchers hide rather than invent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, setLocations]);
}
