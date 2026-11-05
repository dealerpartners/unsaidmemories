import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const dynamic = "force-dynamic";

// J6 · AI agent registry + MCP connection registry (migration 20261110).
// Agents are platform records (tenant_id NULL) or tenant-scoped; Kinnect
// is the first-class entry. MCP connections are a REGISTRY: a row's status
// is 'registered' until the check action performs a real HTTP probe of the
// endpoint and records the outcome (ok/latency/error) — the status only
// ever becomes 'connected' from a measured successful probe.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AGENT_COLS = `id, tenant_id, key, name, description, capabilities, status, created_at, updated_at`;
const MCP_COLS = `id, tenant_id, name, endpoint_url, transport, status, last_checked_at,
                  last_check_ok, last_latency_ms, last_error, created_at, updated_at`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: agents } = await c.query(
        `SELECT ${AGENT_COLS} FROM public.ai_agents
          WHERE tenant_id IS NULL OR tenant_id = $1
          ORDER BY (tenant_id IS NULL) DESC, name`,
        [tenant]
      );
      const { rows: mcp } = await c.query(
        `SELECT ${MCP_COLS} FROM public.ai_mcp_connections
          WHERE tenant_id IS NULL OR tenant_id = $1
          ORDER BY name`,
        [tenant]
      );
      return { agents, mcp_connections: mcp };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "registries failed (is migration 20261110 applied?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const action = String(b.action || "");
  const actorId = await getActorIdFromRequest(req);
  try {
    if (action === "create_agent") {
      const key = String(b.key || "").trim().toLowerCase();
      const name = String(b.name || "").trim();
      if (!key || !/^[a-z0-9][a-z0-9-_]*$/.test(key)) {
        return NextResponse.json({ error: "key is required (lowercase letters, digits, - or _)" }, { status: 400 });
      }
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      const capabilities = Array.isArray(b.capabilities) ? b.capabilities.map((x: unknown) => String(x)) : [];
      const out = await withPgStrict(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO public.ai_agents (tenant_id, key, name, description, capabilities, created_by)
           VALUES (NULL, $1, $2, $3, $4::jsonb, $5) RETURNING ${AGENT_COLS}`,
          [key, name, b.description ? String(b.description) : null, JSON.stringify(capabilities), actorId]
        );
      if (!rows[0]) throw new Error("AI agent insert did not land");
        return { agent: rows[0] };
      });
      if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      return NextResponse.json(out, { status: 201 });
    }
    if (action === "set_agent_status") {
      const id = String(b.id || "");
      const status = String(b.status || "");
      if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
      if (!["active", "disabled"].includes(status)) {
        return NextResponse.json({ error: "status must be active or disabled" }, { status: 400 });
      }
      const out = await withPg(async (c) => {
        const { rows } = await c.query(
          `UPDATE public.ai_agents SET status = $2, updated_at = now()
            WHERE id = $1::uuid AND (tenant_id IS NULL OR tenant_id = $3)
            RETURNING ${AGENT_COLS}`,
          [id, status, tenant]
        );
        return rows[0] ? { agent: rows[0] } : { missing: true as const };
      });
      if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      if ((out as any).missing) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      return NextResponse.json(out);
    }
    if (action === "create_mcp") {
      const name = String(b.name || "").trim();
      const endpoint = String(b.endpoint_url || "").trim();
      const transport = ["http", "sse", "stdio"].includes(String(b.transport)) ? String(b.transport) : "http";
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      if (!endpoint) return NextResponse.json({ error: "endpoint_url is required" }, { status: 400 });
      if (transport !== "stdio" && !/^https?:\/\//i.test(endpoint)) {
        return NextResponse.json({ error: "endpoint_url must be an http(s) URL for http/sse transports" }, { status: 400 });
      }
      const out = await withPgStrict(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO public.ai_mcp_connections (tenant_id, name, endpoint_url, transport, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${MCP_COLS}`,
          [tenant, name, endpoint, transport, actorId]
        );
      if (!rows[0]) throw new Error("MCP connection insert did not land");
        return { connection: rows[0] };
      });
      if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      return NextResponse.json(out, { status: 201 });
    }
    if (action === "check_mcp") {
      const id = String(b.id || "");
      if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
      const found = await withPg(async (c) => {
        const { rows } = await c.query(
          `SELECT id, endpoint_url, transport FROM public.ai_mcp_connections
            WHERE id = $1::uuid AND (tenant_id IS NULL OR tenant_id = $2)`,
          [id, tenant]
        );
        return rows[0] ?? null;
      });
      if (!found) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      // The probe: a real HTTP request to the registered endpoint. Any
      // HTTP response (even 4xx) proves reachability of the server; a
      // network failure records 'unreachable' with the actual error.
      let ok = false;
      let latency: number | null = null;
      let errorText: string | null = null;
      if (found.transport === "stdio") {
        errorText = "stdio transport cannot be probed over HTTP from the admin — check runs on the host process.";
      } else {
        const started = Date.now();
        try {
          const res = await fetch(String(found.endpoint_url), {
            method: "GET",
            signal: AbortSignal.timeout(8000),
          });
          latency = Date.now() - started;
          ok = res.status < 500;
          if (!ok) errorText = `HTTP ${res.status}`;
        } catch (e: any) {
          latency = Date.now() - started;
          errorText = e?.message ? String(e.message).slice(0, 300) : "probe failed";
        }
      }
      const out = await withPg(async (c) => {
        const { rows } = await c.query(
          `UPDATE public.ai_mcp_connections
              SET status = $2, last_checked_at = now(), last_check_ok = $3,
                  last_latency_ms = $4, last_error = $5, updated_at = now()
            WHERE id = $1::uuid
            RETURNING ${MCP_COLS}`,
          [id, ok ? "connected" : "unreachable", ok, latency, errorText]
        );
        return { connection: rows[0] };
      });
      if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      return NextResponse.json(out);
    }
    return NextResponse.json(
      { error: "action must be create_agent|set_agent_status|create_mcp|check_mcp" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "registry action failed" }, { status: 500 });
  }
}
