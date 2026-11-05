import type { Metadata } from "next";
import { listPolicies } from "@/lib/trust/trust";
import { PolicyManager } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Policies — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const { policies, migrationPending } = await listPolicies();
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Policy management</h1>
      </div>
      <PolicyManager policies={policies} migrationPending={migrationPending} />
    </div>
  );
}
