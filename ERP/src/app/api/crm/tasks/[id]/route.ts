import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * PATCH /api/crm/tasks/[id] — update a task.
 * Body: { status?, completed_at?, priority?, due_at?, title? }
 * status='done' → completed_at = now (unless explicitly provided);
 * moving away from 'done' clears completed_at.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('title' in body && typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if ('priority' in body && typeof body.priority === 'string' && body.priority) updates.priority = body.priority;
  if ('due_at' in body) updates.due_at = body.due_at ?? null;

  if (typeof body.status === 'string' && body.status) {
    updates.status = body.status;
    if (body.status === 'done') {
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_at = null;
    }
  }
  // Explicit completed_at always wins (covers "done with a specific timestamp")
  if ('completed_at' in body) updates.completed_at = body.completed_at ?? null;

  const { data, error } = await supabaseAdmin()
    .from('crm_tasks')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Task not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data });
}
