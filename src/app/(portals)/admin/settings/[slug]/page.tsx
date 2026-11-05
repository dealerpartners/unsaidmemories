import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { findSettingsItem } from "@/lib/admin/settings-nav";
import { settingsIcon, TILE_CLASSES } from "@/components/admin/settings-icons";

const SETUP = {
  label: "Get set up",
  description:
    "Business profile, connect bank, set up payments, invoice branding, and your goals — the company setup wizard.",
  drives:
    "Company setup state: until setup completes, the workspace runs on defaults and the Settings sidebar keeps the setup card pinned.",
};

/**
 * One real route per settings component. Until a section's own build
 * lands, the page states plainly what the component is, what it
 * drives, and where its current fragments live — nothing here pretends
 * to be wired before it is.
 */
export default async function SettingsItemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = slug === "setup" ? null : findSettingsItem(slug);
  if (slug !== "setup" && !item) notFound();

  const label = item ? item.label : SETUP.label;
  const description = item ? item.description : SETUP.description;
  const drives = item ? item.drives : SETUP.drives;
  const Icon = item ? settingsIcon(item.icon) : settingsIcon("Blocks");

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-[#dad9dd] bg-white px-8">
        <div className="flex items-center gap-3">
          {item && (
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${TILE_CLASSES[item.tile]}`}>
              <Icon size={18} />
            </span>
          )}
          <h2 className="text-[16px] font-semibold text-[#1a1c1e]">{label}</h2>
          {item?.warning && <TriangleAlert size={14} className="text-[#f59e0b]" />}
        </div>
      </header>

      <div className="max-w-[1100px] p-8">
        <p className="max-w-[560px] text-[14px] leading-relaxed text-[#1a1c1e]">{description}</p>

        <div className="mt-8 max-w-[560px] rounded-xl border border-[#dad9dd] bg-white p-5">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#5a6355]">
            What this drives
          </h3>
          <p className="text-[13px] leading-relaxed text-[#1a1c1e]">{drives}</p>
        </div>

        {item?.existing && item.existing.length > 0 && (
          <div className="mt-4 max-w-[560px] rounded-xl border border-[#dad9dd] bg-white p-5">
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#5a6355]">
              Current homes — these fold in here
            </h3>
            <ul className="space-y-1.5">
              {item.existing.map((e) => (
                <li key={e.href}>
                  <Link
                    href={e.href}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[#0055a5] hover:underline"
                  >
                    {e.label} <ArrowUpRight size={13} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-8 text-[12px] text-[#5a6355]">
          This section&apos;s own page is being wired to the contract above.
        </p>
      </div>
    </>
  );
}
