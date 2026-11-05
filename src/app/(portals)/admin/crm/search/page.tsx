import type { Metadata } from "next";
import GlobalSearch from "@/components/crm/GlobalSearch";

export const metadata: Metadata = { title: "Global Search — CRM" };
export const dynamic = "force-dynamic";

export default function CrmSearchPage() {
  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Global search</h1>
        </div>
      </div>
      <GlobalSearch />
    </div>
  );
}
