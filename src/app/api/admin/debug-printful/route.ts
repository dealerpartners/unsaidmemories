import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";

// Debug endpoint — calls Printful V1 API from Vercel
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const printfulKey = process.env.PRINTFUL_API_KEY;
  if (!printfulKey) return NextResponse.json({ error: "No PRINTFUL_API_KEY" }, { status: 500 });

  try {
    const res = await fetch("https://api.printful.com/products?limit=3", {
      headers: { Authorization: `Bearer ${printfulKey}` },
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    const products = data.result || [];
    return NextResponse.json({
      status: res.status,
      count: products.length,
      firstProduct: products[0] || null,
      firstProductKeys: products[0] ? Object.keys(products[0]) : [],
      hasImageUrl: products[0]?.image_url ? true : false,
      imageUrl: products[0]?.image_url || null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
