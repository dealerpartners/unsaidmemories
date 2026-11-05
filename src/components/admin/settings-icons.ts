import {
  ArrowRightLeft, Bell, BellRing, Blocks, BookOpen, ChartColumn,
  ChevronDown, ChevronRight, CircleDollarSign, Clock, Eye, Filter, Gavel,
  Headset, Home, IdCard, KeyRound, Landmark, Languages, LayoutGrid, Lock,
  Mail, Mails, MapPin, Megaphone, Menu, MousePointerClick, Package, Palette,
  Plus, ReceiptText, Share2, Shapes, Shield, SlidersHorizontal, Store, Tag,
  TriangleAlert, Truck, Users, UsersRound, Warehouse, X,
  type LucideIcon,
} from "lucide-react";

export const SETTINGS_ICONS: Record<string, LucideIcon> = {
  Menu, IdCard, UsersRound, Clock, Store, Shield, Languages, Landmark,
  ArrowRightLeft, ReceiptText, Gavel, ChartColumn, CircleDollarSign,
  Users, Filter, Mail, Palette, Package, Tag, Shapes, Megaphone, Share2,
  MousePointerClick, MapPin, Truck, Warehouse, Headset, BookOpen,
  BellRing, Blocks, Lock, Bell, KeyRound, LayoutGrid, Plus,
  SlidersHorizontal, Mails, Eye, Home, ChevronDown, ChevronRight,
  TriangleAlert, X,
};

export function settingsIcon(name: string): LucideIcon {
  return SETTINGS_ICONS[name] ?? Menu;
}

export const TILE_CLASSES: Record<string, string> = {
  purple: "bg-[#e8def8] text-[#4a148c]",
  pink: "bg-[#fce4ec] text-[#c2185b]",
  blue: "bg-[#e3f2fd] text-[#1565c0]",
  green: "bg-[#e8f5e9] text-[#2e7d32]",
  orange: "bg-[#fff3e0] text-[#e65100]",
  teal: "bg-[#e0f2f1] text-[#00695c]",
};
