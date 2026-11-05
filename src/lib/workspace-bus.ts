/**
 * Cross-tab communication relay (Sunny's AppCrossTabRelay, adapted):
 * a BroadcastChannel named "unsaid-workspace-bus" carries data-change
 * events between the shell's tab frames and separate browser windows,
 * so when something changes in one place (a design is published, an
 * order is pushed), other open views can refresh themselves.
 *
 * Events are plain { type, payload } pairs. Known types:
 *   "products:changed"  — a design was published/unpublished
 *   "orders:changed"    — an order was pushed / status changed
 *   "content:changed"   — generic content edit
 */

export interface WorkspaceEvent {
  type: string;
  payload?: Record<string, unknown>;
}

const CHANNEL = "unsaid-workspace-bus";

export function broadcastWorkspaceEvent(type: string, payload?: Record<string, unknown>): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type, payload } satisfies WorkspaceEvent);
    bc.close();
  } catch {
    /* BroadcastChannel unsupported — same-window fallback below */
  }
  try {
    window.dispatchEvent(new CustomEvent("workspace-bus", { detail: { type, payload } }));
  } catch {
    /* noop */
  }
}

export function onWorkspaceEvent(handler: (e: WorkspaceEvent) => void): () => void {
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => handler(ev.data as WorkspaceEvent);
  } catch {
    bc = null;
  }
  const local = (ev: Event) => handler((ev as CustomEvent).detail as WorkspaceEvent);
  window.addEventListener("workspace-bus", local);
  return () => {
    try {
      bc?.close();
    } catch {
      /* noop */
    }
    window.removeEventListener("workspace-bus", local);
  };
}
