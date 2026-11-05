"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export type FooterLink = { label: string; href: string; action?: "shoppy" };

export function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  const setAssistantOpen = useStore((s) => s.setAssistantOpen);
  return (
    <div className="footer-column">
      <h3>{title}</h3>
      {links.map((link) =>
        link.action === "shoppy" ? (
          <button
            key={link.label}
            type="button"
            className="footer-column-linkbtn"
            onClick={() => setAssistantOpen(true)}
          >
            {link.label}
          </button>
        ) : (
          <Link key={link.label} href={link.href}>{link.label}</Link>
        ),
      )}
    </div>
  );
}
