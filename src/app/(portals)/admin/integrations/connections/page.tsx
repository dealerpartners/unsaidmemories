import type { Metadata } from "next";
import Subnav from "../subnav";
import ConnectionsClient from "./connections-client";

export const metadata: Metadata = { title: "Connections & Keys — Admin" };
export const dynamic = "force-dynamic";

export default function ConnectionsPage() {
  return (
    <div>
      <Subnav />
      <h1 style={{ marginBottom: 6 }}>Connections &amp; Keys</h1>
      <p style={{ marginBottom: 22 }}>
        <a
          className="btn btn-primary"
          href="/admin/integrations/connect"
          data-tip="Connect one service the guided way: pick it, see what it does and what to have ready, then paste its key. It saves to this same page — nothing is different underneath, just explained step by step."
        >
          Connect a service — step by step →
        </a>
      </p>
      <ConnectionsClient />
    </div>
  );
}
