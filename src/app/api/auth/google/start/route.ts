import { GET } from "../route";

// ===========================================================================
// GET /api/auth/google/start
//
// The pattern's §4 name for the OAuth initiator. This is the SAME handler
// as GET /api/auth/google (aliased, not duplicated).
// ===========================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET };
