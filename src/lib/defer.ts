// ---------------------------------------------------------------------------
// deferWork — run fire-and-forget work AFTER the response, not inside it.
//
// The platform's supported mechanism is `after()` from next/server (Next 16):
// the response returns immediately and the platform keeps the invocation
// alive until the callback settles — the fix for both failure modes of the
// old patterns (a bare un-awaited promise can be frozen mid-send on
// serverless, leaving the work half-done; awaiting it inline puts the full
// latency on the customer's wait).
//
// Literal `waitUntil` does NOT exist in this runtime: zero usages in src
// and `@vercel/functions` is not installed — `after()` is the equivalent
// the platform actually supports, and it is already the established pattern
// in this repo (src/app/api/shop/checkout/intent/route.ts, salon alert).
//
// Delivery semantics are UNCHANGED: the same send function runs, in the same
// process, with the same arguments; only the timing moves (after the
// response instead of before it). A task failure is logged, never thrown
// into the response — every caller converted through here already treated
// the work as failure-isolated (result ignored or .catch-logged).
//
// No request context (a lib function called from a cron worker, a script,
// or a test): `after()` throws synchronously, and deferWork falls back to
// awaiting the task inline — exactly the old behavior, never a dropped task.
// Callers that NEED the result (the response branches on ok/error, or the
// caller returns the messageId) must NOT use this helper.
// ---------------------------------------------------------------------------

import { after } from "next/server"

export async function deferWork(task: () => Promise<unknown>): Promise<void> {
  try {
    after(async () => {
      try {
        await task()
      } catch (e: any) {
        console.error("[defer] background task failed:", e?.message || String(e))
      }
    })
    return
  } catch {
    // Outside a request scope — preserve the old behavior: await inline.
    try {
      await task()
    } catch (e: any) {
      console.error("[defer] background task failed:", e?.message || String(e))
    }
  }
}
