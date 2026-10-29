import { NextResponse } from 'next/server';
import { createMetricoolDraft } from '@/lib/social';
export async function POST(req: Request) {
  const body = await req.json();
  const result = await createMetricoolDraft(body);
  return NextResponse.json(result);
}
