import Link from "next/link";
import { Bookmark, CirclePlus, TriangleAlert } from "lucide-react";
import {
  SETTINGS_GROUPS, SETTINGS_HOME_EXTRA, SETTINGS_HOME_PATH,
  settingsItemBySlug, type SettingsItem,
} from "@/lib/admin/settings-nav";
import { settingsIcon, TILE_CLASSES } from "@/components/admin/settings-icons";

function groupItems(id: string): SettingsItem[] {
  return SETTINGS_GROUPS.find((g) => g.id === id)?.items ?? [];
}

function bySlug(slug: string): SettingsItem {
  const item = settingsItemBySlug(slug);
  if (!item) throw new Error(`settings item missing: ${slug}`);
  return item;
}

function Card({ item, dashed }: { item: SettingsItem; dashed?: boolean }) {
  const Icon = settingsIcon(item.icon);
  return (
    <Link
      href={`${SETTINGS_HOME_PATH}/${item.slug}`}
      className={`flex gap-4 rounded-xl p-4 transition hover:border-[#becab6] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] ${
        dashed ? "border border-dashed border-[#dad9dd] bg-[#faf9fc]" : "border border-[#dad9dd] bg-white"
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TILE_CLASSES[item.tile]}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="mb-0.5 flex items-center gap-1">
          <h4 className="text-[14px] font-semibold text-[#1a1c1e]">{item.homeLabel ?? item.label}</h4>
          {item.warning && <TriangleAlert size={12} className="text-[#f59e0b]" />}
          {dashed && <CirclePlus size={16} className="text-[#7c3aed]" />}
        </div>
        <p className="text-[12px] leading-tight text-[#5a6355]">{item.description}</p>
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h3 className="mb-4 text-[16px] font-semibold text-[#1a1c1e]">{title}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * Settings Home — Sunny's card grid, section by section as drawn in
 * settings_admin.html. Every card is a real route under /admin/settings.
 */
export default function SettingsHomePage() {
  const workspace = groupItems("workspace");
  const referralsAt = workspace.findIndex((i) => i.slug === "office-hours") + 1;
  const outboundExtras = SETTINGS_HOME_EXTRA.find((s) => s.section === "Outbound")?.items ?? [];
  const ReferralsIcon = settingsIcon("Store");

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-[#dad9dd] bg-white px-8">
        <div className="flex items-center gap-3">
          <Bookmark size={20} className="text-[#5a6355]" />
          <h2 className="text-[16px] font-semibold text-[#1a1c1e]">Home</h2>
        </div>
      </header>

      <div className="max-w-[1100px] p-8">
        <Section title="Workspace">
          {workspace.slice(0, referralsAt).map((i) => <Card key={i.slug} item={i} />)}
          {/* Referrals — drawn disabled in his file; kept as drawn. */}
          <div className="flex cursor-not-allowed gap-4 rounded-xl border border-[#dad9dd] bg-white p-4 opacity-50">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TILE_CLASSES.purple}`}>
              <ReferralsIcon size={20} />
            </div>
            <div>
              <div className="mb-0.5 flex items-center gap-2">
                <h4 className="text-[14px] font-semibold text-[#1a1c1e]">Referrals</h4>
                <span className="rounded bg-[#e8f5e9] px-1.5 py-0.5 text-[9px] font-bold text-[#0a6400]">Earn $250</span>
              </div>
              <p className="text-[12px] leading-tight text-[#5a6355]">Get $250 in Intercom credit when you refer a business.</p>
            </div>
          </div>
          {workspace.slice(referralsAt).map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="Accounting & Finance">
          {groupItems("accounting").map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="CRM & Contacts">
          {groupItems("crm").map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="Catalog & Design">
          {groupItems("catalog").map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="Marketing & Social">
          {groupItems("marketing").map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="Operations & Orders">
          {["fulfillment-shipping", "inventory-warehouses", "support-channels"].map((s) => (
            <Card key={s} item={bySlug(s)} />
          ))}
        </Section>

        <Section title="Help Center">
          <Card item={bySlug("help-center")} />
          <Card item={bySlug("help-centers-all")} />
          <Card item={bySlug("help-centers-new")} dashed />
        </Section>

        <Section title="Outbound">
          {outboundExtras.map((i) => <Card key={i.slug} item={i} />)}
        </Section>

        <Section title="Personal">
          {["personal-details", "personal-security", "notifications", "personal-visible", "api-tokens", "personal-account-access", "multilingual"].map((s) => (
            <Card key={s} item={bySlug(s)} />
          ))}
        </Section>
      </div>
    </>
  );
}
