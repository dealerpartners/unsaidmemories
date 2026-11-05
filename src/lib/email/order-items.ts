// Order-item images + the item-rows block for order emails.
//
// The hosted order designs carry ONE item block ({{{ITEM_LIST}}},
// unescaped) — this module builds it as designed rows: the product's
// own picture, its name, quantity, and line price. The picture is the
// requirement: a customer must SEE what they ordered. Items whose
// image cannot be resolved render name-only — never a broken image.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailableItem {
  name: string;
  qty: string | number;
  price: string;
  imageUrl?: string;
}

/** The rows that pour into the hosted designs' item block. */
export function itemListHtml(items: EmailableItem[]): string {
  if (!items.length) return "";
  const rows = items
    .map(
      (it) => `<tr>
      <td width="74" style="padding:10px 0 10px 4px;border-bottom:1px solid #e7e5e4;">${it.imageUrl ? `<img src="${esc(it.imageUrl)}" width="52" height="52" alt="" style="display:block;border-radius:8px;object-fit:cover;"/>` : ``}</td>
      <td style="padding:10px 12px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#1a1a1a;border-bottom:1px solid #e7e5e4;">${esc(it.name)}</td>
      <td align="center" width="60" style="padding:10px 6px;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#78716c;border-bottom:1px solid #e7e5e4;">&times;&nbsp;${esc(String(it.qty))}</td>
      <td align="right" width="104" style="padding:10px 4px 10px 8px;font-family:'DM Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1a1a1a;border-bottom:1px solid #e7e5e4;">${esc(it.price)}</td>
    </tr>`,
    )
    .join("");
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`;
}

function pickImage(p: any): string | undefined {
  if (!p) return undefined;
  if (typeof p.image_url === "string" && p.image_url) return p.image_url;
  const imgs = Array.isArray(p.images) ? p.images : [];
  const first = imgs.find((x: any) => typeof x === "string" && x) || (typeof imgs[0]?.url === "string" ? imgs[0].url : undefined);
  return first || undefined;
}

/**
 * Resolve each order_items row's product image.
 * rows: [{ id, supplier_catalog_variant_id, product_id }] — returns
 * Map<rowId, imageUrl>. Catalog items resolve variant → product;
 * native items resolve through the catalog mirror (a published
 * catalog product lives in `products` under the SAME id).
 */
export async function resolveOrderItemImages(
  supabase: any,
  rows: { id: string; supplier_catalog_variant_id?: string | null; product_id?: string | null }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const variantIds = [...new Set(rows.map((r) => r.supplier_catalog_variant_id).filter(Boolean))] as string[];
  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];
  const variantImage = new Map<string, string>();
  const productImage = new Map<string, string>();

  if (variantIds.length) {
    const { data } = await supabase
      .from("supplier_catalog_variants")
      .select("id, supplier_catalog_products ( image_url, images )")
      .in("id", variantIds);
    for (const v of (data || []) as any[]) {
      const img = pickImage(v.supplier_catalog_products);
      if (img) variantImage.set(v.id, img);
    }
  }
  if (productIds.length) {
    const { data } = await supabase
      .from("supplier_catalog_products")
      .select("id, image_url, images")
      .in("id", productIds);
    for (const p of (data || []) as any[]) {
      const img = pickImage(p);
      if (img) productImage.set(p.id, img);
    }
  }
  for (const r of rows) {
    const img =
      (r.supplier_catalog_variant_id && variantImage.get(r.supplier_catalog_variant_id)) ||
      (r.product_id && productImage.get(r.product_id)) ||
      undefined;
    if (img) out.set(r.id, img);
  }
  return out;
}
