/**
 * Shared icon resolver for the admin's on-page module navigation and
 * the 14-panel flyout. The nav tree carries icons only on SECTIONS;
 * these heuristics give each child link a small plain-language icon
 * (matching the owner's reference screenshots: dollar icon on money
 * pages, truck on shipping, box on products…).
 */
import {
  BarChart3, Bell, Box, Calendar, Circle, CircleHelp, ClipboardList, Code, CreditCard,
  FileText, Gift, Globe, Landmark, LayoutGrid, LifeBuoy, Link2, Megaphone, Share2, SquarePen, Activity, Images, Send,
  Package, Palette, PackagePlus, RotateCcw, Scale, Search, Settings,
  ShieldCheck, ShoppingBag, Truck, UserCog, Users, type LucideIcon,
} from "lucide-react";

const RULES: Array<[RegExp, LucideIcon]> = [
  [/create post|compose/i, SquarePen],
  [/publishing queue/i, Send],
  [/content library/i, Images],
  [/performance/i, BarChart3],
  [/oversight/i, Activity],
  [/invoice|statement|order detail|payslip|document/i, FileText],
  [/payment|register|checkout|wallet/i, CreditCard],
  [/banking|bank/i, Landmark],
  [/deposit|escrow/i, Landmark],
  [/refund|return|rma|dispute/i, RotateCcw],
  [/gift/i, Gift],
  [/payroll|commission|customer|user|staff|seller/i, Users],
  [/tax|compliance|policy/i, Scale],
  [/report|analytic/i, BarChart3],
  [/ship|label|tracking|logistic/i, Truck],
  [/product|inventory|stock|catalog|listing|collection/i, Box],
  [/purchase|supplier|vendor|procurement/i, PackagePlus],
  [/fulfil/i, ClipboardList],
  [/search/i, Search],
  [/automation|notif/i, Bell],
  [/calendar|schedule/i, Calendar],
  [/integration|connect|social|share|partner|link/i, Link2],
  [/website|cms|seo|domain/i, Globe],
  [/fraud|risk|verification|moderation|appeal|audit|security/i, ShieldCheck],
  [/setting|configuration|preference/i, Settings],
  [/ticket|support|help/i, LifeBuoy],
  [/lead|crm/i, Users],
  [/design|studio|builder/i, Palette],
  [/ads|advert/i, Megaphone],
  [/publish/i, ShoppingBag],
];

/** Resolve an icon for a nav child from its label. Falls back to Circle. */
export function navChildIcon(label: string): LucideIcon {
  for (const [re, icon] of RULES) {
    if (re.test(label)) return icon;
  }
  return Circle;
}

/** Section-level icon resolution — the nav tree's icon keys. */
const SECTION_ICONS: Record<string, LucideIcon> = {
  LayoutGrid,
  Palette,
  Users,
  Package,
  Landmark,
  Megaphone,
  Share2,
  ShieldCheck,
  LifeBuoy,
  Globe,
  BarChart3,
  ShoppingBag,
  UserCog,
  CircleHelp,
  Code2: Code,
};

export function sectionIcon(key: string): LucideIcon {
  return SECTION_ICONS[key] ?? LayoutGrid;
}
