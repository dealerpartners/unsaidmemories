// Product slug helpers — SEO-friendly product URLs.
// URL format: /product/[slugified-name]-[uuid]
// e.g. /product/kids-knitted-relaxed-fit-crewneck-sweater-246e322c-e2b9-44db-bc9e-2608131e01ed
// The product name is first (for SEO/indexability), the UUID is last (for
// unique lookup). parseProductId extracts the UUID from the end of the slug.

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function productSlug(name: string, id: string): string {
  return `${slugify(name)}-${id}`;
}

// A UUID is 36 chars (8-4-4-4-12 hex with dashes). Extract it from the tail
// of the slug. Falls back to the whole string if it doesn't end in a UUID.
export function parseProductId(slug: string): string {
  const tail = slug.slice(-36);
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return uuidRe.test(tail) ? tail : slug;
}
