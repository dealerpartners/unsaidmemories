// ===========================================================================
// lib/ai/tool-intents.ts — M6: the ONE map from a Kinnect tool name to the
// intent it must carry. Shared by the router (intent-router.ts) and the
// executor (kinnect/tools.ts) so the two can never disagree about what a
// tool exercises — and so neither imports the other (no import cycle).
//
// The six rows below mirror the platform_tools seeds in migration
// 20261189 AND the KINNECT_TOOLS definitions in lib/kinnect/tools.ts.
// The database rows are the authority at runtime (the router reads them
// on every intent); this map is the compile-time contract the executor
// checks a presented token against. If a tool is added, all three places
// change together — that is §7.0's "no new AI tool without a registry
// row and a purpose code", enforced by construction.
// ===========================================================================

export interface ToolIntent {
  /** Platform capability the tool exercises (platform_capabilities). */
  capability: string;
  /** Platform object the tool touches. */
  objectType: string;
  /** The purpose code this tool serves (ai_purposes). */
  purpose: string;
  /** Governor key (kinnect/governor) for the user's Manage controls. */
  governorCapability: string;
}

export const TOOL_INTENTS: Record<string, ToolIntent> = {
  search_products: {
    capability: "offering.discover",
    objectType: "offering",
    purpose: "shopping.browse",
    governorCapability: "shopping_help",
  },
  add_to_bag: {
    capability: "offering.discover",
    objectType: "offering",
    purpose: "shopping.add_to_bag",
    governorCapability: "shopping_help",
  },
  list_my_pets: {
    capability: "pet.inspect",
    objectType: "pet",
    purpose: "pets.view_own",
    governorCapability: "pet_records",
  },
  create_pet: {
    capability: "pet.draft",
    objectType: "pet",
    purpose: "pets.create_own",
    governorCapability: "pet_creation",
  },
  lookup_orders: {
    capability: "order.inspect",
    objectType: "order",
    purpose: "orders.view_own",
    governorCapability: "order_lookup",
  },
  get_breed_info: {
    capability: "insight.discover",
    objectType: "insight",
    purpose: "care.breed_info",
    governorCapability: "care_reminders",
  },
};

export const TOOL_NAMES = Object.keys(TOOL_INTENTS);
