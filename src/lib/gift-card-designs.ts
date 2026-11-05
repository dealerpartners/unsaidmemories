import { withPg, TENANT_ID } from "@/lib/crm/enterprise"

export type GiftCardDesign = { id: string; name: string; imageUrl: string; published: boolean; sortOrder: number }

const map = (r: any): GiftCardDesign => ({
  id: r.id,
  name: r.name,
  imageUrl: r.image_url,
  published: r.published,
  sortOrder: r.sort_order,
})

export async function listGiftCardDesigns(publishedOnly: boolean): Promise<GiftCardDesign[]> {
  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id, name, image_url, published, sort_order
         FROM public.commerce_gift_card_designs
        WHERE tenant_id = $1 ${publishedOnly ? "AND published" : ""}
        ORDER BY sort_order, created_at`,
      [TENANT_ID()],
    )
    return rows
  })
  return (rows || []).map(map)
}

export async function getPublishedDesign(id: string): Promise<GiftCardDesign | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT id, name, image_url, published, sort_order
         FROM public.commerce_gift_card_designs
        WHERE id = $1 AND tenant_id = $2 AND published`,
      [id, TENANT_ID()],
    )
    return rows
  })
  return rows?.[0] ? map(rows[0]) : null
}
