import apiReference from "@/data/api-reference.json";

export type Endpoint = {
  method: string;
  path: string;
  title: string;
  description: string;
  auth: string | null;
  idempotent: string | null;
  rateLimit: string | null;
  requestBody: string | null;
  responseBody: string | null;
  queryParams: Array<Record<string, string>>;
  bodyParams: Array<Record<string, string>>;
  errorCodes: Array<Record<string, string>>;
  markdown: string;
};

export type Resource = {
  slug: string;
  name: string;
  intro: string;
  endpoints: Endpoint[];
};

export type Domain = {
  code: string;
  slug: string;
  name: string;
  owner: string | null;
  basePath: string | null;
  intro: string;
  resources: Resource[];
};

export type SimplePage = {
  slug: string;
  title: string;
  markdown: string;
};

export type ApiReference = {
  gettingStarted: SimplePage[];
  guides: SimplePage[];
  domains: Domain[];
  appendices: Record<
    string,
    { slug: string; title: string; markdown: string }
  >;
  stats: {
    gettingStartedPages: number;
    guidesPages: number;
    domains: number;
    resources: number;
    endpoints: number;
    appendices: number;
  };
};

export const api = apiReference as ApiReference;

// ── Lookups ──────────────────────────────────────────────────────────────

export function getDomain(slug: string): Domain | undefined {
  return api.domains.find((d) => d.slug === slug);
}

export function getResource(
  domainSlug: string,
  resourceSlug: string,
): { domain: Domain | undefined; resource: Resource | undefined } {
  const domain = getDomain(domainSlug);
  return {
    domain,
    resource: domain?.resources.find((r) => r.slug === resourceSlug),
  };
}

export function getGettingStarted(slug: string): SimplePage | undefined {
  return api.gettingStarted.find((p) => p.slug === slug);
}

export function getGuide(slug: string): SimplePage | undefined {
  return api.guides.find((p) => p.slug === slug);
}

export function getAppendix(slug: string) {
  return api.appendices[slug];
}

// ── Sidebar tree ─────────────────────────────────────────────────────────
// The sidebar is a flat list of groups. Each group has a label and a list
// of items. Items can be links or collapsible groups with children.

export type SidebarItem =
  | { type: "link"; label: string; href: string }
  | {
      type: "group";
      label: string;
      href?: string; // optional: group is also a link
      children: SidebarItem[];
    };

export type SidebarGroup = {
  label: string;
  items: SidebarItem[];
};

export const sidebarTree: SidebarGroup[] = [
  {
    label: "Getting Started",
    items: api.gettingStarted.map((p) => ({
      type: "link" as const,
      label: p.title,
      href: `/developers/developers/docs/getting-started/${p.slug}`,
    })),
  },
  {
    label: "Guides",
    items: api.guides.map((p) => ({
      type: "link" as const,
      label: p.title,
      href: `/developers/developers/docs/guides/${p.slug}`,
    })),
  },
  {
    label: "API Reference",
    items: api.domains.map((d) => ({
      type: "group" as const,
      label: d.name,
      href: `/developers/developers/docs/api-reference/${d.slug}`,
      children: d.resources.map((r) => ({
        type: "link" as const,
        label: r.name,
        href: `/developers/developers/docs/api-reference/${d.slug}/${r.slug}`,
      })),
    })),
  },
  {
    label: "Appendices",
    items: [
      {
        type: "link" as const,
        label: "UI Components",
        href: "/developers/developers/docs/appendices/ui-components",
      },
      {
        type: "link" as const,
        label: "Modals",
        href: "/developers/developers/docs/appendices/modals",
      },
      {
        type: "link" as const,
        label: "Feature Index",
        href: "/developers/developers/docs/appendices/feature-index",
      },
    ],
  },
];
